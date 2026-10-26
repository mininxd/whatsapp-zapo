import { mkdirSync } from 'node:fs'
import Database from 'better-sqlite3'

mkdirSync('databases', { recursive: true })

const db = new Database('databases/voip_use.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS voip_user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  )
`)

const getUserById = db.prepare('SELECT * FROM voip_user WHERE id = ?')
const getAllUsers = db.prepare('SELECT * FROM voip_user')
const insertUser = db.prepare(
  'INSERT OR REPLACE INTO voip_user (id, name) VALUES (@id, @name)'
)
const removeUserById = db.prepare('DELETE FROM voip_user WHERE id = ?')
const removeAllUsers = db.prepare('DELETE FROM voip_user')

export function getVoipUserById(id) {
  return getUserById.get(id)
}

export function getVoipUser() {
  return getAllUsers.all()
}

export function insertVoipUser(id) {
  return insertUser.run(id)
}

export function removeVoipUserById(id) {
  return removeUserById.run(id)
}

export function removeAllVoipUsers() {
  return removeAllUsers.run()
}
