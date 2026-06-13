// CreateRoomDialog.tsx — create a room. Sends CreateRoom:
//   [name, capacity, timeout, settings]   (asio Lobby::createRoom)
// settings mirrors the QML client's object (gameMode/roomName/password/_game/disabled*).
// IG-1: the room owner configures the operation timeout + the _game board settings
// (generalNum/generalTimeout/luckTime + deputy/free-assign/observer-view switches).
// Field ranges/defaults mirror freekill-core lunarltk/init.lua (SpinRow from/to) +
// RoomGeneralSettings.qml (operation timeout 10–60; we allow up to 90, default 30).

import { useEffect, useMemo, useState } from 'react'
import { useConnectionStore } from '../stores/index.js'
import { CatalogVm } from '../vm/catalogVm.js'
import { buildDisabledPayload, useDisableSchemesStore } from '../stores/disableSchemesStore.js'
import { useServerManifestStore } from '../stores/serverManifestStore.js'

export function CreateRoomDialog({ onClose }: { onClose: () => void }) {
  const client = useConnectionStore((s) => s.client)
  const curScheme = useDisableSchemesStore((s) => s.curScheme)
  const saveSchemes = useDisableSchemesStore((s) => s.save)
  const hiddenPacks = useServerManifestStore((s) => s.hiddenPacks)
  const [name, setName] = useState('Web测试房')
  const [capacity, setCapacity] = useState(2)
  const [gameMode, setGameMode] = useState('aaa_role_mode')
  const [password, setPassword] = useState('')
  // Operation (request) timeout — CreateRoom[2]. QML is 10–60; we allow up to 90 and
  // default to a snappier 30 (the per-request window; luck card / general pick have
  // their own timeouts and are unaffected).
  const [timeoutSec, setTimeoutSec] = useState(30)
  // _game board settings (lunarltk/init.lua SpinRow ranges; `from` is the default).
  const [generalNum, setGeneralNum] = useState(3)          // 3–18
  const [generalTimeout, setGeneralTimeout] = useState(15) // 10–60
  const [luckTime, setLuckTime] = useState(0)              // 0–8 (0 = luck card off)
  const [enableDeputy, setEnableDeputy] = useState(false)
  const [enableFreeAssign, setEnableFreeAssign] = useState(false)
  const [freeAssignRespectBan, setFreeAssignRespectBan] = useState(false)
  const [enableObserverViewCard, setEnableObserverViewCard] = useState(false)
  const [catalog, setCatalog] = useState<CatalogVm | null>(null)
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    let alive = true
    const vm = new CatalogVm()
    void vm.boot()
      .then(() => { if (alive) setCatalog(vm); else vm.close() })
      .catch((err) => { if (alive) setCatalogError(err instanceof Error ? err.message : String(err)) })
    return () => { alive = false; vm.close() }
  }, [])

  const disabledPayload = useMemo(() => {
    if (!catalog) return { disabledPack: [] as string[], disabledGenerals: [] as string[] }
    const boardgameName = gameMode === 'aaa_role_mode' ? 'lunarltk' : ''
    return buildDisabledPayload(curScheme, (pack) => catalog.generals(pack), hiddenPacks, boardgameName)
  }, [catalog, curScheme, gameMode, hiddenPacks])

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!catalog) return
    saveSchemes()
    // The _game block is REQUIRED — generalNum drives general selection; without it
    // the server can't ask for generals and the game degenerates instantly.
    const settings = {
      gameMode,
      roomName: name,
      password,
      _game: { generalNum, generalTimeout, luckTime, enableFreeAssign, freeAssignRespectBan, enableDeputy, enableObserverViewCard },
      _mode: {},
      disabledPack: disabledPayload.disabledPack,
      disabledGenerals: disabledPayload.disabledGenerals,
    }
    client?.notify('CreateRoom', [name, capacity, timeoutSec, settings])
    onClose()
  }

  return (
    // 点遮罩空白处不关闭(3a):只能用「取消」按钮关,避免填了一半误点丢失。
    <div style={styles.backdrop}>
      <form style={styles.card} onSubmit={create}>
        <h2 style={styles.title}>创建房间</h2>
        <label style={styles.label}>房名
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={styles.label}>人数
          <input style={styles.input} type="number" min={2} max={8} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        </label>
        <label style={styles.label}>模式
          <select style={styles.input} value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
            <option value="aaa_role_mode">身份模式</option>
          </select>
        </label>
        <label style={styles.label}>密码(可选)
          <input style={styles.input} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <SpinRow label="思考时间" suffix="s" min={10} max={90} value={timeoutSec} onChange={setTimeoutSec} />
        <SpinRow label="选将数" min={3} max={18} value={generalNum} onChange={setGeneralNum} />
        <SpinRow label="选将时间" suffix="s" min={10} max={60} value={generalTimeout} onChange={setGeneralTimeout} />
        <SpinRow label="手气卡次数" min={0} max={8} value={luckTime} onChange={setLuckTime} />

        <SwitchRow label="启用副将" checked={enableDeputy} onChange={setEnableDeputy} />
        <SwitchRow label="自由选将" checked={enableFreeAssign} onChange={setEnableFreeAssign} />
        <SwitchRow label="禁将限制自由选将" checked={freeAssignRespectBan} onChange={setFreeAssignRespectBan} />
        <SwitchRow label="旁观可见手牌" checked={enableObserverViewCard} onChange={setEnableObserverViewCard} />
        <div style={styles.banSummary}>
          禁用包 {disabledPayload.disabledPack.length} · 禁用武将 {disabledPayload.disabledGenerals.length}
          {!catalog && !catalogError && <span> · 正在读取禁将数据</span>}
          {catalogError && <span> · 读取失败: {catalogError}</span>}
        </div>

        <div style={styles.actions}>
          <button style={styles.ghost} type="button" onClick={onClose}>取消</button>
          <button style={styles.primary} type="submit" disabled={!catalog}>创建</button>
        </div>
      </form>
    </div>
  )
}

