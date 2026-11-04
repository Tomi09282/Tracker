// scripts/smoke/admin-posts.js — the admin side of marketplace posts (package B-admin-posts) against
// the running server: the five attack passes (forge / replay / race / IDOR / extremes) for
//
//   GET  /admin/marketplace/posts
//   GET  /admin/marketplace/posts/:publicId
//   POST /admin/marketplace/posts/:publicId/restore
//   GET  /admin/marketplace/media/:key
//   POST /admin/marketplace/remove          (reused take-down: the response body and the account limiter)
//
// plus THE VISIBILITY GAP: disabling or demoting an author must remove their posts, profile and
// pictures from EVERY public read, and enabling/promoting must bring them back.
//
// Imported by scripts/smoke.js (after the LifeOS sections) and runnable alone:
//   node scripts/smoke-run.mjs --only=admin-posts
// Every check here has a planted defect it fails against: scripts/mutants-admin-posts.mjs applies
// them one at a time and demands a red run for each.
//
// FIXTURES are planted straight into the throwaway smoke database (there is no route that makes a
// published post with a back-dated publication time, and the 021 triggers still police every insert).
// Every ASSERTION goes through the API, or reads the rows the API wrote.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export async function adminPostsSmoke({ call, check, Jar, stamp, PASSWORD }) {
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { default: sharp } = await import('sharp');
  const { deriveDbKeyHex } = await import('../../src/lib/dbkey.js');
  const { parseBody } = await import('../../src/public/markdown.js');
  const conn = new Database(process.env.DB_PATH);
  conn.pragma(`hexkey='${deriveDbKeyHex(process.env.DB_MASTER_KEY, process.env.DB_KEY_SALT)}'`);
  conn.pragma('busy_timeout = 5000');
  conn.pragma('foreign_keys = ON');
  const run = (sql, ...p) => conn.prepare(sql).run(...p);
  const one = (sql, ...p) => conn.prepare(sql).get(...p);
  const all = (sql, ...p) => conn.prepare(sql).all(...p);

  const B36 = (stamp % 2_000_000_000).toString(36);
  const MARK = `apx${B36}`; // lowercase: every fixture title starts with it, so q=MARK isolates the corpus
  const nowSec = () => Math.floor(Date.now() / 1000);
  const mediaDir = path.resolve('storage', 'media', 'public');
  fs.mkdirSync(mediaDir, { recursive: true });
  const writtenFiles = [];
  const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#808080' } }).webp().toBuffer();
  const mediaKey = () => `pub_${randomBytes(16).toString('hex')}.webp`;

  let seq = 0;
  const pid = () => `Ap${B36.slice(-6).padStart(6, '0')}${String((seq += 1)).padStart(4, '0')}`; // 12 chars
  const b64 = (v) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');

  /* ── accounts ──────────────────────────────────────────────────────────────────────────────── */
  const accounts = [];
  const account = async (label, role) => {
    const email = `${MARK}-${label}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    if (role !== 'user') run('UPDATE users SET role = ? WHERE email = ?', role, email);
    const jar = new Jar();
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    const a = { label, email, jar, id, role };
    accounts.push(a);
    return a;
  };
  const admin1 = await account('admin1', 'admin');
  const admin2 = await account('admin2', 'admin');
  const adminStale = await account('adminstale', 'admin'); // demoted in the database AFTER login: the token still says admin
  const adminOff = await account('adminoff', 'admin'); // disabled in the database AFTER login
  const plain = await account('plain', 'user');
  const coachTok = await account('coachtok', 'coach');
  const rep1 = await account('rep1', 'user');
  const rep2 = await account('rep2', 'user');
  check('fixtures: six real sessions logged in', [admin1, admin2, adminStale, adminOff, plain, coachTok, rep1, rep2].every((a) => Number.isInteger(a.id)));

  /** A coach with a published profile who has accepted the guidelines (can own published posts). */
  const author = (label, { city = null } = {}) => {
    const email = `${MARK}-${label}-author@example.com`;
    const uid = Number(run(
      "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, 'x', 'coach', unixepoch() - 999999)", email,
    ).lastInsertRowid);
    run('INSERT INTO guidelines_acceptances (user_id, version) SELECT ?, version FROM guidelines_versions WHERE active = 1', uid);
    const bio = parseBody(`Bio of ${label}.`);
    const handle = `${MARK.slice(0, 12)}-${label}`.replace(/[^a-z0-9-]/g, '').slice(0, 30);
    run(
      `INSERT INTO coach_profiles (user_id, handle, display_name, headline, bio_src, bio_doc, doc_version,
                                   city_key, published_at, listed_at)
       VALUES (?, ?, ?, 'Probe', ?, ?, ?, ?, unixepoch(), unixepoch())`,
      uid, handle, `Author ${label} ${MARK}`, `Bio of ${label}.`, bio.json, bio.version, city,
    );
    return { uid, handle, email, name: `Author ${label} ${MARK}` };
  };

  const kindProgram = 'program';
  const posts = {}; // name -> { id (public), rowId, authorUid, title, ... }
  /** Plant a post. `published` is a seconds offset into the past (always > 24h so the quota is never touched). */
  const plant = (name, a, {
    title, src = `The body of ${name}.`, kind = kindProgram, published = 200_000, deleted = false,
    city = null, event = null, price = true, media = 0, draft = false,
  }) => {
    const body = parseBody(src);
    const publicId = pid();
    const pubAt = draft ? null : nowSec() - published;
    const createdAt = (pubAt ?? nowSec() - 150_000) - 100;
    const f = { eventAt: null, eventTz: null, capacity: null, ...(event ?? {}) };
    const withPrice = kind === 'announcement' ? false : price;
    const rowId = Number(run(
      `INSERT INTO coach_posts (public_id, author_user_id, kind_key, title, body_src, body_doc, body_excerpt, doc_version,
                                city_key, event_at, event_tz, capacity, price_minor, price_currency,
                                published_at, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      publicId, a.uid, kind, title, src, body.json, body.excerpt, body.version, city, f.eventAt, f.eventTz, f.capacity,
      withPrice ? 45000 : null, withPrice ? 'HUF' : null, pubAt, deleted ? nowSec() - 100_000 : null, createdAt, createdAt,
    ).lastInsertRowid);
    const keys = [];
    for (let i = 0; i < media; i += 1) {
      const key = mediaKey();
      const thumb = mediaKey();
      for (const k of [key, thumb]) {
        fs.writeFileSync(path.join(mediaDir, k), webp);
        writtenFiles.push(path.join(mediaDir, k));
      }
      run(
        `INSERT INTO post_media (post_id, role_key, storage_key, thumb_key, mime, width, height, bytes, alt, sort_order)
         VALUES (?, ?, ?, ?, 'image/webp', 8, 8, ?, ?, ?)`,
        rowId, i === 0 ? 'cover' : 'gallery', key, thumb, webp.length, `alt ${name} ${i}`, i,
      );
      keys.push({ key, thumb });
    }
    posts[name] = { name, id: publicId, rowId, authorUid: a.uid, title, keys, draft };
    return posts[name];
  };

  const authorA = author('a');
  const authorB = author('b');
  const authorC = author('c', { city: 'kecskemet' }); // THE VISIBILITY AUTHOR: the only profile and post in that city
  const secret = `draftsecret${B36}`;
  const visWord = `visword${B36}`;

  plant('L1', authorA, { title: `${MARK} Live guggolás mesterkurzus`, src: 'The **first** live post.\n\n- one\n- two', media: 3, published: 400_000 });
  plant('L2', authorB, { title: `${MARK} Live announcement`, kind: 'announcement', published: 300_000 });
  plant('L3', authorB, {
    title: `${MARK} Live event`, kind: 'event', published: 310_000, city: 'budapest',
    event: { eventAt: nowSec() + 86_400 * 30, eventTz: 'Europe/Budapest', capacity: 24 },
  });
  plant('D1', authorA, { title: `${MARK} Private draft`, src: `A private draft with ${secret} inside.`, draft: true, media: 2 });
  plant('W1', authorA, { title: `${MARK} Withdrawn by author`, deleted: true, media: 1, published: 350_000 });
  plant('R1', authorA, { title: `${MARK} To be removed one`, media: 2, published: 360_000 });
  plant('R2', authorB, { title: `${MARK} To be removed two`, published: 365_000 });
  plant('D2', authorA, { title: `${MARK} Removed draft`, src: `Another private draft, ${secret} again.`, draft: true });
  plant('P1', authorB, { title: `${MARK} Sale 50% off`, published: 250_000 });
  plant('P2', authorB, { title: `${MARK} a_b under_score`, published: 251_000 });
  plant('P3', authorB, { title: `${MARK} 🏋️ Hétvégi edzés`, published: 252_000 });
  plant('V1', authorC, { title: `${MARK} Visibility probe`, src: `The probe post. ${visWord}`, city: 'kecskemet', media: 1, published: 270_000 });
  // Twelve fillers in groups of four sharing ONE publication time: the keyset tie-break has to hold.
  for (let i = 0; i < 12; i += 1) {
    plant(`F${i}`, authorB, { title: `${MARK} Filler ${String(i).padStart(2, '0')}`, published: 200_000 + Math.floor(i / 4) * 1_000 });
  }
  const FIXTURE_COUNT = Object.keys(posts).length; // 24
  const adminId = (a) => a.id;

  const get = (url, who) => call(url, { jar: who?.jar });
  const post = (url, who, body) => call(url, { method: 'POST', jar: who?.jar, body });
  const list = (qs, who = admin1) => get(`/api/v1/admin/marketplace/posts?${qs}`, who);
  const detail = (name, who = admin1, qs = '') => get(`/api/v1/admin/marketplace/posts/${posts[name].id}${qs}`, who);
  const restore = (name, who = admin1, body) => post(`/api/v1/admin/marketplace/posts/${posts[name].id}/restore`, who, body);
  const takeDown = (name, who = admin1, reason = 'smoke take-down') =>
    post('/api/v1/admin/marketplace/remove', who, { post_id: posts[name].id, handle: null, removal_reason: reason });
  const auditCount = (action, name) =>
    one('SELECT COUNT(*) AS n FROM audit_log WHERE action = ? AND target_type = ? AND target_id = ?', action, 'coach_post', posts[name].rowId).n;
  const row = (name) => one('SELECT removed_at AS removedAt, removed_by AS removedBy, removal_reason AS reason, row_version AS v FROM coach_posts WHERE id = ?', posts[name].rowId);
  const ids = (json) => (json?.posts ?? []).map((p) => p.id);

  /* ── reports through the real API: two reporters on L1, one on L2 ───────────────────────────── */
  console.log('\n── admin posts: fixtures ─────────────────────────────────────────────────────────────');
  {
    const r1 = await post('/api/v1/reports', rep1, { post_id: posts.L1.id, handle: null, reason_key: 'spam', note: 'looks like spam' });
    const r2 = await post('/api/v1/reports', rep2, { post_id: posts.L1.id, handle: null, reason_key: 'scam', note: null });
    const r3 = await post('/api/v1/reports', rep1, { post_id: posts.L2.id, handle: null, reason_key: 'other', note: null });
    check('fixtures: three reports filed through POST /reports', [r1, r2, r3].every((r) => r.res.status === 201), [r1, r2, r3].map((r) => r.res.status).join(','));
  }

  /* ── 1. FORGE ───────────────────────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: forge (who may call, what shapes are accepted) ─────────────────────────');
  {
    const urls = [
      ['GET', '/api/v1/admin/marketplace/posts'],
      ['GET', `/api/v1/admin/marketplace/posts/${posts.L1.id}`],
      ['POST', `/api/v1/admin/marketplace/posts/${posts.R1.id}/restore`],
      ['GET', `/api/v1/admin/marketplace/media/${posts.L1.keys[0].key}`],
    ];
    for (const [method, url] of urls) {
      const anon = await call(url, { method, body: method === 'POST' ? {} : undefined });
      check(`${method} ${url.replace(/\/[A-Za-z0-9_-]{12}\b/, '/:publicId').replace(/pub_[a-f0-9]+\.webp/, ':key')} without a session -> 401`, anon.res.status === 401, `${anon.res.status}`);
      for (const who of [plain, coachTok]) {
        const r = await call(url, { method, jar: who.jar, body: method === 'POST' ? {} : undefined });
        check(`  ... as a ${who.role} -> 403`, r.res.status === 403, `${r.res.status} ${r.json?.code ?? ''}`);
      }
    }
    // The token says admin; the DATABASE says otherwise. requireRole reads the token, so these reach
    // the handler - and the database re-check must be what refuses them.
    run("UPDATE users SET role = 'user' WHERE id = ?", adminStale.id);
    for (const [method, url] of urls) {
      const r = await call(url, { method, jar: adminStale.jar, body: method === 'POST' ? {} : undefined });
      check(`a token-admin demoted in the database is refused on ${method} ${url.split('/').slice(4, 6).join('/')}`, r.res.status === 403, `${r.res.status}`);
    }
    check('and its refused restore wrote nothing (R1 untouched, no audit row)', row('R1').removedAt === null && auditCount('marketplace.moderation.restore', 'R1') === 0);
    run('UPDATE users SET disabled_at = unixepoch() WHERE id = ?', adminOff.id);
    {
      const r = await get('/api/v1/admin/marketplace/posts', adminOff);
      check('a disabled admin is refused on the list (401 or 403, never data)', [401, 403].includes(r.res.status) && !r.json?.posts, `${r.res.status}`);
      const w = await restore('R1', adminOff, {});
      check('a disabled admin cannot restore', [401, 403].includes(w.res.status), `${w.res.status}`);
    }

    // CSRF and content type: the global layers must cover the new write.
    {
      const noCsrf = await call(`/api/v1/admin/marketplace/posts/${posts.R1.id}/restore`, { method: 'POST', jar: admin1.jar, body: {}, csrf: false });
      check('restore without X-CSRF -> 403', noCsrf.res.status === 403, `${noCsrf.res.status}`);
      const text = await fetch(`${process.env.SMOKE_BASE ?? `http://localhost:${process.env.PORT ?? 3000}`}/api/v1/admin/marketplace/posts/${posts.R1.id}/restore`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-CSRF': '1', Cookie: admin1.jar.header() }, body: 'note=x',
      });
      check('restore with a non-JSON body -> 415', text.status === 415, `${text.status}`);
    }

    // Strict bodies and params. Nothing here may reach the database.
    const strict = [
      ['an unknown body key', { note: 'x', role: 'admin' }],
      ['a removed_by smuggled in', { removed_by: admin1.id }],
      ['a non-string note', { note: 5 }],
      ['an empty-after-trim note', { note: '   ' }],
      ['a note over 500 characters', { note: 'n'.repeat(501) }],
      ['an array body', [1, 2]],
    ];
    for (const [label, body] of strict) {
      const r = await restore('R1', admin1, body);
      check(`restore rejects ${label} -> 400`, r.res.status === 400 && r.json?.code === 'validation_error', `${r.res.status}`);
    }
    check('and nothing of that reached R1', row('R1').removedAt === null);

    for (const bad of ['short', 'x'.repeat(13), '..%2F..%2Fetc%2Fpasswd', "'%20OR%201%3D1%20--", '%00%00%00%00%00%00%00%00%00%00%00%00', 'Ünïcödé12345']) {
      const d = await get(`/api/v1/admin/marketplace/posts/${bad}`, admin1);
      const r = await post(`/api/v1/admin/marketplace/posts/${bad}/restore`, admin1, {});
      check(`garbage public id "${decodeURIComponent(bad).slice(0, 14)}" -> 404 on detail and restore`, d.res.status === 404 && r.res.status === 404, `${d.res.status}/${r.res.status}`);
    }
    {
      const d = await get('/api/v1/admin/marketplace/posts/AAAAAAAAAAAA', admin1);
      const r = await post('/api/v1/admin/marketplace/posts/AAAAAAAAAAAA/restore', admin1, {});
      check('a well-formed id that does not exist -> 404 on detail and restore', d.res.status === 404 && r.res.status === 404, `${d.res.status}/${r.res.status}`);
    }

    // The list query is strict too.
    for (const qs of ['foo=1', 'state=bogus', 'sort=title%3BDROP', 'sort=reports&sort=newest', 'limit=0', 'limit=51', 'limit=abc', 'kind=Bad%20Kind', 'q=a&q=b']) {
      const r = await list(qs);
      check(`list rejects ?${qs} -> 400`, r.res.status === 400 && r.json?.code === 'validation_error', `${r.res.status}`);
    }
    // Detail's only query key.
    const dq = await detail('L1', admin1, '?body=everything');
    check('detail rejects ?body=everything -> 400', dq.res.status === 400, `${dq.res.status}`);
    const dq2 = await detail('L1', admin1, '?foo=1');
    check('detail rejects an unknown query key -> 400', dq2.res.status === 400, `${dq2.res.status}`);

    // The reused take-down: strict, public-id shaped, reason required.
    const t1 = await post('/api/v1/admin/marketplace/remove', admin1, { post_id: posts.L2.id, handle: null, removal_reason: 'x', extra: 1 });
    const t2 = await post('/api/v1/admin/marketplace/remove', admin1, { post_id: posts.L2.id, handle: null, removal_reason: '   ' });
    const t3 = await post('/api/v1/admin/marketplace/remove', admin1, { post_id: posts.L2.id, handle: 'someone', removal_reason: 'both subjects' });
    const t4 = await post('/api/v1/admin/marketplace/remove', plain, { post_id: posts.L2.id, handle: null, removal_reason: 'plain user' });
    check('take-down rejects an unknown key / a blank reason / two subjects -> 400, a plain user -> 403',
      t1.res.status === 400 && t2.res.status === 400 && t3.res.status === 400 && t4.res.status === 403, `${t1.res.status}/${t2.res.status}/${t3.res.status}/${t4.res.status}`);
    check('and L2 is still not removed', row('L2').removedAt === null);
  }

  /* ── 2. THE LIST ────────────────────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: the list (search, filters, sorts, paging) ──────────────────────────────');
  // Two take-downs first, through the reused route, so there are removed rows to list.
  {
    const a = await takeDown('R1', admin1, 'smoke: misleading claims');
    check('take-down answers the page what it needs: removed, target, replayed:false',
      a.res.status === 200 && a.json?.removed === true && a.json?.replayed === false && a.json?.state === 'removed'
      && a.json?.target?.kind === 'post' && a.json?.target?.id === posts.R1.id, JSON.stringify(a.json));
    const b = await takeDown('R2', admin1, 'smoke: second removal');
    const c = await takeDown('D2', admin1, 'smoke: a draft nobody should publish');
    check('three posts removed through POST /admin/marketplace/remove', b.res.status === 200 && c.res.status === 200);
    const again = await takeDown('R1', admin2, 'someone else, later');
    check('a repeated take-down is a replay and keeps the FIRST remover and reason',
      again.res.status === 200 && again.json?.replayed === true && row('R1').removedBy === admin1.id && row('R1').reason === 'smoke: misleading claims',
      `${again.res.status} replayed ${again.json?.replayed}`);
    check('and wrote ONE remove audit row', auditCount('marketplace.moderation.remove', 'R1') === 1, `${auditCount('marketplace.moderation.remove', 'R1')}`);
  }
  {
    const r = await list(`q=${MARK}&limit=50`);
    check('the corpus is found by its marker: every fixture, total matches', r.res.status === 200 && r.json?.total === FIXTURE_COUNT && r.json?.posts?.length === FIXTURE_COUNT, `total ${r.json?.total}, page ${r.json?.posts?.length}`);
    const sample = r.json?.posts?.find((p) => p.id === posts.L1.id);
    const keys = sample ? Object.keys(sample).sort().join(',') : '';
    check('a row has exactly the documented fields (no body, no e-mail, no row id)',
      keys === 'authorDisabled,authorHandle,authorId,authorName,authorRole,createdAt,id,kind,openReports,publishedAt,removedAt,state,title,visible,withdrawnAt', keys);
    check('the row is right: live, kind, author, 2 open reports, visible',
      sample?.state === 'live' && sample.kind === 'program' && sample.authorHandle === authorA.handle && sample.authorId === authorA.uid && sample.openReports === 2 && sample.visible === true);
    check('the list never carries a body or an e-mail', !JSON.stringify(r.json).includes('The body of') && !JSON.stringify(r.json).includes('@example.com'));
  }
  {
    const byState = {};
    for (const s of ['draft', 'live', 'withdrawn', 'removed']) {
      const r = await list(`q=${MARK}&state=${s}&limit=50`);
      byState[s] = r.json;
      check(`state=${s}: every row is ${s} and the total says how many`, r.res.status === 200 && r.json.posts.every((p) => p.state === s) && r.json.total === r.json.posts.length, `${r.json?.total}`);
    }
    check('state counts: 2 drafts (D1, D2 removed shows as removed -> 1), 1 withdrawn, 3 removed, the rest live',
      byState.draft.total === 1 && byState.withdrawn.total === 1 && byState.removed.total === 3 && byState.live.total === FIXTURE_COUNT - 5,
      `${byState.draft.total}/${byState.withdrawn.total}/${byState.removed.total}/${byState.live.total}`);
    check('a removed draft is "removed" (precedence removed > withdrawn > draft > live)', byState.removed.posts.some((p) => p.id === posts.D2.id && p.publishedAt === null));
    const k = await list(`q=${MARK}&kind=event`);
    check('kind=event finds the one event', k.json?.total === 1 && k.json.posts[0].id === posts.L3.id, `${k.json?.total}`);
  }
  {
    // SEARCH. Title substring, accent-folded title token, author handle, @handle, author display name.
    const t = await list(`q=${encodeURIComponent('Mesterkurzus')}`);
    check('search: title substring, case-insensitive', ids(t.json).includes(posts.L1.id) && t.json.total >= 1);
    const acc = await list(`q=${encodeURIComponent('guggolas')}`);
    check('search: accent-folded title token (guggolas finds Guggolás) through FTS', ids(acc.json).includes(posts.L1.id), `${acc.json?.total}`);
    const accHu = await list(`q=${encodeURIComponent('hétvégi')}`);
    const accAscii = await list(`q=${encodeURIComponent('hetvegi')}`);
    check('search: Hungarian accents both ways (hétvégi / hetvegi)', ids(accHu.json).includes(posts.P3.id) && ids(accAscii.json).includes(posts.P3.id));
    const h = await list(`q=${encodeURIComponent(authorA.handle)}`);
    check('search: by the author handle', ids(h.json).includes(posts.L1.id) && ids(h.json).includes(posts.D1.id) && !ids(h.json).includes(posts.L2.id), `${h.json?.total}`);
    const at = await list(`q=${encodeURIComponent('@' + authorA.handle)}`);
    check('search: "@handle" is the same as the handle', at.json?.total === h.json?.total, `${at.json?.total} vs ${h.json?.total}`);
    const dn = await list(`q=${encodeURIComponent(`Author b ${MARK}`)}`);
    check('search: by the author display name', ids(dn.json).includes(posts.L2.id) && !ids(dn.json).includes(posts.L1.id), `${dn.json?.total}`);
    const none = await list(`q=${encodeURIComponent(MARK + 'nothingmatchesthis')}`);
    check('search: a miss is an empty page, total 0, no cursor', none.res.status === 200 && none.json.total === 0 && none.json.posts.length === 0 && none.json.nextCursor === null);
  }
  {
    // SORTS and the keyset walk, each sort, small pages, ties on the publication time.
    for (const sort of ['newest', 'oldest', 'reports']) {
      const seen = [];
      let cursor = null;
      let pages = 0;
      let total = null;
      let ok = true;
      do {
        const r = await list(`q=${MARK}&sort=${sort}&limit=5${cursor ? `&cursor=${cursor}` : ''}`);
        if (r.res.status !== 200) { ok = false; break; }
        total = r.json.total;
        seen.push(...r.json.posts);
        cursor = r.json.nextCursor;
        pages += 1;
      } while (cursor && pages < 12);
      const idsSeen = seen.map((p) => p.id);
      check(`sort=${sort}: the walk visits every post once (no skip, no repeat) in ${pages} pages`, ok && new Set(idsSeen).size === idsSeen.length && idsSeen.length === total && total === FIXTURE_COUNT, `${idsSeen.length} seen, ${new Set(idsSeen).size} distinct, total ${total}`);
      const at = (p) => p.publishedAt ?? p.createdAt;
      const mono = seen.every((p, i) => i === 0 || (sort === 'oldest' ? at(seen[i - 1]) <= at(p) : sort === 'newest' ? at(seen[i - 1]) >= at(p) : true));
      check(`sort=${sort}: the order is ${sort === 'oldest' ? 'ascending' : sort === 'newest' ? 'descending' : 'most open reports first'}`, mono && (sort !== 'reports' || (seen[0]?.id === posts.L1.id && seen[1]?.id === posts.L2.id)), `${seen[0]?.title} / ${seen[1]?.title}`);
    }
    const r = await list(`q=${MARK}&limit=5`);
    check('a full page has a cursor, the last one does not', typeof r.json.nextCursor === 'string' && r.json.posts.length === 5);
  }

  /* ── 3. THE INSPECT PAGE ────────────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: the inspect page ───────────────────────────────────────────────────────');
  {
    const r = await detail('L1');
    const j = r.json;
    check('detail: 200 with post, author, timeline, moderationLog, reports', r.res.status === 200 && j?.post && j?.author && Array.isArray(j.timeline) && Array.isArray(j.moderationLog) && j.reports, `${r.res.status}`);
    check('detail: metadata (title, kind, state, visible, no city on a program)', j.post.id === posts.L1.id && j.post.kind === 'program' && j.post.state === 'live' && j.post.city === null && j.post.publicVisibility.visible === true && j.post.publicVisibility.hiddenBy.length === 0);
    check('detail: price is display data {minor, currency, minorUnits}', j.post.price?.minor === 45000 && j.post.price?.currency === 'HUF' && Number.isInteger(j.post.price?.minorUnits), JSON.stringify(j.post.price));
    check('detail: the body excerpt travels, the document tree only on request', j.post.bodyWithheld === false && typeof j.post.body?.excerpt === 'string' && j.post.body.excerpt.length > 0 && j.post.body.doc === null);
    const full = await detail('L1', admin1, '?body=full');
    check('detail ?body=full adds the rendered tree', full.res.status === 200 && full.json.post.body.doc && typeof full.json.post.body.doc === 'object', `${typeof full.json?.post?.body?.doc}`);
    check('detail: author block (id for the account link, handle, name, role, not disabled)', j.author.id === authorA.uid && j.author.handle === authorA.handle && j.author.displayName === authorA.name && j.author.role === 'coach' && j.author.disabled === false && j.author.profile?.published === true);
    check('detail: timeline is created then published, oldest first', j.timeline.map((t) => t.kind).join(',') === 'created,published', j.timeline.map((t) => t.kind).join(','));
    check('detail: the cover comes first, then the gallery, each with an admin URL', j.post.media.length === 3 && j.post.media[0].role === 'cover' && j.post.media.every((m) => m.url === `/api/v1/admin/marketplace/media/${m.key}` && m.thumbUrl.endsWith(m.thumbKey)) && j.post.mediaWithheld === false, `${j.post.media.length}`);

    // reports: no identity, whitelisted keys, two open reports, distinct reporters counted
    check('detail: two open reports, two distinct reporters', j.reports.total === 2 && j.reports.open === 2 && j.reports.distinctReporters === 2, JSON.stringify({ t: j.reports.total, o: j.reports.open, d: j.reports.distinctReporters }));
    const repKeys = Object.keys(j.reports.items[0]).sort().join(',');
    check('detail: a report has exactly the documented keys - NO reporter identity', repKeys === 'closed,createdAt,id,note,reason,resolutionNote,resolvedAt,severity,snapshot,snapshotTruncated,status', repKeys);
    const s = JSON.stringify(j);
    check('detail: neither reporter e-mail nor reporter id appears anywhere in the answer', !s.includes(rep1.email) && !s.includes(rep2.email) && !/reporter/i.test(Object.keys(j.reports.items[0]).join(',')));
    check('detail: an open report carries its snapshot and a severity', j.reports.items.every((i) => typeof i.snapshot === 'string' && i.severity > 0 && i.status === 'open'));

    // close one report through the existing resolve route; the closed one loses its snapshot and sorts last
    const first = j.reports.items.find((i) => i.reason === 'spam');
    const resolved = await post(`/api/v1/admin/marketplace/reports/${first.id}/resolve`, admin1, { status: 'rejected', note: 'not spam', remove: false, removal_reason: null });
    check('fixture: one report rejected through the existing resolve route', resolved.res.status === 200, `${resolved.res.status}`);
    const after = (await detail('L1')).json;
    check('detail: open reports first, the closed one has no snapshot and keeps its outcome',
      after.reports.open === 1 && after.reports.items[0].status === 'open' && after.reports.items.at(-1).status === 'rejected' && after.reports.items.at(-1).snapshot === null && after.reports.items.at(-1).closed === true && after.reports.items.at(-1).resolutionNote === 'not spam');
    check('detail: moderationLog records the resolve', after.moderationLog.some((m) => m.action === 'resolve' && m.reportStatus === 'rejected' && m.by?.id === admin1.id));

    // L3: the event-specific fields
    const ev = (await detail('L3')).json.post;
    check('detail: an event carries time, zone, capacity and the city name', Number.isInteger(ev.eventAt) && ev.eventTz === 'Europe/Budapest' && ev.capacity === 24 && ev.city?.key === 'budapest' && ev.city?.name === 'Budapest', JSON.stringify({ t: ev.eventAt, z: ev.eventTz, c: ev.capacity, city: ev.city }));
    const an = (await detail('L2')).json.post;
    check('detail: an announcement has no price, no capacity, no time', an.price === null && an.capacity === null && an.eventAt === null);

    // a withdrawn post: published, so the body and the picture stay readable to the admin
    const w = (await detail('W1')).json;
    check('detail: a withdrawn post is withdrawn, still readable (it WAS public), hidden by "withdrawn"',
      w.post.state === 'withdrawn' && w.post.bodyWithheld === false && w.post.body.excerpt.length > 0 && w.post.media.length === 1 && w.post.publicVisibility.hiddenBy.includes('withdrawn') && w.timeline.some((t) => t.kind === 'withdrawn'));

    // a removed post: remover, reason, red timeline step
    const rm = (await detail('R1')).json;
    check('detail: a removed post shows who, when and why, and stays readable',
      rm.post.state === 'removed' && rm.post.removal?.by?.id === admin1.id && rm.post.removal.by.email === admin1.email && rm.post.removal.reason === 'smoke: misleading claims'
      && rm.post.publicVisibility.visible === false && rm.post.publicVisibility.hiddenBy.includes('removed') && rm.post.body?.excerpt && rm.post.media.length === 2
      && rm.timeline.at(-1).kind === 'removed' && rm.timeline.at(-1).reason === 'smoke: misleading claims', JSON.stringify(rm.post.removal));
    check('detail: its moderationLog has the remove with the reason', rm.moderationLog[0]?.action === 'remove' && rm.moderationLog[0].reason === 'smoke: misleading claims');
  }

  /* ── 4. IDOR: a draft is private to its author ─────────────────────────────────────────────── */
  console.log('\n── admin posts: IDOR (a never-published post never leaks its body or pictures) ─────────');
  {
    for (const name of ['D1', 'D2']) {
      const r = await detail(name, admin1, '?body=full');
      const s = JSON.stringify(r.json);
      check(`${name}: metadata only - bodyWithheld, mediaWithheld, no body, no media`, r.res.status === 200 && r.json.post.bodyWithheld === true && r.json.post.body === null && r.json.post.mediaWithheld === true && r.json.post.media.length === 0, `${r.res.status}`);
      check(`${name}: the secret word of the draft is nowhere in the answer, even with ?body=full`, !s.includes(secret) && !s.includes('private draft'), '');
    }
    check('D1 (a live-looking draft) is a draft, D2 (moderator-removed draft) is removed but still withheld', (await detail('D1')).json.post.state === 'draft' && (await detail('D2')).json.post.state === 'removed');
    const bySecret = await list(`q=${secret}`);
    check('the list does not search inside bodies: a word only a draft body contains finds nothing', bySecret.res.status === 200 && bySecret.json.total === 0, `${bySecret.json?.total}`);
    const byTitle = await list(`q=${encodeURIComponent('Private draft')}`);
    check('...but the draft IS found by its title (metadata is visible to the admin)', ids(byTitle.json).includes(posts.D1.id));
    const dm = await get(`/api/v1/admin/marketplace/media/${posts.D1.keys[0].key}`, admin1);
    const dmThumb = await get(`/api/v1/admin/marketplace/media/${posts.D1.keys[0].thumb}`, admin1);
    check("a draft's picture is not served to the admin either (single 404)", dm.res.status === 404 && dmThumb.res.status === 404, `${dm.res.status}/${dmThumb.res.status}`);
    check('the public routes keep refusing drafts as before', (await get(`/api/v1/public/posts/${posts.D1.id}`)).res.status === 404 && (await get(`/api/v1/public/media/${posts.D1.keys[0].key}`)).res.status === 404);
  }

  /* ── 5. THE PICTURE ROUTE ───────────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: pictures for the admin page ────────────────────────────────────────────');
  {
    const live = await get(`/api/v1/admin/marketplace/media/${posts.L1.keys[0].key}`, admin1);
    check('a live post picture: 200 image/webp, private cache, nosniff',
      live.res.status === 200 && live.res.headers.get('content-type') === 'image/webp' && /private/.test(live.res.headers.get('cache-control') ?? '') && live.res.headers.get('x-content-type-options') === 'nosniff',
      `${live.res.status} ${live.res.headers.get('content-type')} ${live.res.headers.get('cache-control')}`);
    const thumb = await get(`/api/v1/admin/marketplace/media/${posts.L1.keys[0].thumb}`, admin1);
    check('the thumbnail key serves too', thumb.res.status === 200);
    const removed = await get(`/api/v1/admin/marketplace/media/${posts.R1.keys[0].key}`, admin1);
    const pubRemoved = await get(`/api/v1/public/media/${posts.R1.keys[0].key}`);
    check("a REMOVED post's picture is readable by the admin (that is the page's whole point) and 404 for the public", removed.res.status === 200 && pubRemoved.res.status === 404, `${removed.res.status}/${pubRemoved.res.status}`);
    const withdrawn = await get(`/api/v1/admin/marketplace/media/${posts.W1.keys[0].key}`, admin1);
    check("a withdrawn post's picture is readable by the admin", withdrawn.res.status === 200);
    for (const bad of ['pub_zz.webp', '..%2F..%2Fpackage.json', `pub_${'0'.repeat(32)}.webp`, `PUB_${'a'.repeat(32)}.webp`, `pub_${'a'.repeat(32)}.png`]) {
      const r = await get(`/api/v1/admin/marketplace/media/${bad}`, admin1);
      check(`garbage / unknown picture key "${decodeURIComponent(bad).slice(0, 18)}" -> 404`, r.res.status === 404, `${r.res.status}`);
    }
    run('UPDATE post_media SET deleted_at = unixepoch() WHERE storage_key = ?', posts.W1.keys[0].key);
    const gone = await get(`/api/v1/admin/marketplace/media/${posts.W1.keys[0].key}`, admin1);
    check('a soft-deleted picture is a 404', gone.res.status === 404);
    run('UPDATE post_media SET deleted_at = NULL WHERE storage_key = ?', posts.W1.keys[0].key);
  }

  /* ── 6. RESTORE: replay, race ──────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: restore (replay, race, audit) ─────────────────────────────────────────');
  {
    const live = await restore('L2', admin1, {});
    check('restoring a post that is not removed -> 409 not_removed, nothing written', live.res.status === 409 && live.json?.reason === 'not_removed' && auditCount('marketplace.moderation.restore', 'L2') === 0, `${live.res.status} ${live.json?.reason}`);
    const draft = await restore('D1', admin1, {});
    check('...also for a draft and ...', draft.res.status === 409 && auditCount('marketplace.moderation.restore', 'D1') === 0);

    const before = row('R1');
    const noBody = await call(`/api/v1/admin/marketplace/posts/${posts.R1.id}/restore`, { method: 'POST', jar: admin1.jar });
    check('restore with NO body at all is accepted (the note is optional) -> 200', noBody.res.status === 200 && noBody.json?.restored === true && noBody.json?.replayed === false, `${noBody.res.status} ${JSON.stringify(noBody.json)}`);
    const after = row('R1');
    check('the three removal columns are cleared together and row_version moves', after.removedAt === null && after.removedBy === null && after.reason === null && after.v === before.v + 1, JSON.stringify(after));
    check('the answer says what the page needs: id, state live, visible, rowVersion', noBody.json?.post?.id === posts.R1.id && noBody.json.post.state === 'live' && noBody.json.post.visible === true && noBody.json.post.rowVersion === after.v, JSON.stringify(noBody.json?.post));
    check('ONE restore audit row, with actor, target, request id and the previous remover and reason',
      (() => {
        const a = one("SELECT actor_id AS actor, target_type AS tt, target_id AS tid, request_id AS rid, detail FROM audit_log WHERE action = 'marketplace.moderation.restore' AND target_id = ?", posts.R1.rowId);
        const d = a ? JSON.parse(a.detail) : {};
        return auditCount('marketplace.moderation.restore', 'R1') === 1 && a.actor === admin1.id && a.tt === 'coach_post' && a.tid === posts.R1.rowId && !!a.rid && d.previousRemovedBy === admin1.id && d.previousRemovalReason === 'smoke: misleading claims';
      })());
    check('the post is public again (the author is an enabled coach)', (await get(`/api/v1/public/posts/${posts.R1.id}`)).res.status === 200);
    const second = await restore('R1', admin1, {});
    check('REPLAY: the second restore -> 409 not_removed and no second audit row', second.res.status === 409 && second.json?.reason === 'not_removed' && auditCount('marketplace.moderation.restore', 'R1') === 1, `${second.res.status} audit ${auditCount('marketplace.moderation.restore', 'R1')}`);
    const log = (await detail('R1')).json;
    check('and the history keeps both events: restore on top of the original remove (the row alone has forgotten it)', log.post.state === 'live' && log.post.removal === null && log.moderationLog[0]?.action === 'restore' && log.moderationLog.some((m) => m.action === 'remove' && m.reason === 'smoke: misleading claims'), log.moderationLog.map((m) => m.action).join(','));
    const withNote = await restore('R2', admin1, { note: 'appeal upheld' });
    check('a restore with a note records it in the audit trail', withNote.res.status === 200 && JSON.parse(one("SELECT detail FROM audit_log WHERE action = 'marketplace.moderation.restore' AND target_id = ?", posts.R2.rowId).detail).note === 'appeal upheld');
    const d2 = await restore('D2', admin1, {});
    const d2Detail = (await detail('D2', admin1, '?body=full')).json;
    check('restoring a removed DRAFT returns it to draft and its body stays withheld', d2.res.status === 200 && d2.json.post.state === 'draft' && d2Detail.post.state === 'draft' && d2Detail.post.body === null);
  }
  {
    // RACE 1: two admins restore the same removed post at the same instant.
    await takeDown('R2', admin1, 'race round');
    const base = auditCount('marketplace.moderation.restore', 'R2');
    const [a, b] = await Promise.all([restore('R2', admin1, {}), restore('R2', admin2, {})]);
    const codes = [a.res.status, b.res.status].sort();
    check('RACE: two admins restoring the same post at once -> exactly one 200 and one 409', codes[0] === 200 && codes[1] === 409, codes.join(','));
    check('...exactly ONE new audit row, and the post is live', auditCount('marketplace.moderation.restore', 'R2') === base + 1 && row('R2').removedAt === null, `${auditCount('marketplace.moderation.restore', 'R2') - base}`);

    // RACE 2: a take-down and a restore of the same post at the same instant, several rounds.
    let consistent = true;
    let fiveHundreds = 0;
    const seenEnds = new Set();
    for (let i = 0; i < 12; i += 1) {
      // Start each round from "removed".
      if (row('R2').removedAt === null) await takeDown('R2', admin1, `round ${i}`);
      const removesBefore = auditCount('marketplace.moderation.remove', 'R2');
      const restoresBefore = auditCount('marketplace.moderation.restore', 'R2');
      const lastBefore = one('SELECT MAX(id) AS m FROM audit_log').m;
      // Alternate which request is put on the wire first, so both interleavings are exercised.
      const fireT = () => takeDown('R2', admin2, `race ${i}`);
      const fireR = () => restore('R2', admin1, {});
      const [t, r] = i % 2 === 0
        ? await Promise.all([fireT(), fireR()])
        : (await Promise.all([fireR(), fireT()])).reverse();
      if (t.res.status >= 500 || r.res.status >= 500) fiveHundreds += 1;
      const rw = row('R2');
      const pairOk = (rw.removedAt === null) === (rw.removedBy === null) && (rw.removedAt === null) === (rw.reason === null);
      // The final state must be the effect of the LAST audit row written in this round.
      const last = one("SELECT action FROM audit_log WHERE id > ? AND action IN ('marketplace.moderation.remove','marketplace.moderation.restore') AND target_id = ? ORDER BY id DESC LIMIT 1", lastBefore, posts.R2.rowId);
      const expectRemoved = last?.action === 'marketplace.moderation.remove';
      const writesNow = auditCount('marketplace.moderation.remove', 'R2') - removesBefore + auditCount('marketplace.moderation.restore', 'R2') - restoresBefore;
      // restore 200 <=> one restore row; take-down of an already removed post is a replay (no row)
      const restoreRows = auditCount('marketplace.moderation.restore', 'R2') - restoresBefore;
      if (!pairOk || (rw.removedAt !== null) !== expectRemoved && last) consistent = false;
      if (!(r.res.status === 200 ? restoreRows === 1 : restoreRows === 0 && r.res.status === 409)) consistent = false;
      if (writesNow > 2) consistent = false;
      seenEnds.add(rw.removedAt === null ? 'live' : 'removed');
    }
    check('RACE: 12 rounds of take-down vs restore - no 5xx, the removal columns always move as a pair, the state is the last audited act, one audit row per effective write', consistent && fiveHundreds === 0, `5xx ${fiveHundreds}, ends ${[...seenEnds].join('/')}`);
    // leave R2 removed for later sections that need a removed post
    if (row('R2').removedAt === null) await takeDown('R2', admin1, 'final');
  }

  /* ── 7. EXTREMES ────────────────────────────────────────────────────────────────────────── */
  console.log('\n── admin posts: extremes (wildcards, long, emoji, garbage cursors) ─────────────────────');
  {
    const pct = await list(`q=${encodeURIComponent('%')}`);
    const usc = await list(`q=${encodeURIComponent('_')}`);
    const bs = await list(`q=${encodeURIComponent('\\')}`);
    check('q="%" is a literal percent sign: it finds the "50% off" post (and no wildcard flood)', pct.res.status === 200 && ids(pct.json).includes(posts.P1.id) && !ids(pct.json).includes(posts.L2.id) && pct.json.total < 5, `${pct.res.status} total ${pct.json?.total}`);
    check('q="_" is a literal underscore, not "any one character"', usc.res.status === 200 && ids(usc.json).includes(posts.P2.id) && !ids(usc.json).includes(posts.L2.id), `${usc.json?.total}`);
    check('q="\\" is a literal backslash (no escape-character break-out, no error)', bs.res.status === 200 && !ids(bs.json).includes(posts.L2.id), `${bs.res.status} ${bs.json?.total}`);
    const combo = await list(`q=${encodeURIComponent(`${MARK} 50%`)}`);
    check('"marker 50%" narrows to the one post', combo.json?.total === 1 && combo.json.posts[0].id === posts.P1.id, `${combo.json?.total}`);
    const wild = await list(`q=${encodeURIComponent('%%%%')}`);
    check('"%%%%" does not match everything', wild.res.status === 200 && wild.json.total < 5, `${wild.json?.total}`);

    const eighty = 'a'.repeat(80);
    const r80 = await list(`q=${eighty}`);
    const r81 = await list(`q=${eighty}a`);
    const rBig = await list(`q=${'a'.repeat(5000)}`);
    check('q of 80 characters is accepted, 81 and 5000 -> 400', r80.res.status === 200 && r81.res.status === 400 && rBig.res.status === 400, `${r80.res.status}/${r81.res.status}/${rBig.res.status}`);
    const emoji = await list(`q=${encodeURIComponent('🔥')}`);
    const emojiHit = await list(`q=${encodeURIComponent('🏋️')}`);
    check('emoji: no error; an emoji in a title is findable', emoji.res.status === 200 && emojiHit.res.status === 200 && ids(emojiHit.json).includes(posts.P3.id), `${emoji.res.status}/${emojiHit.res.status}`);
    const emojiTitle = (await detail('P3')).json?.post?.title;
    check('and the title round-trips intact', emojiTitle === `${MARK} 🏋️ Hétvégi edzés`);
    for (const q of ['"', "'", 'AND OR NOT', 'NEAR(a b)', 'title:', '*', '- -', '", OR 1=1 --', 'a b c d e f g h i j k l m n o p', '‮', '​']) {
      const r = await list(`q=${encodeURIComponent(q)}`);
      check(`FTS / SQL syntax in q (${JSON.stringify(q).slice(0, 22)}) is data: 200 or 400, never 500`, [200, 400].includes(r.res.status), `${r.res.status}`);
    }
    for (const q of ['%00', '%0A%0D', '%20%20%20', '']) {
      const r = await list(`q=${q}`);
      check(`q = control characters / whitespace only / empty (${JSON.stringify(decodeURIComponent(q)).slice(0, 14)}) -> 400`, r.res.status === 400, `${r.res.status}`);
    }

    const garbage = [
      ['not base64 json', 'abc'],
      ['a json object', b64({ a: 1 })],
      ['a json string', b64('x')],
      ['an empty array', b64([])],
      ['strings in the tuple', b64(['x', 'y'])],
      ['a float', b64([1.5, 2])],
      ['null parts', b64([null, null])],
      ['too many parts for newest', b64([1, 2, 3])],
      ['too few parts for newest', b64([1])],
      ['an unsafe integer', `${Buffer.from('[1e30,2]').toString('base64url')}`],
      ['201 characters', 'A'.repeat(201)],
    ];
    for (const [label, c] of garbage) {
      const r = await list(`q=${MARK}&cursor=${c}`);
      check(`cursor garbage (${label}) -> 400`, r.res.status === 400 && r.json?.code === 'validation_error', `${r.res.status}`);
    }
    const wrongSort = await list(`q=${MARK}&sort=reports&cursor=${b64([1, 2])}`);
    check('a cursor of the wrong width for the chosen sort -> 400', wrongSort.res.status === 400, `${wrongSort.res.status}`);
    const absurd = await list(`q=${MARK}&cursor=${b64([-9007199254740991, -9007199254740991])}`);
    const farFuture = await list(`q=${MARK}&cursor=${b64([9007199254740991, 9007199254740991])}`);
    check('a well-formed cursor at the numeric extremes is an ordinary page (empty or full), not an error', absurd.res.status === 200 && farFuture.res.status === 200, `${absurd.res.status}/${farFuture.res.status}`);
    const lim = await list(`q=${MARK}&limit=50`);
    check('limit=50 is the ceiling and works', lim.res.status === 200 && lim.json.posts.length === Math.min(50, FIXTURE_COUNT));
  }

  /* ── 8. THE VISIBILITY GAP: disabling or demoting an author takes them off every public read ─ */
  console.log('\n── visibility: a disabled / demoted author vanishes from EVERY public read ─────────────');
  {
    const reads = async () => {
      const [onePost, feed, search, coach, directory, media, thumb] = await Promise.all([
        get(`/api/v1/public/posts/${posts.V1.id}`),
        get('/api/v1/public/posts?city=kecskemet&limit=24'),
        get(`/api/v1/public/search?q=${visWord}`),
        get(`/api/v1/public/coaches/${authorC.handle}`),
        get('/api/v1/public/coaches?city=kecskemet&limit=24'),
        get(`/api/v1/public/media/${posts.V1.keys[0].key}`),
        get(`/api/v1/public/media/${posts.V1.keys[0].thumb}`),
      ]);
      return {
        post: onePost.res.status === 200,
        feed: ids(feed.json).includes(posts.V1.id),
        search: ids(search.json).includes(posts.V1.id),
        profile: coach.res.status === 200,
        grid: (coach.json?.posts ?? []).some((p) => p.id === posts.V1.id),
        directory: (directory.json?.coaches ?? []).some((c) => c.handle === authorC.handle),
        media: media.res.status === 200,
        thumb: thumb.res.status === 200,
      };
    };
    const allOf = (o, v) => Object.values(o).every((x) => x === v);
    const show = (o) => Object.entries(o).filter(([, v]) => v).map(([k]) => k).join(',') || 'none';

    const baseline = await reads();
    check('baseline: an enabled coach is public in all eight reads (post, feed, search, profile, grid, directory, image, thumbnail)', allOf(baseline, true), show(baseline));
    const rep = await post('/api/v1/reports', rep2, { post_id: posts.V1.id, handle: null, reason_key: 'spam', note: null });
    check('baseline: the public can report it', rep.res.status === 201, `${rep.res.status}`);

    const disable = await post(`/api/v1/admin/users/${authorC.uid}/disable`, admin1, { reason: 'smoke: visibility gap' });
    check('the admin disables the author through the real route', disable.res.status === 200, `${disable.res.status}`);
    const hidden = await reads();
    check('DISABLED: the post, the feed, the search, the profile, the post grid, the directory and both images are all gone', allOf(hidden, false), `still visible: ${show(hidden)}`);
    const rep2b = await post('/api/v1/reports', rep1, { post_id: posts.V1.id, handle: null, reason_key: 'spam', note: null });
    const rep2c = await post('/api/v1/reports', rep1, { post_id: null, handle: authorC.handle, reason_key: 'spam', note: null });
    check('DISABLED: its post and its profile cannot be reported either (they are not visible)', rep2b.res.status === 404 && rep2c.res.status === 404, `${rep2b.res.status}/${rep2c.res.status}`);
    const dv = (await detail('V1')).json;
    check('DISABLED: the admin page says so - author.disabled, hiddenBy author_disabled, visible false, state still live',
      dv.author.disabled === true && dv.post.state === 'live' && dv.post.publicVisibility.visible === false && dv.post.publicVisibility.hiddenBy.join(',') === 'author_disabled', JSON.stringify(dv.post.publicVisibility));
    const lv = (await list(`q=${encodeURIComponent('Visibility probe')}`)).json.posts.find((p) => p.id === posts.V1.id);
    check('DISABLED: the list row carries authorDisabled:true, visible:false', lv?.authorDisabled === true && lv?.visible === false);
    const adminImg = await get(`/api/v1/admin/marketplace/media/${posts.V1.keys[0].key}`, admin1);
    check('DISABLED: the admin can still open its picture (a moderator reviews it)', adminImg.res.status === 200);

    const enable = await post(`/api/v1/admin/users/${authorC.uid}/enable`, admin1, { reason: 'smoke: visibility gap, account restored' });
    check('the admin enables the author again', enable.res.status === 200, `${enable.res.status}`);
    const back = await reads();
    check('RE-ENABLED: all eight reads are back, with no sweep', allOf(back, true), `missing: ${Object.entries(back).filter(([, v]) => !v).map(([k]) => k).join(',')}`);

    const demote = await post(`/api/v1/admin/users/${authorC.uid}/role`, admin1, { role: 'user' });
    check('the admin demotes the coach to a plain user', demote.res.status === 200, `${demote.res.status}`);
    const demoted = await reads();
    check('DEMOTED: everything is gone again (a plain user is not a coach)', allOf(demoted, false), `still visible: ${show(demoted)}`);
    const dd = (await detail('V1')).json;
    check('DEMOTED: hiddenBy says author_not_coach', dd.post.publicVisibility.hiddenBy.join(',') === 'author_not_coach' && dd.post.publicVisibility.visible === false, JSON.stringify(dd.post.publicVisibility));
    const promote = await post(`/api/v1/admin/users/${authorC.uid}/role`, admin1, { role: 'coach' });
    const promoted = await reads();
    check('PROMOTED back to coach: public again', promote.res.status === 200 && allOf(promoted, true), `${promote.res.status} missing ${Object.entries(promoted).filter(([, v]) => !v).map(([k]) => k).join(',')}`);

    // an unpublished profile / a removed profile were already hidden; keep them hidden (no regression)
    run('UPDATE coach_profiles SET published_at = NULL WHERE user_id = ?', authorC.uid);
    const unpub = await reads();
    const du = (await detail('V1')).json;
    run('UPDATE coach_profiles SET published_at = unixepoch() WHERE user_id = ?', authorC.uid);
    check('an unpublished profile still hides the post (no regression) and the admin page names it', allOf(unpub, false) && du.post.publicVisibility.hiddenBy.join(',') === 'profile_unpublished', show(unpub));
    check('...and publishing it again restores everything', allOf(await reads(), true));
  }

  /* ── 9. the static facts the limiters-skipped test mode cannot show ──────────────────────────── */
  console.log('\n── admin posts: both limiter tiers on every new route (static) ─────────────────────────');
  {
    const src = fs.readFileSync(path.resolve('src', 'public', 'admin-posts.js'), 'utf8').replace(/\r\n/g, '\n');
    const routes = [...src.matchAll(/router\.(get|post)\(\s*\n?\s*'([^']+)'([\s\S]*?)asyncRoute\(/g)];
    const bad = routes.filter(([, , , chain]) => !/IpLimiter/.test(chain) || !/AdminLimiter/.test(chain));
    check('every route in public/admin-posts.js has a per-IP AND a per-admin limiter', routes.length === 4 && bad.length === 0, `${routes.length} routes, missing on: ${bad.map((b) => b[2]).join(' ')}`);
    const mod = fs.readFileSync(path.resolve('src', 'public', 'moderation.js'), 'utf8').replace(/\r\n/g, '\n');
    const adminRoutes = [...mod.matchAll(/router\.(get|post)\(\s*\n?\s*'(\/admin\/[^']+)'([\s\S]*?)asyncRoute\(/g)];
    check('every admin route in public/moderation.js has the per-admin limiter too', adminRoutes.length === 3 && adminRoutes.every(([, , , chain]) => /AccountLimiter/.test(chain)), `${adminRoutes.length}`);
  }

  // Leave nothing behind: the planted picture files (the rows live in the throwaway database).
  for (const f of writtenFiles) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }
  conn.close();
  void adminId;
  void all;
}
