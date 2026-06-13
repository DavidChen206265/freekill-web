import type { GamePlayer } from '../stores/gameStore.js'

export interface SurrenderCheck {
  text: string
  passed: boolean
}

export const PLAYER_STATE_LABELS: Record<number, string> = {
  1: '在线',
  2: '托管',
  3: '逃跑',
  5: '人机',
  6: '离线',
}

export function playerStateLabel(state: number | undefined): string {
  return state === undefined ? '' : (PLAYER_STATE_LABELS[state] ?? '')
}

export function isTrustState(state: number | undefined): boolean {
  return state === 2
}

export function canKickPlayer(selfId: number | undefined, player: Pick<GamePlayer, 'id'> | undefined, selfIsOwner: boolean): boolean {
  return !!player && selfIsOwner && player.id !== selfId
}

export function surrenderPayload(): string {
  return 'surrender,true'
}

export function canConfirmSurrender(checks: SurrenderCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.passed)
}
