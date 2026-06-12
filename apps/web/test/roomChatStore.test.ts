// roomChatStore tests (IG-5) — in-game chat log + bubble lifecycle, and the present
// (送花/砸蛋) message parser parsePresent.

import { describe, it, expect, beforeEach } from 'vitest'
import { useRoomChatStore, parsePresent } from '../src/stores/roomChatStore.js'

beforeEach(() => { useRoomChatStore.getState().reset() })

describe('roomChatStore', () => {
  it('append adds a line and sets the sender bubble', () => {
    useRoomChatStore.getState().append({ sender: 2, userName: 'Bob', msg: '你好', time: '12:00:00' })
    const s = useRoomChatStore.getState()
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]!.msg).toBe('你好')
    expect(s.bubbles[2]!.msg).toBe('你好')
  })

  it('an observer (seated=false) appends to the log but gets NO photo bubble (RoomPage addToChat)', () => {
    useRoomChatStore.getState().reset()
    useRoomChatStore.getState().append({ sender: 9, userName: 'Watcher', msg: 'hi', time: '' }, false)
    const s = useRoomChatStore.getState()
    expect(s.lines).toHaveLength(1)        // still shown in the chat log
    expect(s.bubbles[9]).toBeUndefined()   // but no bubble slot for a seatless sender
  })

  it('a newer message replaces the bubble; clearBubble only clears the matching seq', () => {
    const st = useRoomChatStore.getState()
    st.append({ sender: 2, userName: 'Bob', msg: 'one', time: '' })
    const firstSeq = useRoomChatStore.getState().bubbles[2]!.seq
    st.append({ sender: 2, userName: 'Bob', msg: 'two', time: '' })
    // Stale clear (old seq) is a no-op — the newer bubble stays.
    st.clearBubble(2, firstSeq)
    expect(useRoomChatStore.getState().bubbles[2]!.msg).toBe('two')
    // Clearing the current seq removes it.
    const curSeq = useRoomChatStore.getState().bubbles[2]!.seq
    st.clearBubble(2, curSeq)
    expect(useRoomChatStore.getState().bubbles[2]).toBeUndefined()
  })

  it('reset clears lines + bubbles', () => {
    useRoomChatStore.getState().append({ sender: 1, userName: 'me', msg: 'x', time: '' })
    useRoomChatStore.getState().reset()
    expect(useRoomChatStore.getState().lines).toEqual([])
    expect(useRoomChatStore.getState().bubbles).toEqual({})
  })
})

describe('parsePresent', () => {
  it('parses valid present messages "$@<Type>:<pid>"', () => {
    expect(parsePresent('$@Flower:3')).toEqual({ type: 'Flower', to: 3 })
    expect(parsePresent('$@Egg:1')).toEqual({ type: 'Egg', to: 1 })
    expect(parsePresent('$@GiantEgg:2')).toEqual({ type: 'GiantEgg', to: 2 })
    expect(parsePresent('$@Shoe:4')).toEqual({ type: 'Shoe', to: 4 })
    expect(parsePresent('$@Wine:5')).toEqual({ type: 'Wine', to: 5 })
  })

  it('returns null for plain text and malformed/unknown presents', () => {
    expect(parsePresent('hello')).toBeNull()        // plain text
    expect(parsePresent('$@Flower')).toBeNull()      // no target
    expect(parsePresent('$@Bogus:1')).toBeNull()     // unknown type
    expect(parsePresent('$@Flower:abc')).toBeNull()  // non-numeric target
  })
})
