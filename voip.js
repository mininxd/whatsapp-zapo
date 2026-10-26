import 'dotenv/config'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { client } from './client.js'
import {
  getVoipUser,
  getVoipUserById,
  insertVoipUser,
  removeVoipUserById,
  removeAllVoipUsers
} from './lib/voipUser.js'
import { getMessageText } from './lib/commands.js'

const apiKey = process.env.ELEVENLABS_API_KEY
const agentId = process.env.ELEVENLABS_AGENT_ID
const elevenLabs = apiKey ? new ElevenLabsClient({ apiKey }) : null

let WHITELIST_MODE = false // When false, all incoming calls are accepted
const CALL_AUDIO_SAMPLE_RATE = 16000
const MAX_PLAYOUT_CHUNK_SAMPLES = 960
const INBOUND_CHUNK_SAMPLES = 3200 // 200ms buffer @ 16kHz for clean VAD/ASR

const acceptingCalls = new Set()
const callSessions = new Map()

client.on('message', async (event) => {
  const text = getMessageText(event)
  const userId = event.rawNode?.attrs?.from ?? event.key?.remoteJid 
  const userName = event.pushName
  const replyTo = event.key?.remoteJid

  if (text === '.voip_whitelist') {
    WHITELIST_MODE = !WHITELIST_MODE
    if (replyTo) {
      await client.message.send(replyTo, `VoIP Whitelist mode is now: ${WHITELIST_MODE ? 'ENABLED (Restricted)' : 'DISABLED (Open to all)'}`)
    }
    return
  }

  if (text === '.voip_user') {
    const users = getVoipUser()
    const userListText = users.length > 0
      ? JSON.stringify(users, null, 2)
      : 'No users in database.'

    if (replyTo) await client.message.send(replyTo, userListText)
    return
  }

  if (text === '.voip_clean_all') {
    removeAllVoipUsers()
    if (replyTo) await client.message.send(replyTo, 'all user cleared')
    return
  }

  if (text === '.voip') {
    if (getVoipUserById(userId)) {
      removeVoipUserById(userId)
      await client.message.send(userId, `Vo-Ip disabled for ${userName}`)
    } else {
      insertVoipUser({ id: userId, name: userName })
      await client.message.send(userId, `Vo-Ip enabled for ${userName}`)
    }
  }
})

if (!apiKey || !agentId) {
  const missing = [
    !apiKey && 'ELEVENLABS_API_KEY',
    !agentId && 'ELEVENLABS_AGENT_ID'
  ].filter(Boolean)

  console.warn(`[voip] auto-answer disabled; add ${missing.join(' and ')} to .env`)
}

function floatPcmToBase64(pcm) {
  const buffer = Buffer.allocUnsafe(pcm.length * 2)

  for (let i = 0; i < pcm.length; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]))
    buffer.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), i * 2)
  }

  return buffer.toString('base64')
}

function base64ToFloatPcm(base64) {
  const buffer = Buffer.from(base64, 'base64')
  const sampleCount = Math.floor(buffer.length / 2)
  const pcm = new Float32Array(sampleCount)

  for (let i = 0; i < sampleCount; i++) {
    pcm[i] = buffer.readInt16LE(i * 2) / 32768
  }

  return pcm
}

function sendToAgent(session, message) {
  if (session.socket?.readyState !== WebSocket.OPEN) return false

  session.socket.send(JSON.stringify(message))
  return true
}

function isCallerAllowed(call, event) {
  // If whitelist mode is off, accept all callers
  if (!WHITELIST_MODE) return true

  const callerJids = [
    call.peerJid,
    call.callerPn,
    event?.key?.remoteJid,
    event?.key?.remoteJidAlt,
    call.event?.key?.remoteJid,
    call.event?.key?.remoteJidAlt,
    call.key?.remoteJid,
    call.key?.remoteJidAlt
  ]

  return callerJids
    .filter((jid) => typeof jid === 'string' && jid.length > 0)
    .some((jid) => getVoipUserById(jid))
}

