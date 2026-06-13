import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

describe('in-game interaction bugfix wiring', () => {
  it('lets role and handcard badge overflow outside the photo frame', () => {
    const src = readFileSync(join(SRC, 'table/Photo.tsx'), 'utf8')
    expect(src).toContain("photo: { position: 'absolute', inset: 0, borderRadius: 8, overflow: 'visible'")
    expect(src).toContain("portraitClip: { position: 'absolute'")
    expect(src).toContain("overflow: 'hidden', display: 'flex'")
    expect(src).toContain("role: { position: 'absolute', top: -6.5, right: -5")
    expect(src).toContain("name: { position: 'relative', fontSize: 12")
    expect(src).toContain("kingdomIcon: { position: 'absolute', left: -3, top: -3, width: 32, height: 32")
    expect(src).toContain("handcard: { position: 'absolute', left: -20")
  })

  it('selects a super-dragged card during movement before hitting targets or OK', () => {
    const src = readFileSync(join(SRC, 'table/CardLayer.tsx'), 'utf8')
    expect(src).toContain('const hitOkArea =')
    expect(src).toContain('const DASHBOARD_Y = STAGE_H - 150')
    expect(src).toContain("void interact('CardItem', drag.cid, 'click', { selected: true")
    expect(src).toContain("await interact('CardItem', cid, 'click', { selected: true")
    expect(src).toContain("void interact('Photo', pid, 'click'")
    expect(src).toContain('pid !== null && pid !== finalDrag.clickedPhoto')
    expect(src).toContain('useInteractionStore.getState().buttons.OK?.enabled')
    expect(src).toContain("await interact('Button', 'OK', 'click', {})")
  })

  it('keeps self hand cards masked whenever the VM has not marked them selectable', () => {
    const src = readFileSync(join(SRC, 'table/CardLayer.tsx'), 'utf8')
    expect(src).toContain('useSelfTrusting()')
    expect(src).toContain('(st ? (!st.enabled && !st.selected) : selfHandCids.has(cid))')
  })

  it('releases card movement animations before dragging so inline transform can move the card', () => {
    const src = readFileSync(join(SRC, 'table/CardLayer.tsx'), 'utf8')
    expect(src).toContain('const activeAnims = useRef(new Map<number, Animation>())')
    expect(src).toContain('const cancelCardAnimation = (cid: number)')
    expect(src).toContain('cancelCardAnimation(cid)')
    expect(src).toContain('activeAnims.current.set(cid, anim)')
    expect(src).toContain('anim.onfinish = () =>')
  })
})
