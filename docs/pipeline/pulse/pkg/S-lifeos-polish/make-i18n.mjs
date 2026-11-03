#!/usr/bin/env node
// Writes docs/pipeline/pulse/pkg/S-lifeos-polish/i18n.patch.json (the hand-in of the polish round).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const base = execFileSync('git', ['rev-parse', '--short', 'pulse-redesign'], { cwd: HERE, encoding: 'utf8' }).trim();

const set = [
  {
    key: 'rewards.gone',
    hu: 'Ez a jutalom nem érhető el',
    en: 'This reward is not available',
    de: 'Diese Belohnung ist nicht verfügbar',
    copy: 'proposed',
    visible: true,
    source: 'review S-rewards 6: /rewards/:id answering 404 (missing or another account\'s reward) showed the retry message; same form as habits.gone ("Ez a szokás nem érhető el")',
  },
  {
    key: 'today.habits.pays',
    hu: '+{{coins}} érme / nap · {{days}} nap után {{mult}}',
    en: '+{{coins}} coins / day · {{mult}} after {{days}} days',
    de: '+{{coins}} Münzen / Tag · {{mult}} nach {{days}} Tagen',
    copy: 'inventory',
    visible: true,
    source: 'lifeos/ma-3 fourth line of the empty SZOKÁSOK block ("+10 érme / nap · 7 nap után ×1,25"), quoted from GET /lifeos/today dayRules',
  },
  {
    key: 'today.tasks.pays',
    hu: '+{{min}}–{{max}} érme teendőnként',
    en: '+{{min}}–{{max}} coins per task',
    de: '+{{min}}–{{max}} Münzen pro Aufgabe',
    copy: 'inventory',
    visible: true,
    source: 'lifeos/ma-3 fourth line of the empty FELADATOK block ("+5–20 érme teendőnként"), quoted from GET /lifeos/today taskRules',
  },
  {
    key: 'today.hero.perfectPays',
    hu: '+{{coins}} érme napzáráskor',
    en: '+{{coins}} coins at day close',
    de: '+{{coins}} Münzen zum Tagesabschluss',
    copy: 'inventory',
    visible: true,
    source: 'lifeos/ma-2 caption "Tökéletes nap · +25 érme napzáráskor", quoted from GET /lifeos/today dayRules',
  },
];

const remove = [
  {
    key: 'today.habit.reminder',
    reason: 'its only consumer, features/today/TodayHabits.tsx, now prints "Naponta · emlékeztető 21:30" from habits.scheduleDaily + habits.reminderAt (the words of the Szokások list and frame ma-4)',
  },
];

const patch = { package: 'S-lifeos-polish', base, namespaces: ['rewards', 'today'], set, remove };
fs.writeFileSync(path.join(HERE, 'i18n.patch.json'), JSON.stringify(patch, null, 2) + '\n');
console.log('i18n.patch.json:', set.length, 'keys, base', base);
