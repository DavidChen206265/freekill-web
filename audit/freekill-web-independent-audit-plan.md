# freekill-web independent audit plan

This audit ignores existing reports, summaries, README claims, and prior analysis files. The only seed data used for this plan is the live filesystem and directly inspected build/entry files in `FreeKill-sourcecode` and `freekill-web`.

## Objective

Audit `freekill-web` against `FreeKill-sourcecode` by reading the source implementation line by line and checking how each function and UI element is restored in the web project.

For every source item, record:

- source location: file and line range
- original behavior: runtime logic, state transitions, user interaction, data contract, side effects
- original UI: every visible element, icon/image, layout rule, animation, state, tooltip/text, and input behavior
- web counterpart: file and line range, or `none`
- status: `successfully restored`, `not restored`, `restored incorrectly`, `simplified restoration`, `not applicable`
- evidence: exact behavioral/UI delta and reproduction/check method
- verification: test, static proof, manual run, screenshot, or reason not run

## Current Project Shape

`FreeKill-sourcecode` is a Qt/C++/QML/Lua project.

- C++ entry/build: `CMakeLists.txt`, `src/CMakeLists.txt`, `src/main.cpp`, `src/freekill.cpp`
- UI entry: `Fk/main.qml`
- QML page/component tree: `Fk/`
- client/server/game Lua runtime: `lua/`
- shipped packages and skill definitions: `packages/`
- static resources: `image/`, `audio/`, `fonts/`, package images/audio

`freekill-web` is a pnpm monorepo.

- browser app: `apps/web`
- gateway: `apps/gateway`
- protocol codec/conversion: `packages/protocol`
- Lua native/wasmoon bridge: `packages/lua-native`
- shared/assets packages: `packages/shared`, `packages/assets`
- copied public FreeKill assets/Lua: `apps/web/public/fk`

Generated inventory files:

- `audit/source-ui-qml-inventory.csv`: 170 source UI/QML/JS entries
- `audit/source-lua-inventory.csv`: 164 source Lua entries
- `audit/source-cpp-inventory.csv`: 53 source C++/SWIG entries
- `audit/source-packages-code-inventory.csv`: 136 package code entries
- `audit/source-assets-inventory.csv`: source images/audio/fonts inventory
- `audit/web-apps-code-inventory.csv`: 374 web app entries
- `audit/web-packages-code-inventory.csv`: 28 web package entries
- `audit/web-public-fk-inventory.csv`: copied web public FK asset/Lua inventory

## Audit Record Format

Use a TSV/CSV or Markdown table with these columns:

`id | area | source_path | source_lines | source_item | source_behavior_or_ui | web_path | web_lines | web_item | status | delta | verification | notes`

Status definitions:

- `successfully restored`: web behavior/UI is equivalent for the same user-visible contract.
- `not restored`: no web counterpart exists.
- `restored incorrectly`: counterpart exists but behavior, data contract, or UI state differs materially.
- `simplified restoration`: counterpart intentionally or apparently covers only a subset.
- `not applicable`: source item is platform/build/test-only or outside web target, with justification.

## Audit Order

### Phase 0: Baseline and Mapping

1. Confirm no reliance on existing analysis files.
2. Build a source-to-web correspondence map:
   - QML UI to React components/stores
   - C++ backend/network to gateway/protocol/VM/native bridges
   - Lua runtime and packages to copied `public/fk` Lua plus VM shims
   - resources to `apps/web/public/fk`
3. Run available web checks after reading enough context:
   - `pnpm -r typecheck`
   - `pnpm -r test`
   - targeted Vite/manual UI run when UI comparison begins

### Phase 1: Application Startup and Top-Level Navigation

Source files:

- `src/main.cpp`
- `src/freekill.cpp`
- `src/ui/qmlbackend.h`
- `src/ui/qmlbackend.cpp`
- `Fk/main.qml`
- `Fk/Base/RootPage.qml`
- `Fk/Base/Config.qml`
- `Fk/Base/CppUtil.qml`
- `Fk/Base/AppUtil.qml`
- `Fk/Base/Mediator.qml`
- `Fk/Base/Toast.qml`
- `Fk/Base/ToastManager.qml`
- `Fk/Base/Splash.qml`

