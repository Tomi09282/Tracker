// scripts/smoke/lifeos-calendar.js — the LifeOS calendar (migration 034) against the running server.
//
// Imported by scripts/smoke.js after the habits / tasks section. The calendar moves no coins, but
// its writes are user data addressed by id and its reads trigger a write (the reminders), so every
// endpoint walks the plan's five passes:
//
//   FORGE    a body / query the schema must refuse (.strict(), bounded, regex) — and no client
//            instant, zone or "today" is accepted anywhere
//   REPLAY   the same create twice makes one event; the same poll twice delivers one reminder
//   RACE     concurrent creates with one key settle on exactly one event
//   IDOR     another account's event is a 404 on read, edit and delete, and stays untouched
//   EXTREMES the bounds of every number, string and window (days 1..42, 14-day events, 4 reminders)

export async function lifeosCalendarSmoke({ call, check, Jar, stamp, PASSWORD }) {
  const dates = await import('../../src/lifeos/dates.js');

  const TZ = 'Europe/Budapest';
  let n = 0;
  const key = (p = 'k') => `${p}-${stamp}-${(n += 1).toString().padStart(4, '0')}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

  const register = async (label, { zone = true } = {}) => {
    const jar = new Jar();
    const email = `lifeos-cal-${label}-${stamp}@example.com`;
    await call('/api/v1/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
    await call('/api/v1/auth/login', { method: 'POST', body: { email, password: PASSWORD }, jar });
    const id = (await call('/api/v1/auth/me', { jar })).json?.user?.id;
    if (zone) await call('/api/v1/me/prefs', { method: 'PATCH', jar, body: { timezone: TZ } });
    return { jar, id };
  };
  /** The local date and 'HH:MM' of an instant in the smoke zone. */
  const local = (ms) => ({ date: dates.calendarKeyFor(ms, TZ), time: dates.localTime(ms, TZ) });

  console.log('\n── lifeos: calendar (GET /calendar, /events CRUD) ───────────────────────────────');
  const noZone = await register('nozone', { zone: false });
  {
    const r = await call('/api/v1/events', { method: 'POST', jar: noZone.jar, body: { clientKey: key(), title: 'x', date: '2026-10-21', startTime: '10:00' } });
    check('an event cannot be created before the zone is set (409 TIMEZONE_REQUIRED)', r.res.status === 409 && r.json?.code === 'TIMEZONE_REQUIRED', `${r.res.status} ${r.json?.code}`);
    const anon = await call('/api/v1/calendar');
    check('an anonymous caller is refused (401)', anon.res.status === 401, `${anon.res.status}`);
  }

  const cleo = await register('cleo');
  const today = local(Date.now()).date;
  {
    const body = (over) => ({ clientKey: key(), title: 'x', date: today, startTime: '10:00', ...over });
    const bad = await Promise.all([
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ startAt: 1800000000 }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ userId: 1 }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ timezone: 'UTC' }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ allDay: true }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ startTime: undefined }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ reminders: [0, 15, 60, 1440, 30] }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ reminders: [15, 15] }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ reminders: [10081] }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ title: 'x'.repeat(121) }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ untilDate: '2027-01-01' }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ recurrence: { type: 'hourly' } }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ recurrence: { type: 'weekly', weekdayMask: 128 } }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ date: '2026-02-30' }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ startTime: '24:00' }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ allDay: true, startTime: undefined, endDate: dates.addDaysToKey(today, 14) }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ clientKey: 'buy:12345678' }) }),
      call('/api/v1/events', { method: 'POST', jar: cleo.jar, body: body({ title: 'x' }), csrf: false }),
    ]);
    check('FORGE / EXTREMES: a client instant, a user id, a client zone, an all-day with a time, a timed event without one, 5 or repeated reminders, an offset over a week, a 121-char title, an until date without a rule, an unknown or out-of-range rule, 30 February, 24:00, a 15-day run and a colon key are 400; no X-CSRF is 403',
      bad.slice(0, 16).every((b) => b.res.status === 400) && bad[16].res.status === 403, bad.map((b) => b.res.status).join(','));
  }

  let eventId;
  {
    // RACE + REPLAY: five creates with one key at once — exactly one event exists.
    const k = key('race');
    const raced = await Promise.all(Array.from({ length: 5 }, () => call('/api/v1/events', {
      method: 'POST', jar: cleo.jar,
      body: { clientKey: k, title: 'Fogorvos', date: today, startTime: '10:00', endTime: '10:45', location: 'Klinika', reminders: [15, 1440] },
    })));
    const ids = new Set(raced.map((r) => r.json?.event?.id));
    check('RACE / REPLAY: five concurrent creates with one key make ONE event (one 201, the rest replayed)',
      ids.size === 1 && raced.filter((r) => r.res.status === 201).length === 1 && raced.filter((r) => r.json?.replayed === true).length === 4, raced.map((r) => r.res.status).join(','));
    eventId = [...ids][0];
    const ev = raced[0].json.event;
    check('the event answers its typed fields, its zone and its sorted reminders', ev.startTime === '10:00' && ev.endTime === '10:45' && ev.timezone === TZ && ev.reminders.join() === '15,1440' && ev.durationMinutes === 45, JSON.stringify(ev).slice(0, 120));
  }
  {
    const r = await call(`/api/v1/calendar?from=${today}&days=1`, { jar: cleo.jar });
    const day = r.json?.days?.[0];
    check('GET /calendar lists the event on its day', r.res.status === 200 && day?.date === today && day.events.some((e) => e.eventId === eventId && e.startTime === '10:00' && e.endTime === '10:45'), `${r.res.status}`);
    const week = await call('/api/v1/calendar', { jar: cleo.jar });
    check('GET /calendar defaults to seven days from the calendar today', week.res.status === 200 && week.json.days.length === 7 && week.json.from === week.json.today);
    const qbad = await Promise.all([
      call('/api/v1/calendar?days=43', { jar: cleo.jar }),
      call('/api/v1/calendar?days=0', { jar: cleo.jar }),
      call('/api/v1/calendar?from=2026-02-30', { jar: cleo.jar }),
      call('/api/v1/calendar?from=2045-01-01', { jar: cleo.jar }),
      call('/api/v1/calendar?userId=1', { jar: cleo.jar }),
    ]);
    check('EXTREMES: 43 days, 0 days, 30 February, a window 18 years out and an unknown query key are 400', qbad.every((b) => b.res.status === 400), qbad.map((b) => b.res.status).join(','));
    const max = await call(`/api/v1/calendar?from=${today}&days=42`, { jar: cleo.jar });
    check('42 days is the most one read answers', max.res.status === 200 && max.json.days.length === 42);
  }

  const mallory = await register('mallory');
  {
    const read = await call(`/api/v1/events/${eventId}`, { jar: mallory.jar });
    const edit = await call(`/api/v1/events/${eventId}`, { method: 'PATCH', jar: mallory.jar, body: { title: 'pwned' } });
    const del = await call(`/api/v1/events/${eventId}`, { method: 'DELETE', jar: mallory.jar });
    const mine = await call(`/api/v1/events/${eventId}`, { jar: cleo.jar });
    check("IDOR: another account's event is a 404 on read, edit and delete — and it is untouched",
      read.res.status === 404 && edit.res.status === 404 && del.res.status === 404 && mine.res.status === 200 && mine.json.event.title === 'Fogorvos',
      `${read.res.status} ${edit.res.status} ${del.res.status} ${mine.res.status}`);
    const theirs = await call(`/api/v1/calendar?from=${today}&days=1`, { jar: mallory.jar });
    check("IDOR: another account's calendar does not show it", theirs.res.status === 200 && theirs.json.days[0].events.length === 0);
  }
  {
    const p = await call(`/api/v1/events/${eventId}`, { method: 'PATCH', jar: cleo.jar, body: { startTime: '11:00', reminders: [0] } });
    check('PATCH: a move keeps the length; reminders are replaced', p.res.status === 200 && p.json.event.startTime === '11:00' && p.json.event.endTime === '11:45' && p.json.event.reminders.join() === '0');
    const bad = await Promise.all([
      call(`/api/v1/events/${eventId}`, { method: 'PATCH', jar: cleo.jar, body: {} }),
      call(`/api/v1/events/${eventId}`, { method: 'PATCH', jar: cleo.jar, body: { untilDate: '2027-01-01' } }),
      call(`/api/v1/events/${eventId}`, { method: 'PATCH', jar: cleo.jar, body: { clientKey: key() } }),
      call('/api/v1/events/0', { method: 'PATCH', jar: cleo.jar, body: { title: 'y' } }),
      call('/api/v1/events/abc', { jar: cleo.jar }),
      call(`/api/v1/events/${eventId}?on=2026-13-01`, { jar: cleo.jar }),
    ]);
    check('FORGE: an empty patch, an until date without a rule, a clientKey edit, id 0, a non-numeric id and a bad ?on are 400',
      bad.every((b) => b.res.status === 400), bad.map((b) => b.res.status).join(','));
    const d1 = await call(`/api/v1/events/${eventId}`, { method: 'DELETE', jar: cleo.jar });
    const d2 = await call(`/api/v1/events/${eventId}`, { method: 'DELETE', jar: cleo.jar });
    check('DELETE: 204, then 404 (REPLAY deletes nothing twice)', d1.res.status === 204 && d2.res.status === 404, `${d1.res.status} ${d2.res.status}`);
  }

  /* ── reminders: the bell's poll delivers a due reminder once ───────────────────────────────── */
  console.log('\n── lifeos: reminders (GET /notifications/unread-count, GET /lifeos/today) ───────');
  const rita = await register('rita');
  {
    const before = (await call('/api/v1/notifications/unread-count', { jar: rita.jar })).json?.unread ?? -1;
    // Starts in 10 minutes with a 15-minute reminder: it fired 5 minutes ago, inside the window.
    const start = local(Date.now() + 10 * 60_000);
    const end = local(Date.now() + 40 * 60_000);
    const c = await call('/api/v1/events', {
      method: 'POST', jar: rita.jar,
      body: { clientKey: key('rem'), title: 'Fogorvos', date: start.date, startTime: start.time, endTime: end.time, location: 'Klinika', reminders: [15] },
    });
    check('a timed event with a 15-minute reminder is created', c.res.status === 201, `${c.res.status} ${JSON.stringify(c.json).slice(0, 80)}`);
    const u1 = (await call('/api/v1/notifications/unread-count', { jar: rita.jar })).json?.unread;
    const u2 = (await call('/api/v1/notifications/unread-count', { jar: rita.jar })).json?.unread;
    check('the bell poll delivers the due reminder ONCE (a second poll adds nothing)', u1 === before + 1 && u2 === u1, `${before} -> ${u1} -> ${u2}`);
    const inbox = (await call('/api/v1/notifications', { jar: rita.jar })).json?.notifications ?? [];
    const rem = inbox.find((x) => x.type === 'lifeos.event');
    check('the notification is the event itself: its title, its time and place, its page', rem?.title === 'Fogorvos' && rem.body === `${start.time}–${end.time} · Klinika` && rem.link_path === `/calendar/events/${c.json.event.id}`, JSON.stringify(rem));
    const today2 = await call('/api/v1/lifeos/today', { jar: rita.jar });
    check('GET /lifeos/today names it as the next event', today2.res.status === 200 && today2.json.nextEvent?.eventId === c.json.event.id && today2.json.nextEvent.startTime === start.time, JSON.stringify(today2.json?.nextEvent));
    const theirs = (await call('/api/v1/notifications', { jar: mallory.jar })).json?.notifications ?? [];
    check("IDOR: nobody else's bell shows it", !theirs.some((x) => x.type === 'lifeos.event'));
  }
}
