// compute-md5.mjs — print the asio flist MD5 for a packages directory, so a deploy
// can set FK_MD5 for whatever package set the asio server ships (core-only or with
// extension packs). The MD5 must match `server.getMd5()` or the Setup handshake fails.
//
//   node packages/assets/scripts/compute-md5.mjs <path-to-asio/packages> [disabled,packs]
//
// Verified byte-exact against the running asio (e48d6db7… for the core-only set).

import { computeFlistMd5 } from '../dist/index.js'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node compute-md5.mjs <path-to-packages-dir> [comma,sep,disabled]')
  process.exit(2)
}
const disabled = (process.argv[3] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const md5 = computeFlistMd5(dir, disabled)
console.log(md5)