function queueCallerAudio(session, pcm) {
  if (session.stopped) return

  // Accumulate incoming samples into a single buffer
  const combined = new Float32Array(session.inboundAccumulator.length + pcm.length)
  combined.set(session.inboundAccumulator, 0)
  combined.set(pcm, session.inboundAccumulator.length)
  session.inboundAccumulator = combined

  // Dispatch frames once accumulated chunk reaches desired duration (~200ms)
  while (session.inboundAccumulator.length >= INBOUND_CHUNK_SAMPLES) {
    const chunk = session.inboundAccumulator.subarray(0, INBOUND_CHUNK_SAMPLES)
    session.inboundAccumulator = session.inboundAccumulator.subarray(INBOUND_CHUNK_SAMPLES)

    const base64Audio = floatPcmToBase64(chunk)
    sendToAgent(session, { user_audio_chunk: base64Audio })
  }
}

function takeAgentAudio(session, sampleCount) {
  const output = new Float32Array(sampleCount)
  let written = 0

  while (written < sampleCount) {
    const next = session.pendingAgentAudio[0]
    if (!next) break

    const count = Math.min(sampleCount - written, next.pcm.length - next.offset)
    output.set(next.pcm.subarray(next.offset, next.offset + count), written)
    next.offset += count
    written += count

    if (next.offset === next.pcm.length) session.pendingAgentAudio.shift()
  }

  session.pendingAgentAudioSamples -= written
  return written === sampleCount ? output : output.subarray(0, written)
}

function stopAgentAudioPump(session) {
  if (session.agentAudioPump) clearInterval(session.agentAudioPump)
  session.agentAudioPump = null
}

function pumpAgentAudio(callId, session) {
  const drain = () => {
    if (session.stopped) {
      stopAgentAudioPump(session)
      return
    }

    try {
      const { pauseMs } = client.voip.getFeedWatermarksMs()
      let bufferedMs = client.voip.getLiveBufferMs(callId)

      while (session.pendingAgentAudioSamples > 0 && bufferedMs < pauseMs) {
        const remainingBeforePause = Math.max(
          1,
          Math.floor((pauseMs - bufferedMs) * CALL_AUDIO_SAMPLE_RATE / 1000)
        )
        const sampleCount = Math.min(
          MAX_PLAYOUT_CHUNK_SAMPLES,
          session.pendingAgentAudioSamples,
          remainingBeforePause
        )
        const pcm = takeAgentAudio(session, sampleCount)
        if (pcm.length === 0) break

        bufferedMs = client.voip.feedLiveAudio(callId, pcm)
      }

      if (session.pendingAgentAudioSamples === 0) stopAgentAudioPump(session)
    } catch (error) {
      stopAgentAudioPump(session)
      console.error(`[voip] could not stream ElevenLabs audio for ${callId}:`, error)
    }
  }

  if (!session.agentAudioPump) {
    session.agentAudioPump = setInterval(drain, 20)
    session.agentAudioPump.unref?.()
  }

  drain()
}

function queueAgentAudio(callId, session, pcm) {
  if (pcm.length === 0) return

  session.pendingAgentAudio.push({ pcm, offset: 0 })
  session.pendingAgentAudioSamples += pcm.length
  pumpAgentAudio(callId, session)
}

function stopCallSession(callId) {
  const session = callSessions.get(callId)
  if (!session) return

  session.stopped = true
  stopAgentAudioPump(session)
  session.pendingAgentAudio.length = 0
  session.pendingAgentAudioSamples = 0
  session.inboundAccumulator = new Float32Array(0)
  callSessions.delete(callId)

  if (session.socket?.readyState === WebSocket.OPEN) {
    session.socket.close()
  }
}

async function endCallAfterAgentFailure(callId) {
  stopCallSession(callId)

  try {
    await client.voip.endCall(callId)
  } catch (error) {
    console.error(`[voip] could not end failed call ${callId}:`, error)
  }
}

