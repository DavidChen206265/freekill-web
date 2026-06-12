// notifyCommands.ts — the canonical classification of every VM notifyUI command,
// and the pure classifier the unhandled-detector uses. Kept separate from diag/log.ts
// (which has browser-only bits) so it's importable in pure/Node tests too. This list
// IS the living documentation of how each command reaches the UI — the 五谷 bug was a
// command that fell through every category.

/** How a notifyUI command is consumed (or not). */
export type NotifyDisposition =
  | 'explicit' // a dedicated vmStore/gameStore/popupStore/etc. branch handles it
  | 'popup' // popupStore.handle() claimed it dynamically
  | 'mirror' // consumed indirectly: VM applies it, we re-read readPlayers/readSkills
  | 'deferred' // known-unimplemented, scoped to M4 slice V (visual/animation)
  | 'unhandled' // 五谷-class gap: no consumer at all

// Commands handled by an EXPLICIT branch (vmStore notifyUI sink, gameStore.apply,
// interactionStore, cardStore, logStore). Keep in sync with those handlers.
export const HANDLED_EXPLICIT = new Set<string>([
  // vmStore notifyUI sink branches:
  'MoveCards', 'DestroyTableCard', 'DestroyTableCardByEvent', 'UpdateRequestUI',
  'AskForSkillInvoke', 'PlayCard', 'AskForUseCard', 'AskForResponseCard',
  'AskForUseActiveSkill', 'ReplyToServer', 'CancelRequest', 'GetPlayerHandcards',
  'GameLog', 'ShowToast', 'ChangeSelf', 'MoveFocus', 'UpdateCard',
  // popupStore.handle() cases (also caught dynamically, but listed for completeness):
  'AskForGeneral', 'AskForChoice', 'AskForChoices', 'AskForCardChosen',
  'AskForCardsChosen', 'FillAG', 'AskForAG', 'TakeAG', 'CloseAG',
  'AskForGuanxing', 'AskForExchange', 'AskForMoveCardInBoard', 'AskForPoxi',
  'AskForCardsAndChoice', 'CustomDialog', 'MiniGame', 'EmptyRequest',
  'AskForArrangeCards',
  // gameStore.apply() cases:
  'Setup', 'EnterRoom', 'SetPlayerMark', 'StartGame', 'GameOver',
  // M4 slice V — visual/audio effects now consumed (animationStore / audio.ts /
  // Toast / cardNoteStore):
  'Animate', 'LogEvent', 'ShowToast', 'SetCardFootnote', 'SetCardVirtName',
  // IG-5 — in-game chat + 送花/砸蛋 (roomChatStore / present animation):
  'Chat',
  // M5-a — table misc status (miscStore → MiscStatus):
  'UpdateDrawPile', 'UpdateRoundNum',
  // N1-2 — Photo LimitSkillArea (limitSkillStore → Photo): limit/wake/switch/quest marks.
  'UpdateLimitSkill',
])

// Commands consumed INDIRECTLY via the VM mirror: the VM applies them to its own
// ClientInstance state and vmStore re-reads the authoritative mirror
// (readPlayers/readSkills) after EVERY packet. CLAUDE.md: "数据真相源是 VM,不是增量".
// Listing them prevents false "unhandled" reports + documents mirror coverage.
export const MIRROR_DRIVEN = new Set<string>([
  'PropertyUpdate', 'ArrangeSeats', 'MaxCard', 'AddPlayer', 'RemovePlayer',
  'AddNpc', 'AddSkill', 'LoseSkill', 'UpdateSkill', 'UpdateHandcard',
  'AddTotalGameTime', 'PlayerRunned', 'EnterLobby', 'Reconnect', 'Observe',
  'AddObserver', 'RemoveObserver',
  // VM applies these to its own state; the change surfaces via the mirror re-read
  // (SetCardMark also triggers a separate UpdateCard which the web handles).
  'SetCardMark', 'SetCurrent',
  // UpdateGameData: VM setGameData → surfaced via readPlayers gameData snapshot
  // (WaitingRoom WinRatePanel, C29/C3); no delta case, consumed by the mirror.
  'UpdateGameData',
])

// Known-unimplemented commands scoped to a LATER milestone (M5 — extension UI /
// status overlays). Flagged at INFO so they're visible but not mistaken for
// 五谷-class bugs. (Animate/LogEvent/ShowToast/SetCardFootnote done in M4 slice V.)
export const KNOWN_DEFERRED = new Set<string>([
  'SetBanner', 'ShowVirtualCard', 'ChangeSkin',
  'UpdateMarkArea',
  'UpdateMiniGame', 'ServerMessage',
])

/**
 * Classify a notifyUI command. `popupHandled` = whether popupStore.handle() claimed
 * it at runtime (covers popup commands added in future without touching this file).
 */
export function classifyNotify(command: string, popupHandled: boolean): NotifyDisposition {
  if (popupHandled) return 'popup'
  if (HANDLED_EXPLICIT.has(command)) return 'explicit'
  if (MIRROR_DRIVEN.has(command)) return 'mirror'
  if (KNOWN_DEFERRED.has(command)) return 'deferred'
  return 'unhandled'
}
