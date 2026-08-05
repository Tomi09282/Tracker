// src/lib/dbkey.js — the single source of truth for DB key derivation.
// Used by BOTH src/db/worker.js and scripts/rekey.js; they must never drift apart.
//
// WARNING: the scrypt parameters are PART OF THE KEY. Changing them — or the salt — on an
// existing database makes it permanently unopenable without the rekey procedure.
import { scryptSync } from 'node:crypto';

// OWASP scrypt minimum: N=2^17, r=8, p=1. maxmem must exceed 128*N*r bytes or scrypt throws.
const SCRYPT_PARAMS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export function deriveDbKeyHex(master, salt) {
  return scryptSync(master, salt, 32, SCRYPT_PARAMS).toString('hex');
}
