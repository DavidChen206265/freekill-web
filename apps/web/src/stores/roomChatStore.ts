// roomChatStore.ts — IG-5 in-game (room) chat. Server broadcasts Chat type=2 to room
// players + observers (asio RoomBase::chat); the client VM's ClientBase:chat enriches
// it to { type, sender, msg, general, userName, time } and notifyUI("Chat", ...). We
// keep a rolling room-chat log here (separate from the lobby chat in lobbyStore) and
// the Photo chat bubbles read the latest line per sender.
//
// "Present" messages (送花/砸蛋) are special chat msgs "$@<Type>:<pid>" — those are NOT
// shown as text here; the dispatcher routes them to the present animation instead.

import { create } from 'zustand'

export interface RoomChatLine {
  seq: number
  sender: number
  userName: string
  msg: string
  time: string
}

interface RoomChatState {
  lines: RoomChatLine[]
  /** sender id -> the latest line's {seq,msg} for the transient Photo bubble. */
  bubbles: Record<number, { seq: number; msg: string }>
  append: (line: Omit<RoomChatLine, 'seq'>, seated?: boolean) => void
  /** Clear a sender's bubble once it has faded (ChatBubble ~2.85s). */
  clearBubble: (sender: number, seq: number) => void
  reset: () => void
}

const CAP = 200
let seq = 0

// Present (送花/砸蛋) message format: "$@<Type>:<targetPid>" (WaitingRoom.qml givePresent
// / RoomPage.qml specialChat). Returns {type,to} for a valid present, else null (plain
// text). Exported pure so it's unit-testable without the VM.
export const PRESENT_TYPES = new Set(['Flower', 'Egg', 'GiantEgg', 'Shoe', 'Wine'])
export function parsePresent(msg: string): { type: string; to: number } | null {
  if (!msg.startsWith('$@')) return null
  const body = msg.slice(2)
  const colon = body.indexOf(':')
  if (colon < 0) return null
  const type = body.slice(0, colon)
  const to = Number(body.slice(colon + 1))
  if (!PRESENT_TYPES.has(type) || isNaN(to)) return null
  return { type, to }
}

export const useRoomChatStore = create<RoomChatState>((set) => ({
  lines: [],
  bubbles: {},
  // RoomPage.qml addToChat: every message appends to the chat log; only a SEATED
  // sender (has a photo) also gets a transient Photo bubble — an observer (no photo)
  // goes to the log/danmu only. `seated` defaults true for back-compat; the dispatcher
  // passes whether the sender has a seat so observer chatter never claims a bubble slot.
  append: (line, seated = true) => set((s) => {
    const seqN = ++seq
    const next: Partial<RoomChatState> = { lines: [...s.lines.slice(-(CAP - 1)), { ...line, seq: seqN }] }
    if (seated) next.bubbles = { ...s.bubbles, [line.sender]: { seq: seqN, msg: line.msg } }
    return next
  }),
  clearBubble: (sender, bubbleSeq) => set((s) => {
    // Only clear if it's still the same bubble (a newer message keeps the bubble up).
    if (s.bubbles[sender]?.seq !== bubbleSeq) return {}
    const bubbles = { ...s.bubbles }
    delete bubbles[sender]
    return { bubbles }
  }),
  reset: () => set({ lines: [], bubbles: {} }),
}))
