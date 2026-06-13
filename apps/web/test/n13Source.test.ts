import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

describe('N1-3 source wiring', () => {
  it('wires room menu actions to PushRequest surrender and Trust', () => {
    const src = readFileSync(join(SRC, 'table/RoomMenuOverlay.tsx'), 'utf8')
    expect(src).toContain("client?.notify('PushRequest', surrenderPayload())")
    expect(src).toContain("client?.notify('Trust', '')")
    expect(src).toContain('checkSurrenderAvailable()')
    expect(src).toContain('退出托管')
    expect(src).toContain('vm?.finishRequestUI()')
    expect(src).toContain('useInteractionStore.getState().clear()')
    expect(src).toContain("setTrustPending('enter')")
    expect(src).toContain("setTrustPending('exit')")
  })

  it('wires waiting-room owner kick to KickPlayer', () => {
    const src = readFileSync(join(SRC, 'table/WaitingRoom.tsx'), 'utf8')
    expect(src).toContain("client?.notify('KickPlayer', pid)")
    expect(src).toContain('canKickPlayer(selfId, p, selfIsOwner)')
  })
})
