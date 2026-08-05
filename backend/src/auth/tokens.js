// src/auth/tokens.js — token minting and verification.
//
// Access token: a short-lived JWT the server can validate without a database round trip.
// Refresh token: NOT a JWT — an opaque random value whose only meaning is a row in the DB.
// That asymmetry is the point: the thing that lives for weeks must be revocable instantly.
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { env } from '../lib/env.js';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // sliding, renewed on each rotation
export const FAMILY_ABSOLUTE_TTL_SEC = 30 * 24 * 60 * 60; // hard cap: re-login after 30 days

// The keyring enables zero-downtime secret rotation: publish JWT_SECRET_PREV + JWT_KID_PREV
// while rotating, then remove them one access-token lifetime later.
const keyring = new Map([[env.JWT_KID, Buffer.from(env.JWT_SECRET, 'base64url')]]);
if (env.JWT_SECRET_PREV && env.JWT_KID_PREV) {
  keyring.set(env.JWT_KID_PREV, Buffer.from(env.JWT_SECRET_PREV, 'base64url'));
}

export async function signAccessToken(user) {
  return new SignJWT({ role: user.role, sv: user.session_version })
    .setProtectedHeader({ alg: 'HS256', kid: env.JWT_KID })
    .setSubject(String(user.id))
    .setJti(randomUUID())
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(keyring.get(env.JWT_KID));
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(
    token,
    (header) => {
      const key = keyring.get(header.kid);
      if (!key) throw new Error('unknown kid');
      return key;
    },
    // Pinning the algorithm list is not optional: without it, alg-confusion and "none" attacks
    // are live (RFC 8725). Issuer and audience are checked here too, so a token minted for a
    // different service cannot be replayed against this one.
    { algorithms: ['HS256'], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
  );
  return payload;
}

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
