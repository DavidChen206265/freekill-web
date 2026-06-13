// serverManifestStore — holds the Web manifest/capabilities the server sends in
// SetServerSettings (W0-2). The asio Web-only fork appends a 4th element to the
// SetServerSettings CBOR array: { webOnly, serverBuild, assetVersion,
// enabledPacks, webFeatures } (see freekill-web-asio user_manager.cpp setupPlayer
// + core/util.cpp listEnabledPacks). This store is the single runtime source of
// truth for which packs the client should resolve art/audio for, and which
// server features (AddRobot/ChangeRoom) to surface — replacing the old hardcoded
// ART_PKGS constants (P7-032) and the missing serverFeatures gate (P4-004).
//
// Old servers (no 4th element) leave this at defaults; consumers must treat empty
// enabledPacks/webFeatures as "unknown → keep current behavior", never "disable".

import { create } from 'zustand'

export interface ServerManifest {
  webOnly: boolean
  serverBuild: string
  /** flist md5 reused as an asset-version tag (changes when the pack set changes). */
  assetVersion: string
  /** Full enabled pack set incl. builtins, from real server package state. */
  enabledPacks: string[]
  /** Hidden package names from SetServerSettings[1], matching Config.serverHiddenPacks. */
  hiddenPacks: string[]
  /** Server-advertised Web features, e.g. ["AddRobot", "ChangeRoom"]. */
  webFeatures: string[]
  /** True once a manifest has actually been received (vs. defaults). */
  received: boolean
}

const EMPTY: ServerManifest = {
  webOnly: false,
  serverBuild: '',
  assetVersion: '',
  enabledPacks: [],
  hiddenPacks: [],
  webFeatures: [],
  received: false,
}

export const useServerManifestStore = create<ServerManifest>(() => ({ ...EMPTY }))

/** Parse the manifest object out of a SetServerSettings payload's 4th element.
 *  Returns null when absent/malformed (old server) so the caller can no-op. */
export function parseManifest(raw: unknown): ServerManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  // Require at least enabledPacks to consider it a real manifest.
  if (!Array.isArray(o.enabledPacks)) return null
  return {
    webOnly: Boolean(o.webOnly),
    serverBuild: typeof o.serverBuild === 'string' ? o.serverBuild : '',
    assetVersion: typeof o.assetVersion === 'string' ? o.assetVersion : '',
    enabledPacks: (o.enabledPacks as unknown[]).filter((p): p is string => typeof p === 'string'),
    hiddenPacks: [],
    webFeatures: Array.isArray(o.webFeatures)
      ? (o.webFeatures as unknown[]).filter((f): f is string => typeof f === 'string')
      : [],
    received: true,
  }
}