// A clamped numeric stepper (mirrors QML SpinRow): −/value/+ with min/max bounds.
function SpinRow({ label, value, min, max, suffix, onChange }: {
  label: string; value: number; min: number; max: number; suffix?: string
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v) || min))
  return (
    <div style={styles.spinRow}>
      <span style={styles.spinLabel}>{label}</span>
      <div style={styles.spinCtl}>
        <button type="button" style={styles.stepBtn} onClick={() => onChange(clamp(value - 1))} aria-label={`减少${label}`}>−</button>
        <input
          style={styles.spinInput} type="number" min={min} max={max} value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
        <button type="button" style={styles.stepBtn} onClick={() => onChange(clamp(value + 1))} aria-label={`增加${label}`}>+</button>
        {suffix && <span style={styles.spinSuffix}>{suffix}</span>}
      </div>
    </div>
  )
}

// A labelled checkbox (mirrors QML SwitchRow).
function SwitchRow({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={styles.switchRow}>
      <span style={styles.spinLabel}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 70 },
  card: { display: 'flex', flexDirection: 'column', gap: 10, width: 320, maxHeight: '88vh', overflowY: 'auto', padding: 24, background: '#26262b', borderRadius: 10, color: '#eee' },
  title: { margin: 0, fontSize: 18 },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#bbb' },
  input: { padding: '7px 9px', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  ghost: { padding: '7px 14px', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: '#ccc', cursor: 'pointer' },
  primary: { padding: '7px 14px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', cursor: 'pointer' },
  spinRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#bbb' },
  spinLabel: { color: '#bbb' },
  spinCtl: { display: 'flex', alignItems: 'center', gap: 4 },
  stepBtn: { width: 26, height: 26, lineHeight: '24px', textAlign: 'center', padding: 0, borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee', cursor: 'pointer', fontSize: 15 },
  spinInput: { width: 46, padding: '5px 4px', textAlign: 'center', borderRadius: 6, border: '1px solid #444', background: '#1b1b1f', color: '#eee' },
  spinSuffix: { width: 14, color: '#888', fontSize: 12 },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#bbb', cursor: 'pointer' },
  banSummary: { fontSize: 12, color: '#aaa' },
}

