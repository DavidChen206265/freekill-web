// GameOverModal.tsx — shown when the game ends (GameOverBox.qml). The title is the
// win/lose/draw result (self wins if its role is in the '+'-joined winner string;
// '' = draw, victoryResult). Below is the per-player summary table (general / name
// / result / role / turn / recover / damage / damaged / kill) from the VM's
// GameSummary banner, collapsible via the ➖/➕ toggle. Buttons: Back To Room
// (reset to the waiting room) and Back To Lobby (QuitRoom). (Save/bookmark replay,
// continue-game(1v1), honor column, win audio are out of this batch.)

import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore.js'
import { useVmStore } from '../stores/vmStore.js'
import { useConnectionStore } from '../stores/index.js'
import type { GameSummaryRow } from '../vm/clientVm.js'
import { tr } from '../i18n/zh.js'

function resultOf(winner: string, role?: string): 'win' | 'lose' | 'draw' {
  if (winner === '') return 'draw'
  return role && winner.split('+').includes(role) ? 'win' : 'lose'
}

export function GameOverModal() {
  const winner = useGameStore((s) => s.winner)
  const selfId = useGameStore((s) => s.selfId)
  const players = useGameStore((s) => s.players)
  const vm = useVmStore((s) => s.vm)
  const client = useConnectionStore((s) => s.client)
  const [summary, setSummary] = useState<GameSummaryRow[]>([])
  const [shown, setShown] = useState(true)

  useEffect(() => {
    if (winner === undefined || !vm) { setSummary([]); return }
    setSummary(vm.gameSummary())
  }, [winner, vm])

  if (winner === undefined) return null

  // Back to waiting room (RoomPage.qml resetRoomPage → ResetClientLua): rebuild the
  // client VM (preserves players + owner/ready + capacity from enter_room_data),
  // then re-sync the roster + capacity into the store so the seat grid and the
  // owner controls (add-robot / start) reappear. A bare local reset wiped players
  // and capacity, leaving the waiting room blank for everyone (the bug).
  const backToRoom = async () => {
    if (!vm) { useGameStore.getState().resetGame(); return }
    const { capacity } = vm.resetClientLua()
    useGameStore.getState().backToRoom(capacity)
    try {
      const ps = await vm.readPlayers()
      useGameStore.getState().syncPlayers(ps, false)
    } catch { /* roster re-sync best-effort; seats fill on next server delta */ }
  }

  const selfRole = selfId !== undefined ? players[selfId]?.role : undefined
  const result = resultOf(winner, selfRole)
  const text = result === 'win' ? '胜利' : result === 'lose' ? '失败' : '平局'
  const color = result === 'win' ? '#2ecc71' : result === 'lose' ? '#e74c3c' : '#bbb'

  const cols: { key: keyof GameSummaryRow | 'win'; label: string }[] = [
    { key: 'general', label: '武将' }, { key: 'scname', label: '名字' },
    { key: 'win', label: '胜负' }, { key: 'role', label: '身份' },
    { key: 'turn', label: '回合' }, { key: 'recover', label: '回复' },
    { key: 'damage', label: '伤害' }, { key: 'damaged', label: '受伤' },
    { key: 'kill', label: '击杀' },
  ]
  const genLabel = (r: GameSummaryRow) => {
    const g = r.general ? tr(r.general) : '----'
    return r.deputy ? `${g}/${tr(r.deputy)}` : g
  }
  const rowResult = (r: GameSummaryRow) => {
    const res = resultOf(winner, r.role)
    return res === 'win' ? '胜' : res === 'lose' ? '负' : '平'
  }

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.head}>
          <span style={{ ...styles.title, color }}>{text}</span>
          <button style={styles.toggle} onClick={() => setShown((v) => !v)}>{shown ? '➖' : '➕'}</button>
        </div>
        {shown && summary.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>{cols.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.seat}>
                  <td style={styles.td}>{genLabel(r)}</td>
                  <td style={styles.td}>{r.scname}</td>
                  <td style={styles.td}>{rowResult(r)}</td>
                  <td style={styles.td}>{r.role ? tr(r.role) : ''}</td>
                  <td style={styles.td}>{r.turn}</td>
                  <td style={styles.td}>{r.recover}</td>
                  <td style={styles.td}>{r.damage}</td>
                  <td style={styles.td}>{r.damaged}</td>
                  <td style={styles.td}>{r.kill}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={styles.btns}>
          <button style={styles.btn} onClick={() => void backToRoom()}>返回房间</button>
          <button style={styles.btn} onClick={() => client?.notify('QuitRoom', '')}>返回大厅</button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 120, pointerEvents: 'auto' },
  modal: { background: '#26262b', borderRadius: 12, padding: '24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 780, maxHeight: '85vh', overflow: 'auto' },
  head: { display: 'flex', alignItems: 'center', gap: 16 },
  title: { fontSize: 36, fontWeight: 800, letterSpacing: 4 },
  toggle: { border: 'none', background: 'transparent', color: '#ccc', fontSize: 18, cursor: 'pointer' },
  table: { borderCollapse: 'collapse', color: '#E4D5A0', fontSize: 15 },
  th: { padding: '4px 10px', borderBottom: '1px solid #555', fontWeight: 700, whiteSpace: 'nowrap' },
  td: { padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap' },
  btns: { display: 'flex', gap: 16 },
  btn: { padding: '10px 28px', border: 'none', borderRadius: 6, background: '#0e639c', color: '#fff', fontSize: 16, cursor: 'pointer' },
}
