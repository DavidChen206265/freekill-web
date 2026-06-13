import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

describe('in-game interaction bugfix wiring', () => {
  it('lets role and handcard badge overflow outside the photo frame', () => {
    const src = readFileSync(join(SRC, 'table/Photo.tsx'), 'utf8')
    expect(src).toMatch(/photo:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*overflow:\s*"visible"/)
    expect(src).toMatch(/portraitClip:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*overflow:\s*"hidden"[\s\S]*display:\s*"flex"/)
    expect(src).toMatch(/role:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*top:\s*-6\.5[\s\S]*right:\s*-5/)
    expect(src).toMatch(/name:\s*\{[\s\S]*position:\s*"relative"[\s\S]*fontSize:\s*12/)
    expect(src).toMatch(/kingdomIcon:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*left:\s*-3[\s\S]*top:\s*-3[\s\S]*width:\s*27[\s\S]*height:\s*27/)
    expect(src).toMatch(/handcard:\s*\{[\s\S]*position:\s*"absolute"[\s\S]*left:\s*-20/)
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

  it('routes ArrangeCards poxi_type through VM poxi rules (shzl shelie)', () => {
    const popup = readFileSync(join(SRC, 'stores/popupStore.ts'), 'utf8')
    const request = readFileSync(join(SRC, 'table/RequestPopup.tsx'), 'utf8')
    const vm = readFileSync(join(SRC, 'stores/vmStore.ts'), 'utf8')

    expect(popup).toContain('arrangePoxiType')
    expect(popup).toContain("typeof obj.poxi_type === 'string'")
    expect(request).toContain('const poxiType = active.arrangePoxiType')
    expect(request).toContain('vm?.poxiFilter(poxiType')
    expect(request).toContain('vm?.poxiFeasible(poxiType')
    expect(vm).toContain('collectPopupTranslationKeys')
    expect(vm).toContain('active.areas?.forEach')
    expect(vm).toContain('addAll(active.ccOkOptions)')
  })
})
