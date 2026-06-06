// index.ts — gateway entry point.
//
// Loads config (ASIO_HOST required — WSL NAT IP), starts the WSS bridge. Never
// logs passwords or login payloads (R-LOGIN).

import { loadConfig } from './config.js'
import { startWsBridge } from './ws-bridge.js'

function main() {
  const config = loadConfig()
  console.log('[gateway] starting', {
    asio: `${config.asioHost}:${config.asioPort}`,
    wssPort: config.wssPort,
    version: config.fkVersion,
    // md5/user logged; password/uuid intentionally omitted from logs
    md5: config.fkMd5,
    user: config.user,
  })
  const bridge = startWsBridge(config)

  const shutdown = () => {
    console.log('[gateway] shutting down')
    bridge.close().then(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main()
