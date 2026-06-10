// animationStore.ts — transient visual effects driven by the VM's notifyUI
// "Animate" / "LogEvent" commands (M4 slice V). These are PURELY visual and never
// enter the VM player mirror, so they must be consumed explicitly here; missing one
// only degrades the look, it never breaks game state (unlike the 五谷 request bug).
//
// Two channels, mirroring RoomLogic.js's two animation surfaces:
//   • per-player: effects anchored on a Photo (Emotion sprite, InvokeSkill banner,
//     tremble, death). Keyed by player id; a monotonic `nonce` re-triggers replay
//     even when the same effect repeats. Consumed by Photo's child components.
//   • scene: effects spanning the stage (Indicate lines, InvokeUltSkill / Super
//     LightBox full-screen). A list of {id,...}; AnimationLayer renders + removes
//     each when its WAAPI animation finishes.
//
// Data shapes are verified against the server emitters (room.lua doAnimate /
// sendLogEvent) and RoomLogic.js callbacks (Animate 1310-1372, LogEvent 1374-1442).

import { create } from 'zustand'

// ---- per-player effects ----------------------------------------------------
export type PlayerEffectKind = 'emotion' | 'invokeSkill' | 'tremble' | 'death'

export interface PlayerEffect {
  kind: PlayerEffectKind
  nonce: number
  // emotion: the sprite folder name (e.g. "slash"/"jink"/"damage")
  emotion?: string
  // invokeSkill: localized skill name + skill_type (drives banner colour/sprite)
  skillName?: string
  skillType?: string
}

// ---- scene effects ---------------------------------------------------------
export type SceneEffectKind = 'indicate' | 'ultSkill' | 'superLightBox'

export interface SceneEffect {
  id: number
  kind: SceneEffectKind
  // indicate: source player id + list of target player-id chains (to[i] = chain)
  from?: number
  chains?: number[][]
  // ultSkill: player id + localized skill name + which general (main/deputy)
  player?: number
  skillName?: string
  deputy?: boolean
  // superLightBox: qml path + extra data (only built-in default supported)
  path?: string
}

interface AnimationState {
  /** player id -> current effect (latest wins; nonce forces replay). */
  players: Record<number, PlayerEffect>
  /** card id -> current emotion effect (is_card emotions play on a table card). */
  cards: Record<number, PlayerEffect>
  /** player id -> nonce: a brief "you are a target" ring pulse (Indicate targets).
   *  Separate channel from `players` so it coexists with emotion/tremble. */
  targeted: Record<number, number>
  /** active scene effects (removed on finish). */
  scene: SceneEffect[]
  /** Push a per-player effect (bumps that player's nonce). */
  pushPlayer: (pid: number, e: Omit<PlayerEffect, 'nonce'>) => void
  /** Push a per-card emotion (is_card). */
  pushCard: (cid: number, e: Omit<PlayerEffect, 'nonce'>) => void
  /** Pulse the "targeted" ring on each given player (Indicate targets). */
  pushTargeted: (pids: number[]) => void
  /** Push a scene effect; returns its id. */
  pushScene: (e: Omit<SceneEffect, 'id'>) => number
  /** Remove a finished scene effect. */
  removeScene: (id: number) => void
  /** Clear everything (room reset / leave). */
  reset: () => void
}

let nonceSeq = 0
let sceneSeq = 0

export const useAnimationStore = create<AnimationState>((set) => ({
  players: {},
  cards: {},
  targeted: {},
  scene: [],

  pushPlayer: (pid, e) => set((s) => ({
    players: { ...s.players, [pid]: { ...e, nonce: ++nonceSeq } },
  })),

  pushTargeted: (pids) => set((s) => {
    if (pids.length === 0) return {}
    const targeted = { ...s.targeted }
    for (const pid of pids) targeted[pid] = ++nonceSeq
    return { targeted }
  }),

  pushCard: (cid, e) => set((s) => ({
    cards: { ...s.cards, [cid]: { ...e, nonce: ++nonceSeq } },
  })),

  pushScene: (e) => {
    const id = ++sceneSeq
    set((s) => ({ scene: [...s.scene, { ...e, id }] }))
    return id
  },

  removeScene: (id) => set((s) => ({ scene: s.scene.filter((x) => x.id !== id) })),

  reset: () => set({ players: {}, cards: {}, targeted: {}, scene: [] }),
}))
