import { useEffect, useRef, useState } from 'react';

/**
 * The shape of a machine doing a piece of work.
 *
 * The rhythm is the same one the interface always wanted, but it is no longer
 * invented. It is driven by real work starting and finishing, so the swell and
 * the collapse line up with something actually happening:
 *
 *   ACQUIRE -> READ -> (pulses of) RESOLVE -> RELEASE -> idle
 *
 * The first attempt at this ran off the pointer and fired wherever the cursor
 * happened to be. That was wrong twice over: this is a phone app and there is
 * no cursor, and an effect that appears over content the reader is in the
 * middle of using is an obstruction however good it looks. Work has its own
 * beginning and end, and those are the only honest cues.
 */

export type ScanPhase = 'idle' | 'acquire' | 'read' | 'resolve' | 'release';

export interface ScanEnvelope {
  phase: ScanPhase;
  /** 0-1. Drives every amplitude in the field and how much is annotated. */
  intensity: number;
  /** Seconds since the work began. Real elapsed time, shown as a readout. */
  elapsed: number;
}

const ACQUIRE_MS = 420;
const RELEASE_MS = 900;

/** How often the sustained state swells into a burst of extra annotation. */
const PULSE_MS = 2600;
const PULSE_WIDTH_MS = 900;

/**
 * Tracks one unit of work.
 *
 * `active` is the truth: flip it when the work starts and when it stops, and
 * the envelope handles the ramp, the sustain, the periodic escalation and the
 * decay. Nothing is on screen unless something is being computed.
 */
export function useScanEnvelope(active: boolean): ScanEnvelope {
  const [envelope, setEnvelope] = useState<ScanEnvelope>({
    phase: 'idle',
    intensity: 0,
    elapsed: 0,
  });

  const startedAt = useRef(0);
  const endedAt = useRef(0);
  const frame = useRef(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active && !wasActive.current) {
      startedAt.current = performance.now();
      endedAt.current = 0;
    }
    if (!active && wasActive.current) {
      endedAt.current = performance.now();
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    let running = true;

    const tick = () => {
      if (!running) return;
      const now = performance.now();

      if (active) {
        const since = now - startedAt.current;
        if (since < ACQUIRE_MS) {
          setEnvelope({
            phase: 'acquire',
            intensity: (since / ACQUIRE_MS) * 0.45,
            elapsed: since / 1000,
          });
        } else {
          // Sustained reading, with a periodic escalation. The bursts are what
          // keep a long wait from flattening into a loading spinner.
          const inPulse = (since - ACQUIRE_MS) % PULSE_MS < PULSE_WIDTH_MS;
          const pulsePosition = ((since - ACQUIRE_MS) % PULSE_MS) / PULSE_WIDTH_MS;
          const swell = inPulse ? Math.sin(pulsePosition * Math.PI) * 0.42 : 0;
          setEnvelope({
            phase: inPulse ? 'resolve' : 'read',
            intensity: 0.45 + swell + Math.sin(since / 900) * 0.05,
            elapsed: since / 1000,
          });
        }
      } else if (endedAt.current) {
        const since = now - endedAt.current;
        if (since >= RELEASE_MS) {
          setEnvelope({ phase: 'idle', intensity: 0, elapsed: 0 });
          endedAt.current = 0;
          running = false;
          return;
        }
        const t = since / RELEASE_MS;
        setEnvelope((previous) => ({
          phase: 'release',
          // Eased out rather than linear, so the form collapses quickly and
          // then lingers at the very end instead of simply fading.
          intensity: Math.max(0, previous.intensity) * (1 - t) * (1 - t * 0.6),
          elapsed: (endedAt.current - startedAt.current) / 1000,
        }));
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(frame.current);
    };
  }, [active]);

  return envelope;
}

/** A single machine-readable fact about the work in progress. */
export interface Reading {
  key: string;
  value: string;
  /** Lower appears sooner. 0 is always shown once the scan has any presence. */
  tier?: 0 | 1 | 2;
}
