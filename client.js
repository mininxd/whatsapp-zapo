import { mkdir } from 'node:fs/promises'
import { createPinoLogger, createStore, WaClient } from 'zapo-js'
import { createSqliteStore } from '@zapo-js/store-sqlite'
import { voipPlugin } from '@zapo-js/voip'

await mkdir('.auth', { recursive: true })

const logger = await createPinoLogger({
  level: 'info',
  pretty: true
})

export const store = createStore({
  backends: {
    sqlite: createSqliteStore({
      path: '.auth/state.sqlite',
      driver: 'auto'
    })
  },
  providers: {
    auth: 'sqlite',
    signal: 'sqlite',
    preKey: 'sqlite',
    session: 'sqlite',
    identity: 'sqlite',
    senderKey: 'sqlite',
    appState: 'sqlite',
    privacyToken: 'sqlite',
    messages: 'sqlite',
    threads: 'sqlite',
    contacts: 'sqlite'
  }
})

export const client = new WaClient(
  {
    store,
    sessionId: 'default',
    plugins: [voipPlugin()]
  },
  logger
)
