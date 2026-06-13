import { useGameStore } from '../stores/gameStore.js'
import { useTrustUiStore } from '../stores/trustUiStore.js'
import { isSelfTrusting } from './roomActions.js'

export function useSelfTrusting(): boolean {
  const selfState = useGameStore((s) => (s.selfId !== undefined ? s.players[s.selfId]?.state : undefined))
  const winner = useGameStore((s) => s.winner)
  const pending = useTrustUiStore((s) => s.pending)
  return isSelfTrusting(selfState, pending, winner !== undefined)
}
