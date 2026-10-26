export function getMessageText(event) {
  return (
    event.message?.conversation ??
    event.message?.extendedTextMessage?.text ??
    event.message?.imageMessage?.caption ??
    ''
  )
}

export function parseCommand(text) {
  const trimmedText = text.trim()
  const prefixes = ['.', '!', ',', '/', '#']
  const prefix = prefixes.find((candidate) => trimmedText.startsWith(candidate))

  if (!prefix) return null

  const parts = trimmedText.slice(prefix.length).trim().split(/\s+/)
  const command = (parts.shift() ?? '').toLowerCase()

  return { command, args: parts, query: parts.join(' ') }
}
