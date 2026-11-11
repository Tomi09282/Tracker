/*
 * F13 evidence harness — NOT product code. Copied by ../f13-shot.mjs into `frontend/f13-kit.local/`
 * (git-ignored: `*.local`), built with the tree's own vite.config.ts into a scratch folder, captured,
 * then deleted. It renders the REAL status-zone specimens (features/playground/kit/status.tsx) with
 * the app's real CSS, each at a fixed place so a pair can cut it by coordinates:
 *
 *   #bands    402 wide: specimen 1 (style-studio-2's band) at y 0, specimen 2 (the record line,
 *             workout-2) at y 200, specimen 3 (the cap: three lines) at y 400
 *   #states   402 wide: specimen 4 (Undo / close states, in the 354 column at x 24) at y 0, specimen 5
 *             (the offline line, three forms) at y 360
 *   #palette  640 wide: specimen 6 (the palette, open in place) at x 40, y 40
 *
 * Inline styles only: this folder is git-ignored, so Tailwind does not scan it. The palette reads
 * the session (signed out here: no backend behind this preview) and navigates nowhere.
 */
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '../src/index.css';
import '../src/i18n';
import { specimens } from '../src/features/playground/kit/status';

const view = location.hash.replace('#', '') || 'bands';
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const At = ({ x = 0, y, children }: { x?: number; y: number; children: ReactNode }) => (
  <div style={{ position: 'absolute', left: x, top: y }}>{children}</div>
);

function View() {
  const s = specimens;
  if (view === 'bands')
    return (
      <>
        <At y={0}>{s[0].node}</At>
        <At y={200}>{s[1].node}</At>
        <At y={400}>{s[2].node}</At>
      </>
    );
  if (view === 'states')
    return (
      <>
        <At x={24} y={0}>{s[3].node}</At>
        <At y={360}>{s[4].node}</At>
      </>
    );
  return (
    <At x={40} y={40}>
      {s[5].node}
    </At>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--surface-0)' }}>
          <View />
        </div>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
