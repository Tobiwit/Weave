import { Outlet, useLocation } from 'react-router-dom';
import { ReadingStatus } from '../analysis/ReadingStatus';
import { MoodBackground } from '../background/MoodBackground';
import { useMoodContext } from '../background/MoodProvider';
import { InstallHint } from '../pwa/InstallHint';
import { BottomNav } from './BottomNav';
import './layout.css';

/** Routes that own the whole viewport and hide the permanent navigation. */
const IMMERSIVE_ROUTES = [/^\/analysis\//];

export function AppShell() {
  const location = useLocation();
  const { state, resolution, quality, transitionMs } = useMoodContext();

  const immersive = IMMERSIVE_ROUTES.some((pattern) => pattern.test(location.pathname));

  return (
    <div className={`shell${immersive ? ' shell--no-nav' : ''}`}>
      <div className="shell__bg">
        <MoodBackground
          state={state}
          resolution={resolution}
          quality={quality}
          transitionMs={transitionMs}
        />
      </div>

      <main className="shell__main" id="main">
        {/*
          The page frame transitions with a CSS keyframe rather than a JS
          animation. Remounting on the key restarts it, and because the end
          state is also the default state, a stalled frame loop can never leave
          a route stranded invisible.
        */}
        <div key={pageKey(location.pathname)} className="shell__page">
          <Outlet />
        </div>
      </main>

      {!immersive && <ReadingStatus />}
      {!immersive && <BottomNav />}
      <InstallHint />
    </div>
  );
}

/**
 * Analysis is keyed as a single scene so its own internal stage motion is not
 * interrupted by a route transition. Everything else transitions per URL.
 */
function pageKey(pathname: string): string {
  if (pathname.startsWith('/analysis')) return 'analysis';
  return pathname;
}
