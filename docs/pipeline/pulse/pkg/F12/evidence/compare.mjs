// F12 evidence: the rendered Field boxes (f12-shot.mjs JSON) against the Figma geometry of a frame.
//   node compare.mjs <app.json> <frame geometry.json> [dx dy]   (dx/dy: frame = app + offset)
import fs from 'node:fs';
const [appFile, geoFile, dxs = '0', dys = '0'] = process.argv.slice(2);
const app = JSON.parse(fs.readFileSync(appFile, 'utf8'));
const g = JSON.parse(fs.readFileSync(geoFile, 'utf8'));
const DX = Number(dxs), DY = Number(dys);
const byId = new Map(g.nodes.map((n) => [n.id, n]));
const under = (id) => g.nodes.filter((d) => { for (let p = d; p && p.parentId; p = byId.get(p.parentId)) if (p.parentId === id) return true; return false; });
const r = (v) => Math.round(v * 10) / 10;
const fields = g.nodes.filter((n) => /^Field\//.test(n.name));
const rows = [];
let worst = 0;
const cmp = (what, fig, dom, keys = ['x', 'y', 'w', 'h']) => {
  if (!fig) return;
  if (!dom) { rows.push(`  ${what.padEnd(28)} frame ${fig.x},${fig.y} ${fig.w}x${fig.h}   app: MISSING`); worst = Infinity; return; }
  const d = { x: r(dom.x + DX - fig.x), y: r(dom.y + DY - fig.y), w: r(dom.w - fig.w), h: r(dom.h - fig.h) };
  const m = Math.max(...keys.map((k) => Math.abs(d[k])));
  worst = Math.max(worst, m);
  rows.push(`  ${what.padEnd(28)} frame ${fig.x},${fig.y} ${fig.w}x${fig.h}   Δ ${keys.map((k) => `${k}${d[k] >= 0 ? '+' : ''}${d[k]}`).join(' ')}${m > 2 ? '   <-- over 2 pt' : ''}`);
};
fields.forEach((f) => {
  const a = app.fields.find((x) => f.name.startsWith(`Field/${x.label}`)) && app.fields.filter((x) => f.name.startsWith(`Field/${x.label}`))[fields.filter((o) => o.name.split(' · ')[0] === f.name.split(' · ')[0] && o.y < f.y).length];
  rows.push(`${f.name}`);
  if (!a) { rows.push('  no rendered field with that label'); return; }
  const d = under(f.id);
  const texts = d.filter((n) => n.type === 'TEXT');
  const label = texts.find((n) => n.text.characters === a.label);
  const value = d.find((n) => /^(Value|Placeholder)/.test(n.name) && n.type === 'TEXT');
  const masked = d.find((n) => /masked characters/.test(n.name));
  const hint = texts.find((n) => n !== label && n !== value && n.y > f.y + 60);
  cmp('Field (data-kit=inputField)', f, a.field);
  cmp('label', label, a.labelBox, ['x', 'y', 'h']);
  cmp(value ? `${value.name.toLowerCase()} line box` : 'value', value, a.textBox, ['x', 'y', 'h']);
  if (masked) cmp('masked value (line box)', masked, a.textBox, ['x', 'y', 'h']);
  cmp('underline', d.find((n) => n.name === 'Underline'), a.underline);
  const trail = d.find((n) => n.depth === f.depth + 3 && /^(Button\/|Mark\/|Valid)/.test(n.name));
  if (trail) cmp(`trailing ${trail.name.split(' (')[0]}`, trail, a.trail?.first);
  if (hint) cmp(`hint / error`, hint, (a.hint || a.error)?.box);
});
console.log(rows.join('\n'));
console.log(`worst deviation: ${worst === Infinity ? 'a layer is missing' : `${r(worst)} pt`}`);
