// agFlow.test.ts — reproduce the REAL 五谷/AG notifyUI sequence (captured from a live
// VM via ag-probe.mjs) through the ACTUAL popupStore + the vmStore sink's dispatch
// rules, and assert the AG box ends up active. This is the test that should have
// caught the bug: it replays the exact command ORDER + data shapes the VM emits,
// not synthetic isolated calls.

import { describe, it, expect, beforeEach } from 'vitest'
import { usePopupStore } from '../src/stores/popupStore.js'

beforeEach(() => { usePopupStore.getState().clear(); usePopupStore.setState({ replySender: undefined }) })

// The vmStore notifyUI sink's dispatch for popup/AG commands, distilled: commands
// not matched by an explicit branch fall to popupStore.handle(); CancelRequest does
// clearExceptAg(); ReplyToServer/CancelRequest do NOT clear AG. We replay the exact
// sequence the VM emitted (see ag-probe.mjs output) to mimic the live feed.
function dispatch(command: string, data: unknown) {
  const st = usePopupStore.getState()
  switch (command) {
    case 'CancelRequest': st.clearExceptAg(); return
    case 'ReplyToServer': return // does not touch popup
    default: st.handle(command, data)
  }
}

describe('五谷/AG live sequence', () => {
  it('I am NOT first picker: FillAG → TakeAG×2 → my AskForAG → box is active+interactive', () => {
    // Exact shapes from ag-probe.mjs against the real VM.
    dispatch('FillAG', [[1, 2, 3], []])
    expect(usePopupStore.getState().active?.kind).toBe('ag')
    dispatch('TakeAG', [2, 2])
    dispatch('TakeAG', [3, 3])
    // Still an AG box, two cards tagged taken.
    let a = usePopupStore.getState().active!
    expect(a.kind).toBe('ag')
    expect(a.agCards!.filter((c) => c.takenBy).length).toBe(2)
    // My AskForAG arrives (request). Box must become interactive.
    dispatch('AskForAG', [[1, 2, 3], false, 'amazing_grace_skill'])
    a = usePopupStore.getState().active!
    expect(a.kind).toBe('ag')
    expect(a.agInteractive).toBe(true)
    // The one un-taken card is still pickable.
    expect(a.agCards!.find((c) => c.cid === 1)!.takenBy).toBeUndefined()
  })

  it('I pick FIRST: FillAG → my AskForAG → box active+interactive', () => {
    dispatch('FillAG', [[1, 2, 3], []])
    dispatch('AskForAG', [[1, 2, 3], false, 'amazing_grace_skill'])
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('ag')
    expect(a.agInteractive).toBe(true)
  })

  it('a stray CancelRequest between FillAG and AskForAG does NOT wipe the box', () => {
    dispatch('FillAG', [[1, 2, 3], []])
    dispatch('CancelRequest', '')
    expect(usePopupStore.getState().active?.kind).toBe('ag')
    dispatch('AskForAG', [[1, 2, 3], false, 'amazing_grace_skill'])
    expect(usePopupStore.getState().active?.agInteractive).toBe(true)
  })

  it('ROBUSTNESS: AskForAG with NO preceding FillAG still builds the box from its own id_list', () => {
    // The real-world failure: if FillAG never set the box (dropped / feed-chain break /
    // replaced by another popup), AskForAG must still show a pickable box from its own
    // id_list — otherwise 五谷 shows nothing at all (the reported bug).
    expect(usePopupStore.getState().active).toBeNull()
    dispatch('AskForAG', [[10, 11, 12], false, 'amazing_grace_skill'])
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('ag')
    expect(a.agInteractive).toBe(true)
    expect(a.agCards!.map((c) => c.cid)).toEqual([10, 11, 12])
  })

  it('ROBUSTNESS: AskForAG rebuilds even if a DIFFERENT popup was active', () => {
    // e.g. an AskForChoice box lingered; AskForAG must replace it with the AG box.
    dispatch('AskForChoice', [['x'], ['x'], 'sk', '?', false])
    expect(usePopupStore.getState().active?.kind).toBe('choice')
    dispatch('AskForAG', [[7, 8], false, 'amazing_grace_skill'])
    const a = usePopupStore.getState().active!
    expect(a.kind).toBe('ag')
    expect(a.agCards!.map((c) => c.cid)).toEqual([7, 8])
  })
})
