// VmDebugPanel.tsx — M2 slice-1 surface: shows the client VM boot stats and the
// live notifyUI command feed. No table rendering yet — this proves the VM runs in
// the browser and consumes real server packets.

import { useState } from 'react'
import { useVmStore } from '../stores/vmStore.js'
import { useTimerStore } from '../stores/timerStore.js'
import { useFocusStore } from '../stores/focusStore.js'
import { useDetailStore } from '../stores/detailStore.js'
import { sampleMemory, type MemSample } from '../diag/memStats.js'
import { checkAssets, type AssetCheckResult } from '../diag/assetCheck.js'
import { log, setLogLevel, unhandledCommands } from '../diag/log.js'
import type { LogLevel } from '@freekill-web/shared'

export function VmDebugPanel() {
  const { booting, booted, error, stats, notifyCounts, recent, totalFed } = useVmStore()
  const timer = useTimerStore()
  const focus = useFocusStore()
  const detailPid = useDetailStore((s) => s.pid)
  const [mem, setMem] = useState<MemSample | null>(null)
  const [sampling, setSampling] = useState(false)
  const [assetRes, setAssetRes] = useState<AssetCheckResult | null>(null)
  const [assetChecking, setAssetChecking] = useState(false)
  const [assetProgress, setAssetProgress] = useState({ done: 0, total: 0 })
  const [logLevel, setLevelState] = useState<LogLevel>(log.getLevel())
  const [logTick, setLogTick] = useState(0) // force re-render to refresh the log view
  const readMem = async () => {
    setSampling(true)
    try { setMem(await sampleMemory()) } finally { setSampling(false) }
  }
  const runAssetCheck = async () => {
    setAssetChecking(true); setAssetRes(null); setAssetProgress({ done: 0, total: 0 })
    try {
      const res = await checkAssets({ onProgress: (done, total) => setAssetProgress({ done, total }) })
      setAssetRes(res)
    } finally { setAssetChecking(false) }
  }
  const changeLevel = (lvl: LogLevel) => { setLogLevel(lvl); setLevelState(lvl) }
  const exportLog = () => {
    const blob = new Blob([log.export()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `fk-log-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={styles.wrap}>
      <h3 style={styles.h3}>客户端 VM(wasmoon)</h3>

      {/* 计时/焦点/详情 实时状态(诊断进度条与长按) */}
      <div style={styles.stats}>
        <div>计时 running=<b>{String(timer.running)}</b> total={timer.totalMs}ms left={Math.max(0, Math.round((timer.deadline - Date.now()) / 1000))}s</div>
        <div>焦点 ids=[{focus.ids.join(',')}] cmd={focus.command || '—'} dur={focus.durationMs}ms</div>
        <div>详情 pid={detailPid ?? '—'}</div>
      </div>

      {booting && <p style={styles.dim}>启动中(挂载资源 + 引导引擎)…</p>}
      {error && <p style={styles.err}>VM 错误: {error}</p>}
      {booted && stats && (
        <div style={styles.stats}>
          <div>挂载 {stats.mountFiles} 文件 / {stats.mountMs}ms · 引导 {stats.bootMs}ms</div>
          <div style={styles.dim}>
            武将 {stats.engine.generals} · 牌 {stats.engine.cards} · 技能 {stats.engine.skills} · 包 {stats.engine.packages}
          </div>
          <div style={styles.dim}>已喂入 {totalFed} 个服务器包</div>
        </div>
      )}

      <h4 style={styles.h4}>内存诊断(R-PERF/R-VM)</h4>
      <button style={styles.btn} onClick={readMem} disabled={sampling}>{sampling ? '测量中…' : '测量内存'}</button>
      {mem && (
        <div style={styles.stats}>
          {mem.method === 'measureUserAgent' && <div>总内存 <b>{mem.totalMB} MB</b> <span style={styles.dim}>({mem.detail})</span></div>}
          {mem.method === 'performance.memory' && <div>JS 堆 <b>{mem.jsHeapMB} MB</b> <span style={styles.dim}>({mem.detail})</span></div>}
          {mem.method === 'unavailable' && <div style={styles.dim}>{mem.detail}</div>}
          <div style={styles.dim}>已加载图片 {mem.imageCount} 张 / {mem.imageMB} MB</div>
        </div>
      )}

      <h4 style={styles.h4}>资源完整性自检(W1-RES)</h4>
      <button style={styles.btn} onClick={runAssetCheck} disabled={assetChecking}>
        {assetChecking ? `检查中… ${assetProgress.done}/${assetProgress.total}` : '检查资源完整性'}
      </button>
      {assetRes && (
        <div style={styles.stats}>
          <div>
            检查 <b>{assetRes.checked}</b> 项 · 用时 {assetRes.ms}ms ·{' '}
            {assetRes.problems.length === 0
              ? <span style={{ color: '#7CFC8C' }}>全部可用 ✓</span>
              : <span style={styles.err}>{assetRes.problems.length} 项异常</span>}
          </div>
          {assetRes.problems.length > 0 && (
            <div style={styles.assetProblems}>
              {assetRes.problems.slice(0, 60).map((p) => (
                <div key={p.url} style={styles.dim}><b style={{ color: '#f48771' }}>{p.status}</b> {p.url}</div>
              ))}
              {assetRes.problems.length > 60 && <div style={styles.dim}>… 还有 {assetRes.problems.length - 60} 项</div>}
            </div>
          )}
        </div>
      )}

      <h4 style={styles.h4}>notifyUI 命令计数</h4>
      <div style={styles.counts}>
        {Object.entries(notifyCounts).sort((a, b) => b[1] - a[1]).map(([cmd, n]) => (
          <span key={cmd} style={styles.chip}>{cmd} <b>{n}</b></span>
        ))}
        {Object.keys(notifyCounts).length === 0 && <span style={styles.dim}>(暂无)</span>}
      </div>

      <h4 style={styles.h4}>通信日志(net / vm / reply)</h4>
      {(() => { void logTick; return null })()}
      <div style={styles.logCtl}>
        <span style={styles.dim}>console:</span>
        {(['silent', 'warn', 'info', 'debug'] as LogLevel[]).map((lvl) => (
          <button key={lvl} onClick={() => changeLevel(lvl)}
            style={{ ...styles.lvlBtn, ...(logLevel === lvl ? styles.lvlActive : {}) }}>{lvl}</button>
        ))}
        <button style={styles.btn} onClick={() => setLogTick((t) => t + 1)}>刷新</button>
        <button style={styles.btn} onClick={exportLog}>导出 JSON</button>
        <button style={styles.btn} onClick={() => { log.clear(); setLogTick((t) => t + 1) }}>清空</button>
      </div>
      {unhandledCommands().length > 0 ? (
        <div style={styles.unhandled}>
          ⚠ 未消费命令(五谷类隐患): {unhandledCommands().join(', ')}
        </div>
      ) : (
        <div style={styles.okBadge}>✓ 无未消费 notifyUI 命令(计 {log.counts['unhandled'] ?? 0})</div>
      )}
      <div style={styles.feed}>
        {log.recent(60).slice().reverse().map((e) => (
          <div key={e.seq} style={styles.line}>
            <span style={{ ...styles.catTag, ...(catStyle[e.cat] ?? {}) }}>{e.cat}</span>{' '}
            <span style={styles.dim}>{e.msg}</span>
          </div>
        ))}
        {log.recent(1).length === 0 && <span style={styles.dim}>(暂无)</span>}
      </div>

      <h4 style={styles.h4}>最近 notifyUI</h4>
      <div style={styles.feed}>
        {recent.map((e, i) => (
          <div key={i} style={styles.line}>
            <span style={styles.cmd}>{e.command}</span>{' '}
            <span style={styles.dim}>{previewData(e.data)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function previewData(data: unknown): string {
  if (data === null || data === undefined) return ''
  try { return JSON.stringify(data).slice(0, 120) } catch { return String(data) }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: 12, background: '#1b1b1f', borderRadius: 8, fontSize: 13, color: '#ddd' },
  h3: { margin: '0 0 8px', fontSize: 15 },
  h4: { margin: '12px 0 6px', fontSize: 13, color: '#aaa' },
  stats: { display: 'flex', flexDirection: 'column', gap: 2 },
  dim: { color: '#888' },
  err: { color: '#f48771' },
  counts: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  assetProblems: { maxHeight: 180, overflowY: 'auto', marginTop: 4, fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 },
  chip: { background: '#2a2a30', borderRadius: 4, padding: '2px 8px', fontSize: 12 },
  feed: { maxHeight: 240, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 11 },
  line: { padding: '2px 0', borderBottom: '1px solid #262630', wordBreak: 'break-all' },
  cmd: { color: '#4ec9b0', fontWeight: 600 },
  btn: { padding: '4px 12px', borderRadius: 5, border: '1px solid #555', background: '#0e639c', color: '#fff', fontSize: 12, cursor: 'pointer', marginBottom: 6 },
  logCtl: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 6 },
  lvlBtn: { padding: '2px 8px', borderRadius: 4, border: '1px solid #444', background: '#2a2a30', color: '#bbb', fontSize: 11, cursor: 'pointer' },
  lvlActive: { background: '#0e639c', color: '#fff', borderColor: '#0e639c' },
  unhandled: { background: '#5a1d1d', color: '#ffb4a0', borderRadius: 4, padding: '4px 8px', fontSize: 12, marginBottom: 6 },
  okBadge: { background: '#1d3a24', color: '#9fe0a8', borderRadius: 4, padding: '4px 8px', fontSize: 12, marginBottom: 6 },
  catTag: { display: 'inline-block', minWidth: 64, color: '#7aa2c8', fontWeight: 600 },
}

const catStyle: Record<string, React.CSSProperties> = {
  'net-in': { color: '#6fb3d9' },
  'net-out': { color: '#d9b36f' },
  'vm-feed': { color: '#9b8fd9' },
  'vm-notify': { color: '#4ec9b0' },
  reply: { color: '#d98fc8' },
  unhandled: { color: '#f48771' },
  lifecycle: { color: '#888' },
  error: { color: '#f44' },
}
