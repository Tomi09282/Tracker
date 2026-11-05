// Seeds a SCRATCH backend (own port, throwaway encrypted DB) with enough marketplace posts, authors,
// pictures and reports to see paging, every post state, the draft variant and the disabled author.
//
//   cd backend && node <this file> --api http://localhost:3722
//
// The env (DB_PATH, DB_MASTER_KEY, DB_KEY_SALT) must be the scratch server's, exported in the shell. Fixtures
// are planted straight into the throwaway DB (no route makes a back-dated published post; the 021 triggers
// still police every insert); take-downs, reports and the disable go through the real API. Dev-only: it
// refuses to run against anything but localhost, and the passwords are the dev fixtures' (local only).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const api = process.argv.includes('--api') ? process.argv[process.argv.indexOf('--api') + 1] : 'http://localhost:3722';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(api)) throw new Error('scratch only');
const require = createRequire(path.resolve('package.json'));
const Database = require('better-sqlite3-multiple-ciphers');
const sharp = require('sharp');
const { deriveDbKeyHex } = await import(pathUrl('src/lib/dbkey.js'));
const { parseBody } = await import(pathUrl('src/public/markdown.js'));
function pathUrl(p) { return new URL(`file:///${path.resolve(p).replace(/\\/g, '/')}`).href; }

const conn = new Database(process.env.DB_PATH);
conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
conn.pragma('busy_timeout = 5000');
conn.pragma('foreign_keys = ON');
const run = (sql, ...p) => conn.prepare(sql).run(...p);
const one = (sql, ...p) => conn.prepare(sql).get(...p);
const now = Math.floor(Date.now() / 1000);
const DAY = 86400;

