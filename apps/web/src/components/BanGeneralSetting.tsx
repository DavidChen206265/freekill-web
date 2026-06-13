import { useMemo, useState } from 'react'
import { useDisableSchemesStore, summarizeDisableScheme } from '../stores/disableSchemesStore.js'
import { tr } from '../i18n/zh.js'

export function BanGeneralSetting({ onClose }: { onClose: () => void }) {
  const { disableSchemes, currentDisableIdx, curScheme, setCurrentIndex, newScheme, clearCurrent, renameCurrent, importCurrent, exportCurrent } = useDisableSchemesStore()
  const [rename, setRename] = useState('')
  const [importText, setImportText] = useState('')
  const [message, setMessage] = useState('')
  const summary = useMemo(() => summarizeDisableScheme(curScheme), [curScheme])

  const doImport = () => {
    let data: unknown
    try { data = JSON.parse(importText) } catch { setMessage('导入失败: 不是合法 JSON'); return }
    if (!importCurrent(data)) { setMessage('导入失败: 结构不合法'); return }
    setImportText('')
    setMessage('导入成功')
  }

  const doExport = () => {
    const text = exportCurrent()
    setImportText(text)
    void navigator.clipboard?.writeText(text).then(() => setMessage('已导出到剪贴板')).catch(() => setMessage('已导出到文本框'))
  }

  const doRename = () => {
    const name = rename.trim()
    if (!name) return
    renameCurrent(name)
    setRename('')
    setMessage('已重命名')
  }

  return (
    <div style={styles.panel}>
      <div style={styles.top}>
        <span style={styles.title}>禁将方案</span>
        <select style={styles.select} value={currentDisableIdx} onChange={(e) => setCurrentIndex(Number(e.target.value))}>
          {disableSchemes.map((s, i) => <option key={i} value={i}>{s.name || `列表${i + 1}`}</option>)}
        </select>
        <button style={styles.btn} type="button" onClick={newScheme}>新建</button>
        <button style={styles.btn} type="button" onClick={clearCurrent}>清空</button>
        <button style={styles.btn} type="button" onClick={doExport}>导出</button>
        <button style={styles.ghost} type="button" onClick={onClose}>返回</button>
      </div>

      <div style={styles.renameRow}>
        <input style={styles.input} value={rename} onChange={(e) => setRename(e.target.value)} placeholder="新方案名" />
        <button style={styles.btn} type="button" disabled={!rename.trim()} onClick={doRename}>重命名</button>
      </div>

      <div style={styles.help}>可在武将一览中进入禁包或禁将编辑。导入/导出内容与原版当前方案 JSON 兼容。</div>

      <div style={styles.importBox}>
        <textarea style={styles.textarea} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="粘贴禁将方案 JSON" />
        <button style={styles.btn} type="button" onClick={doImport}>导入</button>
        {message && <span style={styles.message}>{message}</span>}
      </div>

      <div style={styles.grid}>
        <SummaryColumn title="禁用武将" items={summary.banGenerals} />
        <SummaryColumn title="禁用包" items={summary.banPackages} />
        <SummaryColumn title="白名单武将" items={summary.whitelistGenerals} />
      </div>
    </div>
  )
}

function SummaryColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={styles.column}>
      <h3 style={styles.heading}>{title}</h3>
      <div style={styles.list}>
        {items.length === 0 && <span style={styles.empty}>无</span>}
        {items.map((item) => <span key={item} style={styles.item}>{displayName(item)}</span>)}
      </div>
    </section>
  )
}

function displayName(key: string): string {
  const prefix = key.split('__')[0] ?? key
  const name = tr(key)
  return prefix !== key ? `${name} (${tr(prefix)})` : name
}

const styles: Record<string, React.CSSProperties> = {
  panel: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: '#f5f1e8', color: '#1f1b16', zIndex: 2 },
  top: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 20, fontWeight: 700 },
  select: { minWidth: 180, padding: '7px 9px', border: '1px solid #b9aa8a', background: '#fff', color: '#1f1b16' },
  btn: { padding: '7px 12px', border: '1px solid #8d784d', background: '#5b86a0', color: '#fff', cursor: 'pointer' },
  ghost: { padding: '7px 12px', border: '1px solid #8d784d', background: 'transparent', color: '#1f1b16', cursor: 'pointer' },
  renameRow: { display: 'flex', gap: 8 },
  input: { padding: '7px 9px', border: '1px solid #b9aa8a', minWidth: 220 },
  help: { fontSize: 13, color: '#5f5446' },
  importBox: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  textarea: { flex: 1, minHeight: 74, padding: 8, border: '1px solid #b9aa8a', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 },
  message: { color: '#5f5446', fontSize: 13, paddingTop: 8 },
  grid: { flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 },
  column: { minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #d2c3a3', background: '#fffaf0' },
  heading: { margin: 0, padding: '10px 12px', fontSize: 18, borderBottom: '1px solid #d2c3a3' },
  list: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4, alignContent: 'start', overflowY: 'auto', padding: 10, fontSize: 15 },
  item: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  empty: { color: '#8d8679' },
}
