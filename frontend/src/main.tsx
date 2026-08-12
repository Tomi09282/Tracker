import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// React Router 8 ships two RouterProviders. The one on the package root is the framework/RSC
// variant; browser apps with a data router need the DOM entry, and picking the wrong one
// renders absolutely nothing — no error, no warning, just an empty root element.
import { RouterProvider } from 'react-router/dom';
import './index.css';
import './i18n';
import { Providers } from './app/providers';
import { router } from './app/router';
import { registerServiceWorker } from './lib/registerSW';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);

// After render, not before: the worker's job is the NEXT cold start, so nothing about it should
// delay this one. It also unregisters itself where it does not belong — see registerSW.ts.
registerServiceWorker();