/* a tiny cookie-jar client (login once per account; the scratch limiter is per IP) */
async function session(email, password) {
  const res = await fetch(`${api}/api/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf': '1' }, body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  const jar = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (url, init = {}) => {
    const r = await fetch(`${api}/api/v1${url}`, {
      ...init, headers: { 'content-type': 'application/json', 'x-csrf': '1', cookie: jar, ...(init.headers ?? {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
}
const PW = 'TrackerDev123';
const adminId = one("SELECT id FROM users WHERE email = 'admin@tracker.local'").id;
const argon2 = require('argon2');
const hash = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/* pictures: the three approved graphite renders, re-encoded as the server's own pipeline does (webp 1600 + 480) */
const KEPEK = 'C:/Users/Petike/Documents/TRACKER-mockups/5-pulse/kepek';
const mediaDir = path.resolve('storage', 'media', 'public');
fs.mkdirSync(mediaDir, { recursive: true });
const key = () => `pub_${randomBytes(16).toString('hex')}.webp`;
async function picture(file) {
  const src = sharp(path.join(KEPEK, file));
  const big = await src.clone().resize({ width: 1600, withoutEnlargement: false }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const small = await src.clone().resize({ width: 480 }).webp({ quality: 80 }).toBuffer();
  return { big: big.data, small, w: big.info.width, h: big.info.height, bytes: big.data.length };
}
const PICS = { gym: await picture('cover-gym.png'), bar: await picture('cover-bar.png'), grip: await picture('hero-grip.png'), plates: await picture('hero-plates.png') };

/* authors */
function author(email, name, handle, { verified = false } = {}) {
  let u = one('SELECT id FROM users WHERE email = ?', email);
  const uid = u ? u.id : Number(run("INSERT INTO users (email, display_name, password_hash, role, created_at) VALUES (?, ?, ?, 'coach', unixepoch() - 9999999)", email, name, hash).lastInsertRowid);
  run('INSERT OR IGNORE INTO guidelines_acceptances (user_id, version) SELECT ?, version FROM guidelines_versions WHERE active = 1', uid);
  const bio = parseBody(`${name} edző.`);
  run(`INSERT OR IGNORE INTO coach_profiles (user_id, handle, display_name, headline, bio_src, bio_doc, doc_version, city_key, published_at, listed_at, verified_at, verified_by)
       VALUES (?, ?, ?, 'Személyi edző', ?, ?, ?, 'budapest', unixepoch(), unixepoch(), ?, ?)`,
    uid, handle, name, `${name} edző.`, bio.json, bio.version, verified ? now : null, verified ? adminId : null);
  return { uid, handle, name };
}
const A = {
  kp: author('kovacs.peter@pelda.hu', 'Kovács Péter', 'kovacs-peter', { verified: true }),
  sr: author('szilagyi.reka@pelda.hu', 'Szilágyi Réka', 'szilagyi-reka', { verified: true }),
  ft: author('feher.tamas@pelda.hu', 'Fehér Tamás', 'feher-tamas'),
  sg: author('szeles.gabor@pelda.hu', 'Széles Gábor', 'szeles-gabor'),
  na: author('nagy.anna@pelda.hu', 'Nagy Anna', 'nagy-anna'),
  ds: author('disabled.author@pelda.hu', 'Molnár Zsolt', 'molnar-zsolt'),
};

let seq = 0;
// Deterministic public ids (12 chars): the capture states of this package name them.
const pid = () => `Ax${String((seq += 1)).padStart(10, '0')}`;
const posts = {};
function plant(name, a, { title, src, kind = 'program', daysAgo, draft = false, deleted = false, city = 'budapest', event = null, price = 12000, pics = [] }) {
  const body = parseBody(src ?? 'Háromórás gyakorlati műhely a guggolás technikájáról: állásszélesség és lábfejállás, törzsfeszítés és légzés, gyakori hibák videóelemzéssel. Hozz magaddal edzőcipőt és kényelmes ruhát.\n\nA részvétel előzetes regisztrációhoz kötött, a helyek száma korlátozott.');
  const publicId = pid();
  const pubAt = draft ? null : now - daysAgo * DAY;
  const createdAt = (pubAt ?? now - daysAgo * DAY) - 86400 * 0.6;
  const withPrice = kind !== 'announcement' && price != null;
  const rowId = Number(run(
    `INSERT INTO coach_posts (public_id, author_user_id, kind_key, title, body_src, body_doc, body_excerpt, doc_version, city_key, event_at, event_tz, capacity,
                              price_minor, price_currency, published_at, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    publicId, a.uid, kind, title, src ?? 'Háromórás gyakorlati műhely a guggolás technikájáról.', body.json, body.excerpt, body.version, city,
    event?.at ?? null, event ? 'Europe/Budapest' : null, event?.cap ?? null, withPrice ? price : null, withPrice ? 'HUF' : null,
    pubAt, deleted ? now - 3 * DAY : null, createdAt, createdAt).lastInsertRowid);
  pics.forEach((p, i) => {
    const k = key(), t = key(); // every media row owns its two files (storage keys are unique)
    fs.writeFileSync(path.join(mediaDir, k), PICS[p].big);
    fs.writeFileSync(path.join(mediaDir, t), PICS[p].small);
    run(
      `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, width, height, bytes, alt, sort_order) VALUES (?, ?, ?, ?, 'image/webp', ?, ?, ?, NULL, ?)`,
      rowId, i === 0 ? 'cover' : 'gallery', k, t, PICS[p].w, PICS[p].h, PICS[p].bytes, i);
  });
  posts[name] = { id: publicId, rowId, title };
}
const ev = (d) => ({ at: now + d * DAY, cap: 16 });

plant('squat', A.kp, { title: 'Guggolás-technika műhely – október 30.', kind: 'event', daysAgo: 33, event: ev(26), pics: ['gym', 'bar', 'grip'] });
plant('nov', A.kp, { title: 'Novembertől két új időpont', kind: 'announcement', daysAgo: 30 });
plant('half', A.sr, { title: 'Félmaraton 12 hét alatt – kezdőknek', daysAgo: 56, price: 24000, pics: ['bar'] });
plant('cali', A.ft, { title: 'Ingyenes kalisztenika bemelegítő sorozat', kind: 'announcement', daysAgo: 71 });
plant('autumn', A.kp, { title: 'Őszi erőblokk – 8 hetes csoportos program', daysAgo: 48, deleted: true, price: 32000, pics: ['plates'] });
plant('fast', A.sg, { title: 'Gyors fogyás 7 nap alatt', daysAgo: 24, price: 9900 });
plant('mob', A.na, { title: 'Hétvégi mobilitás – 6 hetes online program', daysAgo: 19, draft: true, city: 'online', price: 24000 });
plant('squat2', A.kp, { title: 'Guggolás-technika műhely – október 30.', kind: 'event', daysAgo: 47, event: ev(-18), pics: ['gym', 'bar', 'grip'] });
plant('author-off', A.ds, { title: 'Csoportos futóedzés a Margitszigeten', daysAgo: 12, kind: 'event', event: ev(9), pics: ['grip'] });
const TOPICS = ['Kettlebell alapok', 'Erőemelés kezdőknek', 'Nyújtás és regeneráció', 'Core-edzés otthon', 'HIIT hétköznap reggel', 'Táplálkozási tanácsadás', 'Futás technika elemzés', 'Online jóga és mobilitás', 'Súlyzós alapozó négy hét', 'Medencés edzés', 'Funkcionális kör', 'Boksz fitnesz', 'Hátfájás elleni gyakorlatok', 'Kocogóklub újoncoknak', 'Törzsstabilitás haladóknak', 'Rugalmasság és egyensúly', 'Kardió heti három alkalom', 'Vállöv erősítés', 'Terhesség alatti mozgás', 'Senior erőnléti csoport', 'Tavaszi formába hozó program', 'Páros edzés hétvégén', 'Szabadtéri kör a parkban', 'Reggeli mozgásrutin'];
const authors = [A.kp, A.sr, A.ft, A.sg, A.na];
TOPICS.forEach((t, i) => plant(`f${i}`, authors[i % 5], { title: `${t}`, kind: ['program', 'event', 'announcement'][i % 3], daysAgo: 80 + i * 3, event: i % 3 === 1 ? ev(20 + i) : null, price: i % 3 === 2 ? null : 8000 + i * 500, draft: i % 11 === 5 }));

