import { client } from './client.js'
import {
  getAutoChatUser,
  getAutoChatUserById,
  insertAutoChatUser,
  removeAutoChatUserById,
  removeAllAutoChatUsers
} from './lib/autoChatUser.js'
import handleIncomingMessage from './lib/paperInstruments.js'
import elevenlabsTTS from './lib/elevenLabs.js'
import { getMessageText } from './lib/commands.js'

client.on('message', async (event) => {
  const text = getMessageText(event)
  const userId = event.key.remoteJid
  const userName = event.pushName

  if (text === '.auto_user') {
    if (!event.key.fromMe) {
      await client.message.send(userId, 'Not allowed ya sayang...')
      return
    }

    const users = getAutoChatUser()
    const userListText = users.length > 0
      ? JSON.stringify(users, null, 2)
      : 'No users in database.'

    await client.message.send(userId, userListText)
    return
  }

  if (text === '.auto_clean_all') {
    if (!event.key.fromMe) {
      await client.message.send(userId, 'not allowed')
      return
    }

    removeAllAutoChatUsers()
    await client.message.send(userId, 'all user cleared')
    return
  }

  if (text === '.auto') {

    /**
    if (!event.key.fromMe) {
      await client.message.send(userId, 'Not allowed ya sayang...')
      return
    }
**/
    if (getAutoChatUserById(userId)) {
      removeAutoChatUserById(userId)
      await client.message.send(userId, `Auto-chat disabled for ${userName}`)
    } else {
      insertAutoChatUser({ id: userId, name: userName })
      await client.message.send(userId, `Auto-chat enabled for ${userName}`)
    }
    return
  }

  if (!getAutoChatUserById(userId) || text.trim().startsWith('[')) return

  console.log(`Auto-chat responding to ${userId}: ${text}`)

  const reply = await handleIncomingMessage(event)
  if (!reply) return

  try {
    await client.presence.sendChatstate(userId, { state: 'recording' })

    const audioBuffer = await elevenlabsTTS(reply)
    await client.message.send(userId, {
      type: 'audio',
      media: audioBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    })

    await client.presence.sendChatstate(userId, { state: 'paused' })
  } catch (error) {
    console.error('Failed to send voice note:', error)
    await client.message.send(userId, reply)
  }
})
