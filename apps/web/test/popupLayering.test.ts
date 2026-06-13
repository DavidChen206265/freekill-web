import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FREE_ASSIGN_Z, REQUEST_POPUP_Z } from '../src/table/RequestPopup.js'
import { GENERAL_DETAIL_Z } from '../src/table/GeneralDetailModal.js'

describe('popup layering and shell behavior', () => {
  it('renders general detail above free assign and request popups', () => {
    expect(FREE_ASSIGN_Z).toBeGreaterThan(REQUEST_POPUP_Z)
    expect(GENERAL_DETAIL_Z).toBeGreaterThan(FREE_ASSIGN_Z)
  })

  it('keeps AG and regular request popups on the draggable collapsible shell', () => {
    const src = readFileSync(join(process.cwd(), 'src/table/RequestPopup.tsx'), 'utf8')

    expect(src).toMatch(/function Modal[\s\S]*return <DraggableBox prompt=\{prompt\}>\{children\}<\/DraggableBox>/)
    expect(src).toMatch(/function AgBox[\s\S]*<DraggableBox prompt=\{active\.prompt\} top="12%">/)
    expect(src).toContain('onPointerMove')
    expect(src).toContain('setCollapsed')
    expect(src).toContain('styles.collapseBtn')
  })
})
