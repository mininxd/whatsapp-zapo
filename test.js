import { client } from './client.js'
import elevenlabs from './lib/elevenLabs.js'
import { getMessageText, parseCommand } from './lib/commands.js'

client.on('message', async (event) => {
  try {
    if (!event.message) return

    const parsed = parseCommand(getMessageText(event))
    if (parsed?.command !== 'test') return

    const voiceMatch = parsed.query.match(/^<([^>]+)>\s*/)
    const voiceId = voiceMatch?.[1].trim()
    const inputText = voiceMatch
      ? parsed.query.slice(voiceMatch[0].length).trim()
      : parsed.query

    await client.presence.sendChatstate(
      event.key.remoteJid,
      { state: 'recording' }
    )

    const audioBuffer = await elevenlabs(inputText, '', '', voiceId)

    await client.message.send(event.key.remoteJid, {
      type: 'audio',
      media: audioBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    })

    await client.presence.sendChatstate(
      event.key.remoteJid,
      { state: 'paused' }
    )
  } catch (error) {
    console.error(error)
  }
})
