import { client } from './client.js'
import { getMessageText, parseCommand } from './lib/commands.js'

client.on('message', async (event) => {
  console.log(event)
  const command = parseCommand(getMessageText(event))
  if (command?.command !== 'ping') return

  await client.message.send(event.key.remoteJid, 'pong')
})
