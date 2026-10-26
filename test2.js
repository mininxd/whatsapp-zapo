import { client } from './client.js'
import { dialogs } from './lib/elevenLabs.js'
import { getMessageText } from './lib/commands.js'

client.on('message', async (event) => {
  try {
    if (!event.message) return

    const text = getMessageText(event).trim()
    const prefixMatch = text.match(/^\.dialogs?\s+/i)
    if (!prefixMatch) return

    const dialogText = text.slice(prefixMatch[0].length).trim()
    if (!dialogText) return

    await client.presence.sendChatstate(
      event.key.remoteJid,
      { state: 'recording' }
    )

    const audioBuffer = await dialogs(dialogText)

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
