import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { APP, COPY } from '../../config/app';
import { readSetting, writeSetting } from '../../db/repositories';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import './installHint.css';

const DISMISSED_KEY = 'install.hintDismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari reports standalone on navigator, not via display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit;
}

/**
 * A single, contextual install nudge.
 *
 * Only shown in iOS Safari outside standalone mode, where there is no install
 * prompt API and the gesture is genuinely non-obvious. Dismissal is persisted,
 * so it never returns.
 */
export function InstallHint() {
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (isStandalone() || !isIosSafari()) return;
      const dismissed = await readSetting<boolean>(DISMISSED_KEY, false);
      if (!cancelled && !dismissed) {
        // Let the user get their bearings before suggesting anything.
        setTimeout(() => !cancelled && setVisible(true), 4000);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    void writeSetting(DISMISSED_KEY, true);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="install-hint"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.16, 0.84, 0.28, 1] }}
          role="complementary"
        >
          <div className="install-hint__text">
            <p className="install-hint__title">{COPY.installHint}</p>
            <p className="u-meta">
              Tap Share, then Add to Home Screen to open {APP.name} full screen.
            </p>
          </div>
          <button
            type="button"
            className="install-hint__close"
            onClick={dismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
