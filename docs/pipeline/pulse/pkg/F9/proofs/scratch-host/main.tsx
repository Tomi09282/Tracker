import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './scratch.css';
import '@/i18n';
import { specimens } from '@/features/playground/kit/structure';
import { Monogram } from '@/ui/data/Monogram';

// F9 stage-2 scratch host — NOT part of the repository. The structure lane's monogram specimens
// (the real files of slot-6, the app's real CSS) and monograms placed where frames put them.
const At = ({ x, y, children }: { x: number; y: number; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: x, top: y }}>{children}</div>
);
const view = new URLSearchParams(location.search).get('view') ?? 'list';
const pages: Record<string, ReactNode> = {
  list: (
    <div className="flex flex-col gap-12 p-6" style={{ width: 402 }}>
      {specimens.filter((s) => s.kit === 'monogramMark' || s.label.includes('monogram')).map((s) => (
        <section key={s.label} className="flex flex-col gap-3">
          <p className="text-micro text-text-3">{s.label}</p>
          {s.node}
        </section>
      ))}
    </div>
  ),
  'settings-1': <At x={24} y={88}><Monogram initials="TD" size={176} dot /></At>,
  'coach-profile-1': <At x={24} y={120}><Monogram initials="KP" size={176} dot /></At>,
  'client-detail-1': <At x={24} y={116}><Monogram initials="TD" size={124} dot /></At>,
  'coach-chat-1': <At x={24} y={112}><Monogram initials="TD" size={96} /></At>,
  'coach-chat-2': <At x={24} y={112}><Monogram initials="KA" size={96} /></At>,
};
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div style={{ position: 'relative', width: 402, minHeight: 874 }} className="bg-surface-0">{pages[view]}</div>
  </StrictMode>,
);
