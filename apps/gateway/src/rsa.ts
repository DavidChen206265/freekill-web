// rsa.ts — encrypt the Setup password the way asio expects.
//
// asio decrypts with RSA_private_decrypt(..., RSA_PKCS1_PADDING) and then requires
// the plaintext to be >32 bytes, taking the REAL password as substr(32) — the
// first 32 bytes are a placeholder for an AES key (AES itself is disabled in asio,
// see auth.cpp). So we encrypt: [32-byte placeholder] + [password], with the
// server's RSA public key using PKCS#1 v1.5 padding.
//
// The server sends its key as a PKCS#1 "RSA PUBLIC KEY" PEM. node:crypto accepts
// it directly with format:'pem', type:'pkcs1'.

import { publicEncrypt, constants, createPublicKey, randomBytes } from 'node:crypto'

const PLACEHOLDER_LEN = 32

/**
 * Encrypt `password` for asio's Setup. Returns the RSA ciphertext bytes to place
 * in the Setup array's password slot.
 *
 * IMPORTANT: asio does `std::string decrypted{buf}` from the decrypted bytes,
 * which STOPS AT THE FIRST NUL. The 32-byte placeholder must therefore contain NO
 * zero bytes, or the real password (after substr(32)) is lost and asio reports
 * "unknown password error". We use random bytes mapped to the 0x01–0xff range.
 */
export function encryptPassword(pemPublicKey: string, password: string): Uint8Array {
  const key = createPublicKey({ key: pemPublicKey, format: 'pem', type: 'pkcs1' })

  // 32-byte placeholder (stands in for the AES key; asio currently ignores its
  // value but parses past it via substr(32)). Must be NUL-free.
  const prefix = randomBytes(PLACEHOLDER_LEN)
  for (let i = 0; i < prefix.length; i++) if (prefix[i] === 0) prefix[i] = 1
  const plain = Buffer.concat([prefix, Buffer.from(password, 'utf8')])

  const cipher = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    plain,
  )
  return new Uint8Array(cipher.buffer, cipher.byteOffset, cipher.byteLength)
}
