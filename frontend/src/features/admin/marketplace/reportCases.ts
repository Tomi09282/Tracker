/** The rows of `GET /admin/marketplace/reports`, grouped into the cases the queue and the report page draw. */

export interface ReportRow {
  id: number;
  reason: string;
  note: string | null;
  snapshot: string | null;
  snapshotTruncated: 0 | 1;
  status: string;
  createdAt: number;
  postId: string | null;
  postTitle: string | null;
  profileHandle: string | null;
  profileName: string | null;
  authorHandle: string | null;
  severity: number;
  distinctReporters: number;
}

/**
 * One CASE of the queue: the reports of one reason on one subject. The server keeps one row per reporter (and
 * replays a duplicate from the same person), so the rows of a (subject, reason) are exactly the different people
 * who made that complaint - "Átverés · 2 különböző bejelentő" - and the case reads the same as on the post page
 * (review S-admin-posts 3: three rows and a post-wide count of 3 for what is two complaints).
 */
export interface ReportCase {
  key: string;
  /** The first row of the case (the oldest filing): what the row's address and the report page open. */
  head: ReportRow;
  ids: number[];
  reporters: number;
  /** The oldest filing's instant. */
  at: number;
}

const subjectKeyOf = (r: ReportRow) => (r.postId ? `post:${r.postId}` : `profile:${r.profileHandle}`);

export function groupCases(rows: readonly ReportRow[]): ReportCase[] {
  const cases = new Map<string, ReportCase>();
  for (const r of rows) {
    const key = `${subjectKeyOf(r)}|${r.reason}|${r.status}`;
    const c = cases.get(key);
    if (c) {
      c.ids.push(r.id);
      c.reporters += 1;
      c.at = Math.min(c.at, r.createdAt);
    } else {
      cases.set(key, { key, head: r, ids: [r.id], reporters: 1, at: r.createdAt });
    }
  }
  return [...cases.values()];
}

/** "1 különböző bejelentő" has its own line: English and German plurals differ from the count line. */
export const reportersKey = (n: number) => (n === 1 ? 'admin.marketplace.reportersOne' : 'admin.marketplace.reporters');

