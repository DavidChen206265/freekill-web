// VmDebugPanel.tsx — M2 slice-1 surface: shows the client VM boot stats and the
// live notifyUI command feed. No table rendering yet — this proves the VM runs in
// the browser and consumes real server packets.

import { useState } from 'react'
import { useVmStore } from '../stores/vmStore.js'
import { useTimerStore } from '../stores/timerStore.js'
import { useFocusStore } from '../stores/focusStore.js'
import { useDetailStore } from '../stores/detailStore.js'
import { sampleMemory, type MemSample } from '../diag/memStats.js'

export function VmDebugPanel() {
  const { booting, booted, error, stats, notifyCounts, recent, totalFed } = useVmStore()
  const timer = useTimerStore()
  const focus = useFocusStore()
  const detailPid = useDetailStore((s) => s.pid)
  const [mem, setMem] = useState<MemSample | null>(null)
  const [sampling, setSampling] = useState(false)
  const readMem = async () => {
    setSampling(true)
    try { setMem(await sampleMemory()) } finally { setSampling(false) }
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

      <h4 style={styles.h4}>notifyUI 命令计数</h4>
      <div style={styles.counts}>
        {Object.entries(notifyCounts).sort((a, b) => b[1] - a[1]).map(([cmd, n]) => (
          <span key={cmd} style={styles.chip}>{cmd} <b>{n}</b></span>
        ))}
        {Object.keys(notifyCounts).length === 0 && <span style={styles.dim}>(暂无)</span>}
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
  chip: { background: '#2a2a30', borderRadius: 4, padding: '2px 8px', fontSize: 12 },
  feed: { maxHeight: 240, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 11 },
  line: { padding: '2px 0', borderBottom: '1px solid #262630', wordBreak: 'break-all' },
  cmd: { color: '#4ec9b0', fontWeight: 600 },
  btn: { padding: '4px 12px', borderRadius: 5, border: '1px solid #555', background: '#0e639c', color: '#fff', fontSize: 12, cursor: 'pointer', marginBottom: 6 },
}
