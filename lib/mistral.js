import { Mistral } from '@mistralai/mistralai';
import Database from 'better-sqlite3';
import "dotenv/config";
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '../chat_history.db'));

// Setup table for per-user chat history
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT    NOT NULL,
    role      TEXT    NOT NULL,
    content   TEXT    NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

const HISTORY_LIMIT = 5;

const getHistory = db.prepare(`
  SELECT role, content FROM chat_history
  WHERE user_id = ?
  ORDER BY id DESC
  LIMIT ${HISTORY_LIMIT}
`);

const insertMessage = db.prepare(`
  INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)
`);

// Keep only the latest HISTORY_LIMIT messages per user
const pruneHistory = db.prepare(`
  DELETE FROM chat_history
  WHERE user_id = ? AND id NOT IN (
    SELECT id FROM chat_history
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ${HISTORY_LIMIT}
  )
`);

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

/**
 * @param {string} userId  - unique sender identifier (e.g. WhatsApp JID)
 * @param {string} userInput - the new message from the user
 * @returns {Promise<string>} - the assistant reply text
 */
export default async function chat(userId, userInput) {
  // Load history (oldest first)
  const history = getHistory.all(userId).reverse();

  const messages = [
    ...history.map(row => ({ role: row.role, content: row.content })),
    { role: 'user', content: userInput },
  ];

  // Stream the response using your own agent
  const stream = await client.agents.stream({
    agentId: process.env.MISTRAL_AGENT_ID || 'ag_01a159f084d871fe9e9a1d252c4f29e8',
    agentVersion: 8,
    messages,
  });

  let reply = '';
  for await (const chunk of stream) {
    const delta = chunk.data.choices[0]?.delta?.content;
    if (delta) reply += delta;
  }

  // Persist user message and assistant reply
  insertMessage.run(userId, 'user', userInput);
  insertMessage.run(userId, 'assistant', reply);

  // Prune to keep only latest HISTORY_LIMIT entries per role pair
  pruneHistory.run(userId, userId);

  return reply;
}