/* reports (real API, two reporters) */
for (const [e, n] of [['reporter1@pelda.hu', 'Reporter Egy'], ['reporter2@pelda.hu', 'Reporter Kettő'], ['reporter3@pelda.hu', 'Reporter Három']]) {
  run("INSERT OR IGNORE INTO users (email, display_name, password_hash, role) VALUES (?, ?, ?, 'user')", e, n, hash);
}
const r1 = await session('reporter1@pelda.hu', PW);
const r2 = await session('reporter2@pelda.hu', PW);
const r3 = await session('reporter3@pelda.hu', PW);
const rep = (s, name, reason, note = null) => s('/reports', { method: 'POST', body: { post_id: posts[name].id, handle: null, reason_key: reason, note } });
const out = [];
out.push(await rep(r1, 'squat', 'scam'), await rep(r2, 'squat', 'scam'), await rep(r3, 'squat', 'other'));
out.push(await rep(r1, 'squat2', 'scam'), await rep(r2, 'squat2', 'scam'), await rep(r3, 'squat2', 'other'));
out.push(await rep(r1, 'cali', 'spam'), await rep(r2, 'half', 'dangerous_advice'), await rep(r1, 'fast', 'dangerous_advice'));

/* admin actions through the real API */
const admin = await session('admin@tracker.local', PW);
out.push(await admin('/admin/marketplace/remove', { method: 'POST', body: { post_id: posts.fast.id, handle: null, removal_reason: 'Veszélyes tanács: kockázatos, szélsőséges fogyókúra.' } }));
// a closed report on a removed post: upheld with removal
const rr = await admin('/admin/marketplace/reports?status=open');
const fastReport = rr.json?.reports?.find((r) => r.postId === posts.fast.id);
if (fastReport) out.push(await admin(`/admin/marketplace/reports/${fastReport.id}/resolve`, { method: 'POST', body: { status: 'rejected', note: 'Már levéve.', remove: false, removal_reason: null } }));
// squat2: the closed state of frame admin-post-detail-2: the scam reports upheld (the first takes the post down), the other rejected
const closedReports = (await admin('/admin/marketplace/reports?status=open')).json?.reports?.filter((r) => r.postId === posts.squat2.id) ?? [];
for (const r of closedReports) {
  const scam = r.reason === 'scam';
  const first = scam && r === closedReports.find((x) => x.reason === 'scam');
  out.push(await admin(`/admin/marketplace/reports/${r.id}/resolve`, { method: 'POST', body: scam ? { status: 'upheld', note: null, remove: first, removal_reason: first ? 'Átverés: a megadott helyszín nem létezik.' : null } : { status: 'rejected', note: null, remove: false, removal_reason: null } }));
}
const molnarId = A.ds.uid;
out.push(await admin(`/admin/users/${molnarId}/disable`, { method: 'POST', body: { reason: 'Sértő üzenetek' } }));

console.log('seeded posts:', Object.keys(posts).length, 'api statuses:', out.map((o) => o.status).join(','));
console.log(JSON.stringify(Object.fromEntries(Object.entries(posts).slice(0, 9).map(([k, v]) => [k, v.id]))));
