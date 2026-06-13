// LoginPage.tsx — gateway URL + username/password, triggers gateway login.

import { useEffect, useRef, useState } from 'react'
import { useConnectionStore } from '../stores/index.js'
import { unlockAudio } from '../table/audio.js'

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error'
type ConsoleEntry = {
  id: number
  level: ConsoleMethod
  time: string
  text: string
}
type ConsoleFn = (...args: unknown[]) => void

const consoleMethods: ConsoleMethod[] = ['log', 'info', 'warn', 'error']

function formatConsoleArg(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

// Default gateway URL. In dev (vite on :5173) point at the local gateway on :9528.
// In production the page is served behind a reverse proxy (Caddy) that forwards
// `/ws` to the gateway on the SAME origin — so use a same-origin wss:// URL, which
// also gives WSS automatically when the page is https. Overridable via the input
// (and VITE_GATEWAY_URL at build time) for non-standard setups.
function defaultGatewayUrl(): string {
  const fromEnv = import.meta.env.VITE_GATEWAY_URL as string | undefined
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') {
    const { protocol, host, hostname } = window.location
    // Dev: vite dev server → talk to the standalone gateway on :9528.
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'ws://localhost:9528'
    // Prod: same-origin /ws, ws/wss matching the page's http/https.
    return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`
  }
  return 'ws://localhost:9528'
}

function MobileConsolePanel() {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<ConsoleEntry[]>([])
  const nextId = useRef(1)

  useEffect(() => {
    const consoleRef = console as unknown as Record<ConsoleMethod, ConsoleFn>
    const originals = {} as Record<ConsoleMethod, ConsoleFn>
    const push = (level: ConsoleMethod, args: unknown[]) => {
      const entry: ConsoleEntry = {
        id: nextId.current++,
        level,
        time: new Date().toLocaleTimeString(),
        text: args.map(formatConsoleArg).join(' '),
      }
      setLogs((prev) => [...prev.slice(-119), entry])
    }

    for (const method of consoleMethods) {
      originals[method] = consoleRef[method].bind(console)
      consoleRef[method] = (...args: unknown[]) => {
        originals[method](...args)
        push(method, args)
      }
    }

    const onError = (event: ErrorEvent) => {
      push('error', [event.message, event.filename, event.lineno, event.colno])
    }
    const onUnhandled = (event: PromiseRejectionEvent) => {
      push('error', ['Unhandled rejection', event.reason])
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
      for (const method of consoleMethods) consoleRef[method] = originals[method]
    }
  }, [])

  const logText = logs.map((l) => `[${l.time}] ${l.level}: ${l.text}`).join('\n')
  const copyLogs = () => {
    void navigator.clipboard?.writeText(logText).catch(() => undefined)
  }

  return (
    <div style={styles.consoleWrap}>
      {open && (
        <div style={styles.consolePanel}>
          <div style={styles.consoleHeader}>
            <strong>控制台</strong>
            <div style={styles.consoleActions}>
              <button style={styles.consoleButton} type="button" onClick={copyLogs} disabled={logs.length === 0}>复制</button>
              <button style={styles.consoleButton} type="button" onClick={() => setLogs([])}>清空</button>
              <button style={styles.consoleButton} type="button" onClick={() => setOpen(false)}>关闭</button>
            </div>
          </div>
          <div style={styles.consoleLog}>
            {logs.length === 0 ? (
              <div style={styles.consoleEmpty}>暂无日志</div>
            ) : logs.map((entry) => (
              <div key={entry.id} style={entry.level === 'error' ? styles.consoleErrorLine : styles.consoleLine}>
                <span style={styles.consoleMeta}>[{entry.time}] {entry.level}</span> {entry.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {!open && (
        <button style={styles.consoleToggle} type="button" onClick={() => setOpen(true)}>
          控制台
          {logs.length > 0 ? ` ${logs.length}` : ''}
        </button>
      )}
    </div>
  )
}

export function LoginPage() {
  const { connect, status, detail, kickedMessage } = useConnectionStore()
  const [url, setUrl] = useState(defaultGatewayUrl())
  // 不再预填 webtester 默认账号(3c):避免大家图方便都登同一个账号互相顶号。
  // 老用户的凭据由 connectionStore 持久化 + tryAutoLogin 回填,不受此空默认影响。
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')

  const busy = status === 'connecting' || status === 'logging-in'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Unlock audio on this user gesture so in-game sounds can play (browsers block
    // autoplay until the first interaction). See table/audio.ts.
    unlockAudio()
    // uuid: stable per browser so asio's ban-by-uuid + device limits behave.
    // The connection store persists {url,user,password,uuid} for seamless reconnect
    // (R2; see store CRED_KEY + risk R-CRED for the plaintext-storage tradeoff).
    let uuid = localStorage.getItem('fk-uuid')
    if (!uuid) { uuid = `web-${crypto.randomUUID()}`; localStorage.setItem('fk-uuid', uuid) }
    connect(url, { user, password, uuid })
  }

  return (
    <div style={styles.wrap}>
      <form style={styles.card} onSubmit={onSubmit}>
        <h1 style={styles.title}>FreeKill Web</h1>
        <label style={styles.label}>网关地址
          <input style={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label style={styles.label}>用户名
          <input style={styles.input} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" placeholder="自己起一个用户名" />
        </label>
        <label style={styles.label}>密码
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="自己设一个密码" />
        </label>
        <button style={styles.button} disabled={busy} type="submit">
          {busy ? '连接中…' : '登录'}
        </button>
        {/* IG-7: duplicate-login kick — explain why we stopped (no auto-reconnect war). */}
        {kickedMessage && <p style={styles.error}>{kickedMessage}</p>}
        {status === 'failed' && <p style={styles.error}>登录失败{detail ? `: ${detail}` : ''}</p>}
        {status === 'closed' && !kickedMessage && <p style={styles.error}>连接已关闭{detail ? `: ${detail}` : ''}</p>}
        <p style={styles.hint}>请创建你自己的账号:首次登录用任意用户名+密码即自动注册。请勿共用账号,否则会互相顶号下线。</p>
      </form>
      <MobileConsolePanel />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#1b1b1f', color: '#eee', fontFamily: 'system-ui, sans-serif' },
  card: { display: 'flex', flexDirection: 'column', gap: 12, width: 320, padding: 28, background: '#26262b', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,.4)' },
  title: { margin: '0 0 8px', fontSize: 22, textAlign: 'center' },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bbb' },
  input: { padding: '8px 10px', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee', fontSize: 14 },
  button: { marginTop: 8, padding: '10px', borderRadius: 6, border: 'none', background: '#0e639c', color: '#fff', fontSize: 15, cursor: 'pointer' },
  error: { color: '#f48771', fontSize: 13, margin: 0 },
  hint: { color: '#777', fontSize: 12, margin: 0, textAlign: 'center' },
  consoleWrap: { position: 'fixed', right: 10, bottom: 10, zIndex: 1000, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' },
  consoleToggle: { padding: '8px 10px', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 12 },
  consolePanel: { width: 'min(92vw, 520px)', maxHeight: '55vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(255,255,255,.18)', borderRadius: 6, background: 'rgba(13,13,16,.96)', color: '#eee', boxShadow: '0 8px 28px rgba(0,0,0,.45)' },
  consoleHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 8px', borderBottom: '1px solid rgba(255,255,255,.12)', fontSize: 12 },
  consoleActions: { display: 'flex', gap: 5 },
  consoleButton: { padding: '4px 7px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 5, background: '#24242a', color: '#eee', fontSize: 11 },
  consoleLog: { overflowY: 'auto', padding: 8, fontSize: 11, lineHeight: 1.45, wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  consoleLine: { color: '#ddd', marginBottom: 4 },
  consoleErrorLine: { color: '#f48771', marginBottom: 4 },
  consoleMeta: { color: '#8ab4f8' },
  consoleEmpty: { color: '#888' },
}
