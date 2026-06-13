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
    expect(src).toContain("role: { position: 'absolute', top: -16.5, right: -15")
    expect(src).toContain("handcard: { position: 'absolute', left: -40")
  })

  it('does not select a dragged hand card unless the drop targets a player or OK area', () => {
    const src = readFileSync(join(SRC, 'table/CardLayer.tsx'), 'utf8')
    expect(src).toContain('const hitPhoto =')
    expect(src).toContain('const hitOk =')
    expect(src).toContain("!st.selected && (hitPhoto || hitOk)) void interact('CardItem'")
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
