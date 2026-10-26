import { client } from './client.js'
import sharp from 'sharp'
import { Sticker, StickerTypes } from 'stickers-formatter'
import { getMessageText, parseCommand } from './lib/commands.js'

async function convertToSticker(imageBuffer) {
  const webpBuffer = await sharp(imageBuffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ effort: 6 })
    .toBuffer()

  const sticker = new Sticker(webpBuffer, {
    author: 'mininxd',
    type: StickerTypes.ROUNDED
  })

  return sticker.toBuffer()
}

client.on('message', async (event) => {
  try {
    const message = event.message
    const command = parseCommand(getMessageText(event))

    if (!message || command?.command !== 's') return

    if (!message.imageMessage) {
      await client.message.send(event.key.remoteJid, 'No media provided')
      return
    }

    const imageBuffer = await client.message.downloadBytes(event)
    const stickerBuffer = await convertToSticker(imageBuffer)

    await client.message.send(event.key.remoteJid, {
      type: 'sticker',
      media: stickerBuffer,
      mimetype: 'image/webp'
    })
  } catch (error) {
    console.error(error)
  }
})
