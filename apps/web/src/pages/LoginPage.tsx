// LoginPage.tsx — gateway URL + username/password, triggers gateway login.

import { useState } from 'react'
import { useConnectionStore } from '../stores/index.js'

export function LoginPage() {
  const { connect, status, detail } = useConnectionStore()
  const [url, setUrl] = useState('ws://localhost:9528')
  const [user, setUser] = useState('webtester')
  const [password, setPassword] = useState('web-m0-pass')

  const busy = status === 'connecting' || status === 'logging-in'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // uuid: stable per browser so asio's ban-by-uuid + device limits behave.
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
          <input style={styles.input} value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
        </label>
        <label style={styles.label}>密码
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button style={styles.button} disabled={busy} type="submit">
          {busy ? '连接中…' : '登录'}
        </button>
        {status === 'failed' && <p style={styles.error}>登录失败{detail ? `: ${detail}` : ''}</p>}
        {status === 'closed' && <p style={styles.error}>连接已关闭{detail ? `: ${detail}` : ''}</p>}
        <p style={styles.hint}>首次登录任意密码即自动注册(asio)。</p>
      </form>
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
}
