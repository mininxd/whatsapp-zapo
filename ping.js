import { client } from './client.js'

client.on('message', async (event) => {
  console.log(event)
  const text =
    event.message?.conversation ??
    event.message?.extendedTextMessage?.text

  if (text?.trim().toLowerCase() !== 'ping') return

  await client.message.send(event.key.remoteJid, 'pong')
})