Web files:

- `freekill-web/package.json`
- `apps/web/package.json`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/LobbyPage.tsx`
- `apps/web/src/stores/index.ts`
- `apps/web/src/stores/vmStore.ts`
- `packages/lua-native/src/*`
- `packages/lua-native/lua/*.lua`

Checks:

- startup mode selection, locale/version/global context, splash/loading behavior
- config persistence and window/stage scaling
- login/offline/online routing
- global notifications, toasts, dialogs, clipboard/audio/file APIs

### Phase 2: Network, Protocol, Server, Client, Gateway

Source files:

- all `src/network/*`
- `src/client/client.*`, `src/client/clientplayer.*`, `src/client/replayer.*`
- `src/server/server.*`
- `src/server/room/*`
- `src/server/user/*`
- `src/server/task/*`
- `src/server/gamelogic/*`
- `src/server/cli/*`
- `src/swig/*.i`
- `lua/client/*`
- `lua/server/*`
- `lua/server/rpc/*`

Web files:

- `apps/gateway/src/*`
- `apps/web/src/net/gatewayClient.ts`
- `packages/protocol/src/*`
- `apps/web/src/vm/clientVm.ts`
- `packages/lua-native/src/*`
- copied Lua under `apps/web/public/fk/packages/freekill-core/lua`

Checks:

- transport framing, compression, JSON/CBOR conversion, request/response IDs, timeout and server lag
- login, lobby, room creation/joining, late joiner, reconnect/error handling
- server discovery equivalents or omissions
- Lua native function surface versus C++/QML backend calls
- replay and record support

### Phase 3: Lobby and Common Pages

Source files:

- `Fk/Pages/Common/*.qml`
- `Fk/Pages/Lobby/*.qml`
- `Fk/Components/Lobby/*.qml`
- `Fk/Components/Common/*.qml`
- `Fk/Widgets/*.qml`

Web files:

- `apps/web/src/pages/LoginPage.tsx`
- `apps/web/src/pages/LobbyPage.tsx`
- `apps/web/src/components/RoomList.tsx`
- `apps/web/src/components/CreateRoomDialog.tsx`
- `apps/web/src/components/ChatBox.tsx`
- `apps/web/src/components/VmDebugPanel.tsx`
- relevant stores in `apps/web/src/stores/*`

Checks:

- public server list, manual join, local start server, room filtering/list display
- create room settings, package/mode selection, profile/user info
- settings pages: audio, UI, controls, background, Lua/package/resource management
- common widgets: buttons, rows, toggles, sliders, sidebars, scrollbars, popups
- icons/images/text/states for each lobby element

### Phase 4: Waiting Room and Room Shell

Source files:

- `Fk/Pages/Common/WaitingRoom.qml`
- `Fk/Pages/Common/RoomPage.qml`
- `Fk/Pages/Common/RoomOverlay.qml`
- `Fk/Components/WaitingRoom/WaitingPhoto.qml`
- `Fk/Pages/LunarLTK/Room.qml`
- `Fk/Pages/LunarLTK/RoomLogic.js`

Web files:

- `apps/web/src/table/WaitingRoom.tsx`
- `apps/web/src/table/waitingState.ts`
- `apps/web/src/table/RoomScene.tsx`
- `apps/web/src/table/Stage.tsx`
- `apps/web/src/table/seatLayout.ts`
- `apps/web/src/stores/gameStore.ts`
- `apps/web/src/stores/timerStore.ts`
- `apps/web/src/stores/popupStore.ts`
- `apps/web/src/stores/interactionStore.ts`

Checks:

- waiting seats, ready/owner/robot/offline states, tips, chat, controls
- transition from waiting room to game room
- stage sizing, seat placement, z-order, overlays, focus, timeout bar
- request popups and prompt processing

### Phase 5: In-Game Table UI Components

Source files:

- `Fk/Components/GameCommon/*.qml`
- `Fk/Components/LunarLTK/*.qml`
- `Fk/Components/LunarLTK/Photo/*.qml`
- `Fk/Components/LunarLTK/SkillInteraction/*.qml`
- `Fk/Pages/LunarLTK/*.qml`

Web files:

- all `apps/web/src/table/*.tsx`
- all `apps/web/src/table/*.ts`
- `apps/web/src/stores/cardStore.ts`
- `apps/web/src/stores/cardFaceStore.ts`
- `apps/web/src/stores/detailStore.ts`
- `apps/web/src/stores/focusStore.ts`
- `apps/web/src/stores/logStore.ts`

Checks:

- player photo frame, avatar/general art, role icon, kingdom, hp/magatama/shield, chain/turn/dead/face-down states
- equip area, judge/delayed trick area, hand cards, table pile, card layer animations
- card face rendering: suit, number, name, subtype, selected/disabled/unknown/back
- skill buttons: active/limited/wake/quest/switch states, press/hover/toggle behavior
- all interaction boxes: choose cards, choices, checks, detailed choices, general selection/filter, guanxing, poxi, arrange cards, move cards, player card viewer
- game over modal and general detail modal
- icons/images and every visible text/state

### Phase 6: Game Logic Lua and Packages

Source files:

- all `lua/core/*`
- all `lua/lunarltk/core/*`
- all `lua/lunarltk/server/*`
- all `lua/lunarltk/client/*`
- all `packages/standard/**/*.lua`
- all `packages/standard_cards/**/*.lua`
- all `packages/maneuvering/**/*.lua`
- package SQL/i18n files

Web files:

- copied Lua under `apps/web/public/fk/packages/freekill-core`
- `packages/lua-native/*`
- VM/store integration in `apps/web/src/vm/clientVm.ts`, `apps/web/src/stores/vmStore.ts`

Checks:

- exact copied-code deltas against source, file by file
- intentional browser adaptations versus accidental divergence
- skill/card/general/package definitions loaded and reachable
- i18n availability and translation call behavior
- UI request types emitted by Lua and handled by React

### Phase 7: Assets and Visual Resources

Source roots:

- `image/`
- `audio/`
- `fonts/`
- `packages/*/image`
- `packages/*/audio`

Web roots:

- `apps/web/public/fk/image`
- `apps/web/public/fk/packages/*/image`
- any referenced CSS/asset paths in React/table code

Checks:

- asset existence, path mapping, fallback behavior
- every icon used by QML has a web equivalent or documented omission
- missing audio playback resources/behavior
- image dimensions and visual usage for cards, generals, photos, roles, states, hp, skills, marks, animations

### Phase 8: Replay, Records, Debug, Test-Only and Tooling

Source files:

- `Fk/Pages/Replay/*.qml`
- `src/client/replayer.*`
- `src/ui/qmlbackend.*` replay methods
- `packages/test/*`
- `test/*`
- `lua/ui_emu/*`

Web files:

- web tests under `apps/web/test`
- gateway scripts/tests
- VM debug panel
- copied test package under public FK

Checks:

- replay list/playback/control/game-over review
- recording export/delete behavior
- debug/test-only package handling
- whether source testing utilities are omitted, copied, or exposed

## Per-File Procedure

For each source file in the relevant inventory:

1. Read the file line by line.
2. Extract every function, property, signal, handler, component, visual child, asset path, and user action.
3. Record source behavior/UI in the audit table.
4. Search web code for direct name/path/protocol/state counterparts.
5. Read the web counterpart line by line.
6. Mark status and delta.
7. Add a verification step:
   - static comparison for copied Lua/assets
   - unit test where present
   - targeted manual UI run/screenshot for visual components
   - protocol test/smoke script for gateway/network behavior

## Immediate Next Batch

Start with Phase 1 and Phase 2 because they define whether later UI and Lua behavior can actually be exercised:

1. `src/freekill.cpp`
2. `src/ui/qmlbackend.h`
3. `src/ui/qmlbackend.cpp`
4. `Fk/main.qml`
5. `Fk/Base/RootPage.qml`
6. `apps/web/src/main.tsx`
7. `apps/web/src/App.tsx`
8. `apps/web/src/pages/LoginPage.tsx`
9. `apps/web/src/pages/LobbyPage.tsx`
10. `apps/web/src/stores/index.ts`
11. `apps/web/src/stores/vmStore.ts`
12. `apps/web/src/vm/clientVm.ts`
13. `apps/gateway/src/*`
14. `packages/protocol/src/*`
15. `packages/lua-native/src/*`

