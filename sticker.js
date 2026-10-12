import { client } from "./client.js";
import sharp from "sharp";
import { Sticker, StickerTypes } from 'stickers-formatter';

async function convert(buffer) {
  const sharpBuffer = await sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({effort: 6})
    .toBuffer();

  const sticker = new Sticker(sharpBuffer, {
    author: 'mininxd',
    type: StickerTypes.ROUNDED,
  });

  return await sticker.toBuffer();
}



client.on("message", async (event) => {
try {
  const message = event.message;
  if (!message) return;

const text =
  event.message?.conversation ??
  event.message?.extendedTextMessage?.text
  message.imageMessage?.caption ??
  "";
  
if (text.trim().toLowerCase() !== "s") return;


if (!message.imageMessage) {
  await client.message.send(
    event.key.remoteJid,
    "No media provided"
  );
  return;
}

const imageData = await client.message.downloadBytes(event);
const webpBuffer = await convert(imageData);

  
await client.message.send(event.key.remoteJid, {
  type: "sticker",
  media: webpBuffer,
  mimetype: "image/webp"
});

} catch (error) {
  console.error(error)
}
});