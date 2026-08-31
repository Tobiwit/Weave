import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { APP } from './config/app';
import { ensureSeedData } from './data/seed';
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

  const container = document.getElementById('root');
  if (!container) throw new Error('Root container missing');

  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
