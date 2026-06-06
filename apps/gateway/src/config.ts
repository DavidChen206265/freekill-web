// config.ts — gateway configuration from environment / CLI.
//
// asio runs in WSL (POSIX-only) with a NAT IP that changes across WSL restarts,
// so ASIO_HOST has no safe default — it must be provided (env or CLI). Everything
// else has a sensible default for local M0 testing.

export interface GatewayConfig {
  asioHost: string
  asioPort: number
  /** Client version reported at Setup; must satisfy asio's >=0.5.19 <0.6.0. */
  fkVersion: string
  /** flist MD5 the server expects (see asio-md5-handshake). Must match server.getMd5(). */
  fkMd5: string
  /** WSS port the browser connects to. */
  wssPort: number
  /** Default login credentials (M0: asio auto-registers unknown users). */
  user: string
  password: string
  /** Client UUID (asio bans by UUID; persisted per browser in production). */
  uuid: string
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

// Parse `--key value` and `--key=value` from argv.
function cliArgs(): Record<string, string> {
  const out: Record<string, string> = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a || !a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq >= 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1)
    } else {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++ }
      else out[a.slice(2)] = 'true'
    }
  }
  return out
}

export function loadConfig(): GatewayConfig {
  const cli = cliArgs()
  const pick = (cliKey: string, envKey: string, dflt?: string): string | undefined =>
    cli[cliKey] ?? env(envKey) ?? dflt

  const asioHost = pick('asio-host', 'ASIO_HOST')
  if (!asioHost) {
    throw new Error(
      'ASIO_HOST is required (WSL NAT IP changes per restart). ' +
      'Pass --asio-host <ip> or set ASIO_HOST. Get it via: wsl -d Ubuntu -- hostname -I',
    )
  }

  return {
    asioHost,
    asioPort: Number(pick('asio-port', 'ASIO_PORT', '9527')),
    fkVersion: pick('fk-version', 'FK_VERSION', '0.5.20')!,
    // Default to the locally-measured value for freekill-core-only; override per server.
    fkMd5: pick('fk-md5', 'FK_MD5', 'e48d6db7c1ea5c6efddcc06fe3071eeb')!,
    wssPort: Number(pick('wss-port', 'WSS_PORT', '9528')),
    user: pick('user', 'FK_USER', 'webtester')!,
    password: pick('password', 'FK_PASS', 'web-m0-pass')!,
    uuid: pick('uuid', 'FK_UUID', 'web-gateway-m0-uuid')!,
  }
}