function startAgentSession(call, event) {
  if (!elevenLabs || !agentId || !isCallerAllowed(call, event) || callSessions.has(call.callId)) return

  const session = {
    socket: null,
    inboundAccumulator: new Float32Array(0),
    pendingAgentAudio: [],
    pendingAgentAudioSamples: 0,
    agentAudioPump: null,
    lastInterruptionId: 0,
    stopped: false
  }

  callSessions.set(call.callId, session)

  try {
    client.voip.setExternalAudioMode(call.callId, true)
  } catch (error) {
    console.error(`[voip] could not enable call audio for ${call.callId}:`, error)
    void endCallAfterAgentFailure(call.callId)
    return
  }

  void (async () => {
    try {
      const { signedUrl } = await elevenLabs.conversationalAi.conversations.getSignedUrl({
        agentId
      })

      if (session.stopped) return

      const socket = new WebSocket(signedUrl)
      session.socket = socket

      socket.onopen = () => {
        if (session.stopped) {
          socket.close()
          return
        }

        sendToAgent(session, {
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            user: {
              input_audio_format: 'pcm_16000'
            }
          }
        })

        console.log(`[voip] ElevenLabs connected for ${call.callId}`)
      }

      socket.onmessage = async ({ data }) => {
        if (session.stopped) return

        try {
          const raw = typeof data === 'string'
            ? data
            : typeof data?.text === 'function'
              ? await data.text()
              : Buffer.from(data).toString('utf8')
          const message = JSON.parse(raw)

          if (message.type === 'ping') {
            sendToAgent(session, {
              type: 'pong',
              event_id: message.ping_event.event_id
            })
            return
          }

          if (message.type === 'interruption') {
            session.lastInterruptionId = Number(message.interruption_event.event_id) || 0
            session.pendingAgentAudio.length = 0
            session.pendingAgentAudioSamples = 0
            stopAgentAudioPump(session)
            return
          }

          if (message.type === 'audio') {
            const audio = message.audio_event
            const eventId = Number(audio.event_id)
            if (Number.isFinite(eventId) && eventId <= session.lastInterruptionId) return

            const pcm = base64ToFloatPcm(audio.audio_base_64)
            queueAgentAudio(call.callId, session, pcm)
            return
          }

          if (message.type === 'user_transcript') {
            console.log(`[voip] Transcribed input:`, message.user_transcription_event?.user_transcript)
          }
        } catch (error) {
          console.error(`[voip] invalid ElevenLabs event for ${call.callId}:`, error)
        }
      }

      socket.onerror = (err) => {
        if (session.stopped) return
        console.error(`[voip] ElevenLabs connection error for ${call.callId}:`, err)
        void endCallAfterAgentFailure(call.callId)
      }

      socket.onclose = (ev) => {
        if (session.stopped) return
        console.warn(`[voip] ElevenLabs disconnected for ${call.callId} (code: ${ev.code}, reason: ${ev.reason})`)
        void endCallAfterAgentFailure(call.callId)
      }
    } catch (error) {
      console.error(`[voip] could not start ElevenLabs for ${call.callId}:`, error)
      void endCallAfterAgentFailure(call.callId)
    }
  })()
}

async function acceptWhenReady(call, event) {
  if (!apiKey || !agentId || !isCallerAllowed(call, event) || !call.canAccept || acceptingCalls.has(call.callId)) return

  acceptingCalls.add(call.callId)

  try {
    await client.voip.acceptCall(call.callId)
    console.log(`[voip] accepted ${call.callId} from ${call.peerJid}`)
  } catch (error) {
    acceptingCalls.delete(call.callId)
    console.error(`[voip] could not accept ${call.callId}:`, error)
  }
}

client.on('voip_call_incoming', (call, event) => {
  console.log(`[voip] incoming ${call.callId} from ${call.peerJid}`)

  if (!isCallerAllowed(call, event)) {
    console.log(`[voip] ignored ${call.callId}; caller is not whitelisted`)
    return
  }

  if (!apiKey || !agentId) return
  if (!call.canAccept) {
    console.log(`[voip] ${call.callId} is waiting for a call slot`)
    return
  }

  void acceptWhenReady(call, event)
})

client.on('voip_call_state', (call, event) => {
  if (call.canAccept && isCallerAllowed(call, event)) void acceptWhenReady(call, event)
  if (call.stateData.state === 'active') startAgentSession(call, event)
})

client.on('voip_call_inbound_audio', ({ call, pcm }) => {
  const session = callSessions.get(call.callId)
  if (session && !session.stopped) queueCallerAudio(session, pcm)
})

client.on('voip_call_ended', (call) => {
  acceptingCalls.delete(call.callId)
  stopCallSession(call.callId)
  console.log(`[voip] ended ${call.callId}`)
})

client.on('voip_call_error', (error) => {
  console.error('[voip] call error:', error)
})
