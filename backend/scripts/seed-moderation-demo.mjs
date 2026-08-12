/**
 * Puts ONE submission in the moderation queue so the review panel can be looked at, and takes it
 * back out again. Run with `--clean` to remove it.
 *
 * Not a fixture the product depends on — a screen with an empty queue cannot be reviewed, and a
 * screenshot of an empty state is not evidence about the panel.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as db from '../src/db/index.js';
import { MEDIA_DIR } from '../src/lib/media.js';

const NAME = 'Demo Submission — Bulgarian Split Squat';
const clean = process.argv.includes('--clean');

if (clean) {
  const rows = await db.all('SELECT id FROM exercises WHERE name = ?', [NAME]);
  for (const r of rows) {
    for (const m of await db.all('SELECT storage_key FROM exercise_media WHERE exercise_id = ?', [r.id])) {
      fs.rmSync(path.join(MEDIA_DIR, m.storage_key), { force: true });
    }
    await db.run('DELETE FROM exercise_media WHERE exercise_id = ?', [r.id]);
    await db.run('DELETE FROM exercise_muscle_map WHERE exercise_id = ?', [r.id]);
    await db.run('DELETE FROM exercises WHERE id = ?', [r.id]);
  }
  console.log(`removed ${rows.length} demo submission(s)`);
  await db.closePool();
  process.exit(0);
}

const [coach] = await db.all("SELECT id FROM users WHERE email = 'coach@tracker.local'");
await db.run(
  `INSERT INTO exercises (name, normalized_name, description, instructions, owner_id, status,
                          difficulty, exercise_type, submitted_at)
   VALUES (?, ?, ?, ?, ?, 'pending_review', 'intermediate', 'strength', datetime('now'))`,
  [
    NAME,
    NAME.toLowerCase(),
    'Single-leg squat with the rear foot elevated on a bench.',
    JSON.stringify([
      'Stand about a stride in front of a bench and place the top of your rear foot on it.',
      'Lower until the front thigh is roughly parallel to the floor, keeping the torso upright.',
      'Drive through the front heel to stand back up. Keep the knee tracking over the toes.',
    ]),
    coach.id,
  ],
);
const [ex] = await db.all('SELECT id FROM exercises WHERE name = ? ORDER BY id DESC LIMIT 1', [NAME]);

// A real 320×180 WebP, so the panel shows a picture rather than a broken-image icon.
const key = `${crypto.randomUUID()}.webp`;
const canvas = Buffer.from(
  'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAPwAAswAAQUxQSAsAAAABBxAREYiI6P8DAABWUDggGAAAADABAJ0BKkAAtAA+bTaZSaQjIqEoCACADAWJaQAA/vuUAAA=',
  'base64',
);
fs.writeFileSync(path.join(MEDIA_DIR, key), canvas);
await db.run(
  `INSERT INTO exercise_media (exercise_id, kind, storage_key, mime, width, height, position)
   VALUES (?, 'image', ?, 'image/webp', 320, 180, 0)`,
  [ex.id, key],
);

for (const slug of ['quads', 'glutes']) {
  await db.run(
    `INSERT INTO exercise_muscle_map (exercise_id, muscle_group_id, role)
     SELECT ?, id, ? FROM muscle_groups WHERE slug = ?`,
    [ex.id, slug === 'quads' ? 'primary' : 'secondary', slug],
  );
}
await db.run(
  `INSERT INTO exercise_equipment_map (exercise_id, equipment_id)
   SELECT ?, id FROM equipment ORDER BY sort_order LIMIT 1`,
  [ex.id],
);

console.log(`queued exercise ${ex.id} with 1 image, 3 steps, 2 muscles`);
await db.closePool();
