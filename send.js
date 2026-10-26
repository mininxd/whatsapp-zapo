import { client } from './client.js'
import elevenlabs from './lib/elevenLabs.js'

const recipients = {
  me: '6289501303263@s.whatsapp.net',
  ken: '6285158771346@s.whatsapp.net',
  grup: '120363024100610581@g.us',
  andre: '6282225061544@s.whatsapp.net',
  johan: '6285781533927@s.whatsapp.net'
}

client.on('connection', async (event) => {
  if (event.status === 'open') {
    const audioBuffer = await elevenlabs('[excited] hehehe')
    await sendVoiceNote(recipients.johan, audioBuffer)
  }

  if (event.status === 'close') {
    console.log('Connection closed:', event.reason)
    process.exit(1)
  }
})

async function sendVoiceNote(jid, audioBuffer) {
  await client.presence.sendChatstate(jid, { state: 'recording' })
  await client.message.send(jid, {
    type: 'audio',
    media: audioBuffer,
    mimetype: 'audio/ogg; codecs=opus',
    ptt: true
  })
  await client.presence.sendChatstate(jid, { state: 'paused' })

  console.log('Message sent!')
  process.exit(0)
}

await client.connect()
