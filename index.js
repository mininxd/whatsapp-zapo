import { renderQRCodeInTerminal } from '@untools/qr-cli'
import { client, store } from './client.js'

import './ping.js'
import './sticker.js'

export { client, store }

async function renderQR(qr) {
  await renderQRCodeInTerminal(qr, {
    margin: 2,
    small: true
  })
}

client.on('auth_qr', ({ qr }) => {
  renderQR(qr)
})

client.on('connection', (event) => {
  console.log('connection:', event.status, event.reason)
})

await client.connect()
