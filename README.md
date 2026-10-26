# WhatsApp bot

This project runs a WhatsApp bot with message handlers for ping, stickers, text-to-speech, dialogue audio, opt-in AI auto-chat, and incoming voice calls.

## Start it

- `npm start` runs `index.js` once.
- `npm run dev` runs it with nodemon.
- On first connection, scan the QR code shown in the terminal. Login state is kept in `.auth/state.sqlite`.

`index.js` connects the client and imports the message handlers. Each handler registers a `message` listener when imported. `client.js` configures the WhatsApp client, logger, and SQLite-backed session store.

## Message commands

Most commands accept `.`, `!`, `,`, `/`, or `#` as the prefix. For example, `.ping` and `!ping` both work.

| Command | What it does |
| --- | --- |
| `.ping` | Replies `pong`. |
| `.s` with an image | Converts the image into a sticker. |
| `.test [<voiceId>] text` | Converts text into a voice note. The voice ID is optional. |
| `.dialog` or `.dialogs` followed by `1. text 2. text` | Creates a multi-voice dialogue voice note. Voice numbers 1–5 are mapped in `lib/elevenLabs.js`. |
| `.auto` | Enables or disables AI auto-chat for the current conversation. Only messages sent by the bot account can manage it. |
| `.auto_user` | Lists conversations with auto-chat enabled. Bot-account messages only. |
| `.auto_clean_all` | Clears the auto-chat list. Bot-account messages only. |
| Incoming WhatsApp call | Automatically accepts one call at a time and logs when caller audio arrives. |

Dialogue commands use a dot prefix. Sticker commands need the image attached to the command message.

## How the pieces fit

- `lib/commands.js` extracts text from WhatsApp messages and parses the shared command prefixes.
- `test.js`, `test2.js`, and `sticker.js` handle voice, dialogue, and sticker commands.
- `lib/elevenLabs.js` calls ElevenLabs and converts its MP3 output to OGG/Opus with `ffmpeg`.
- `test3.js` handles auto-chat commands, stores the opt-in list through `lib/autoChatUser.js`, gets an AI reply from `lib/paperInstruments.js`, then sends it as a voice note.
- `client.js` enables Zapo's `@zapo-js/voip` plugin; `voip.js` accepts incoming calls and listens for the inbound 16 kHz audio frames.
- The call handler does not speak yet. ElevenLabs needs to be connected to those audio frames and stream its PCM response back into the call.
- The auto-chat list lives in `databases/auto_chat.db`. AI conversation context is held in memory and resets when the process restarts.
- `lib/mistral.js` is a separate Mistral chat implementation and is currently not connected to the running handlers.
- `send.js` is a standalone one-off audio sender; `npm start` does not load it.

Set `ELEVENLABS_API_KEY` and `PAPERINSTRUMENTS_API_KEY` in `.env`. The standalone Mistral module also reads `MISTRAL_API_KEY` and optionally `MISTRAL_AGENT_ID`. `ffmpeg` must be installed and available on `PATH` for audio conversion.
