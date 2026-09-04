import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MoodProvider } from './components/background/MoodProvider';
import { AppShell } from './components/layout/AppShell';
import { useReducedMotion } from './hooks/useReducedMotion';
import AnalyzePage from './pages/AnalyzePage';

// The heavier scenes are split out: Universe pulls in UMAP, and analysis and
// results pull in the interpretation path.
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const ResultPage = lazy(() => import('./pages/ResultPage'));
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage'));
const PlaylistNewPage = lazy(() => import('./pages/PlaylistNewPage'));
const PlaylistDetailPage = lazy(() => import('./pages/PlaylistDetailPage'));
const UniversePage = lazy(() => import('./pages/UniversePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SpotifyCallbackPage = lazy(() => import('./pages/SpotifyCallbackPage'));

function Loading() {
  return <div className="page" aria-busy="true" />;
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<Loading />}>{element}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <AnalyzePage /> },
      { path: 'analysis/:songId', element: withSuspense(<AnalysisPage />) },
      { path: 'result/:songId', element: withSuspense(<ResultPage />) },
      { path: 'playlists', element: withSuspense(<PlaylistsPage />) },
      { path: 'playlists/new', element: withSuspense(<PlaylistNewPage />) },
      { path: 'playlists/:playlistId', element: withSuspense(<PlaylistDetailPage />) },
      { path: 'universe', element: withSuspense(<UniversePage />) },
      { path: 'settings', element: withSuspense(<SettingsPage />) },
      { path: 'spotify-callback', element: withSuspense(<SpotifyCallbackPage />) },
      { path: '*', element: <AnalyzePage /> },
    ],
  },
]);

export default function App() {
  return (
    <MoodProvider>
      <ReducedMotionAttribute />
      <RouterProvider router={router} />
    </MoodProvider>
  );
}

/**
 * Mirrors the resolved reduced-motion preference onto the document.
 *
 * The system media query is handled by CSS directly, but the in-app override
 * has to reach the stylesheet somehow, and the entrance reveals are CSS.
 */
function ReducedMotionAttribute() {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.dataset.reducedMotion = 'true';
    else delete root.dataset.reducedMotion;
  }, [reducedMotion]);

  return null;
}
