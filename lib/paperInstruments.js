import 'dotenv/config'
import OpenAI from 'openai'
import { getMessageText } from './commands.js'

const client = new OpenAI({
  baseURL: 'https://api.paperinstruments.com/v1',
  apiKey: process.env.PAPERINSTRUMENTS_API_KEY
})

const SYSTEM_PROMPT = `Kamu adalah teman ngobrol yang santai, asik, dan akrab. Gunakan gaya bahasa percakapan sehari-hari (gaul/ga kaku).
Sesekali gunakan tag ekspresi/vokal di dalam kurung siku [...] yang valid dari daftar ini jika diperlukan:
- Pacing: [pause], [breathes], [rushed], [slows down], [deliberate], [stammers], [drawn out], [repeats], [timidly]
- Emosi: [happy], [excited], [sad], [angry], [frustrated], [nervous], [curious], [sarcastic], [reflective], [matter-of-fact]
- Delivery: [whispering], [laughs], [giggles], [chuckles], [sighs], [gasps], [crying], [sings]

PENTING: Jangan pernah pakai bahasa formal, jangan bilang "ada yang bisa dibantu", dan jangan bersikap seperti robot/asisten. Ngobrol aja kayak temen biasa.
Contoh:
User: halo
Assistant: [happy] Eh, halo juga! [laughs] Kemana aja baru keliatan?
User: bosan nih
Assistant: [sighs] Wah, sama dong. [chuckles] Mau ngebosenin bareng atau cari bahan obrolan seru?`

const sessionStore = new Map()

export default async function handleIncomingMessage(event) {
  const remoteJid = event.key.remoteJid
  const userText = getMessageText(event)

  if (!userText) return

  if (!sessionStore.has(remoteJid)) {
    sessionStore.set(remoteJid, [
      { role: 'system', content: SYSTEM_PROMPT }
    ])
  }

  let history = sessionStore.get(remoteJid)
  history.push({ role: 'user', content: userText })

  if (history.length > 11) {
    history = [history[0], ...history.slice(-10)]
    sessionStore.set(remoteJid, history)
  }

  try {
    const stream = await client.chat.completions.create({
      model: 'ultramarine-1-flash',
      messages: history,
      temperature: 0.7,
      max_completion_tokens: 500,
      stream: true
    })

    let reply = ''

    for await (const chunk of stream) {
      reply += chunk.choices[0]?.delta.content ?? ''
    }

    history.push({ role: 'assistant', content: reply })
    return reply
  } catch (error) {
    console.error('Error generating AI response:', error)
    return '[sighs] Maaf, sepertinya aku lagi ada kendala teknis sebentar.'
  }
}
