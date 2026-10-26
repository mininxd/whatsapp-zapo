import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import 'dotenv/config'
import { spawn } from 'node:child_process'
import Rand from 'rand-seed'

const randomSeed = new Rand('1234567890')
const elevenLabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
})

function convertMp3ToOgg(mp3Buffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'mp3',
      '-i', 'pipe:0',
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '64k',
      '-f', 'ogg',
      'pipe:1'
    ])

    const chunks = []
    let stderr = ''

    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk))
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks))
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })
    ffmpeg.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error)
    })
    ffmpeg.stdin.end(mp3Buffer)
  })
}

async function collectAudio(stream) {
  const chunks = []

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks)
}

export default async function elevenlabsTTS(
  text,
  backgroundNoiseId = '',
  environmentId = '',
  voiceId = 'uQyqjJGSy9EJK7ZcWe4B'
) {
  try {
    const seed = Number(randomSeed.next().toString().split('.')[1])
    const audioStream = await elevenLabs.textToSpeech.convert(voiceId, {
      text,
      modelId: 'eleven_v4_turbo',
      outputFormat: 'mp3_44100_128',
      background_noise_id: backgroundNoiseId,
      environment_id: environmentId,
      seed
    })

    const mp3Buffer = await collectAudio(audioStream)
    return convertMp3ToOgg(mp3Buffer)
  } catch (error) {
    console.error('ElevenLabs TTS error:', error)
    throw error
  }
}

const VOICE_MAP = {
  1: 'tCKeP99grYL9wZRg6sQ9',
  2: 'RbNgJzKAV7jpYJNtCBpj',
  3: 'uQyqjJGSy9EJK7ZcWe4B',
  4: 'R2tdno8o9nwUiDvfnMIJ',
  5: 'ZowYWFat3iypr7PwKMPb'
}

function parseDialogLines(raw) {
  const cleaned = raw.replace(/<break\s*\/?>/gi, ' ').trim()
  const parts = cleaned.split(/(?=\d+\.\s*)/).map((part) => part.trim()).filter(Boolean)

  return parts.map((part) => {
    const match = part.match(/^(\d+)\.\s*([\s\S]+)$/)
    if (!match) throw new Error(`Bad dialog format: "${part}"`)

    const voiceId = VOICE_MAP[Number(match[1])]
    if (!voiceId) throw new Error(`No voice registered for number ${match[1]}`)

    return { voiceId, text: match[2].trim() }
  })
}

export async function dialogs(raw) {
  const inputs = parseDialogLines(raw)
  const audioStream = await elevenLabs.textToDialogue.convert({ inputs })
  const mp3Buffer = await collectAudio(audioStream)

  return convertMp3ToOgg(mp3Buffer)
}
