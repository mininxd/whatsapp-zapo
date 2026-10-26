import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'

mkdirSync('databases', { recursive: true })

const db = new Database('databases/auto_chat.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS auto_chat_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )
`)

const getUserById = db.prepare('SELECT * FROM auto_chat_users WHERE id = ?')
const getAllUsers = db.prepare('SELECT * FROM auto_chat_users')
const insertUser = db.prepare(
  'INSERT OR REPLACE INTO auto_chat_users (id, name) VALUES (@id, @name)'
)
const removeUserById = db.prepare('DELETE FROM auto_chat_users WHERE id = ?')
const removeAllUsers = db.prepare('DELETE FROM auto_chat_users')

export function getAutoChatUserById(id) {
  return getUserById.get(id)
}

export function getAutoChatUser() {
  return getAllUsers.all()
}

export function insertAutoChatUser(id) {
  return insertUser.run(id)
}

export function removeAutoChatUserById(id) {
  return removeUserById.run(id)
}

export function removeAllAutoChatUsers() {
  return removeAllUsers.run()
}
