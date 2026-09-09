import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { APP } from './config/app';
import { ensureSeedData } from './data/seed';
import { restoreReadingQueue } from './features/analysis/readingQueue';
import { startAuthWatch, subscribeToAuth } from './services/cloud/auth';
import { syncNow } from './features/sync/syncEngine';
import { loadRuntimeSettings } from './services/runtimeSettings';
import './styles/global.css';

document.title = APP.name;

/**
 * Boot order: settings and the development seed are both cheap local reads and
 * must land before the first render decides what to show. Neither touches the
 * network, and neither loads the embedding model.
 */
async function boot() {
  await Promise.all([
    loadRuntimeSettings().catch(() => undefined),
    ensureSeedData().catch(() => undefined),
  ]);

  // Accounts are optional: this resolves immediately to "unavailable" when the
  // build has no cloud credentials, and never blocks the first render.
  void startAuthWatch()
    .then((state) => {
      if (state.status === 'signed-in') void syncNow();
    })
    .catch(() => undefined);

  // A batch of songs left half-read by the last visit picks up where it
  // stopped. Deliberately not awaited: it is background work by definition.
  void restoreReadingQueue().catch(() => undefined);

  subscribeToAuth((state) => {
    if (state.status === 'signed-in') void syncNow();
  });

  // The service worker claims open pages as soon as a new build lands, which
  // can leave a running page mixing its old code with newly-fetched chunks.
  // Reloading once on takeover keeps code and assets from the same build.
  if ('serviceWorker' in navigator) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  // A console handle on the matching breakdown. Development only: the import
  // is dynamic so none of it reaches a production bundle.
  if (import.meta.env.DEV) {
    void import('./features/matching/evaluate').then((module) => {
      (window as unknown as Record<string, unknown>).weaveEvaluate = async (
        playlist: string,
      ) => {
        const evaluation = await module.evaluatePlaylist(playlist);
        console.log(module.formatEvaluation(evaluation));
        return evaluation;
      };
    });
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Root container missing');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
