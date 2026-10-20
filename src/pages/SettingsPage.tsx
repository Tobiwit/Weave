import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMoodEnvironment } from '../components/background/MoodProvider';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Chip, ChipRow } from '../components/ui/Chip';
import { APP } from '../config/app';
import { EMBEDDING_CONFIG } from '../config/embedding';
import { clearAllData, clearEmbeddingCache } from '../db/repositories';
import { DB_VERSION } from '../db/weaveDb';
import { backfillAudio, type AudioBackfillReport } from '../features/analysis/backfillAudio';
import { getSourceCalibration } from '../features/song/axisReading';
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { isLastfmConfigured } from '../services/lastfm/client';
import {
  getRuntimeSettings,
  updateRuntimeSettings,
  type RuntimeSettings,
} from '../services/runtimeSettings';
import { AccountPanel } from './settings/AccountPanel';
import './settings.css';

export default function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings>(getRuntimeSettings());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [backfill, setBackfill] = useState<{
    running: boolean;
    done: number;
    total: number;
    report?: AudioBackfillReport;
  }>({ running: false, done: 0, total: 0 });
  const navigate = useNavigate();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.4, quality: 0.6 });

  const patch = async (next: Partial<RuntimeSettings>) => {
    setSettings(await updateRuntimeSettings(next));
  };

  const runBackfill = async () => {
    setBackfill({ running: true, done: 0, total: 0 });
    const report = await backfillAudio((done, total) =>
      setBackfill((current) => ({ ...current, done, total })),
    ).catch(() => undefined);
    setBackfill({ running: false, done: 0, total: 0, report });
  };

  const resetEverything = async () => {
    await clearAllData();
    // A full reload re-seeds the development library from scratch.
    window.location.href = '/';
  };

  return (
    <div className="page settings">
      <PageHeader back title="Settings" />

      <AccountPanel />

      <section className="settings__section">
        <h2 className="u-eyebrow">Data sources</h2>
        <p className="u-meta settings__hint">
          {isLastfmConfigured()
            ? 'Last.fm is configured. Live search and community tags are available.'
            : 'No Last.fm key is configured, so search and tags come from the local catalogue.'}
        </p>
        <ChipRow>
          <Chip
            strong={settings.providerMode === 'auto'}
            onClick={() => void patch({ providerMode: 'auto' })}
          >
            Live where available
          </Chip>
          <Chip
            strong={settings.providerMode === 'mock'}
            onClick={() => void patch({ providerMode: 'mock' })}
          >
            On device only
          </Chip>
        </ChipRow>
      </section>

      <section className="settings__section">
        <h2 className="u-eyebrow">Interpretation</h2>
        <p className="u-meta settings__hint">
          The neural reader is downloaded once, on first use, and then cached.
          The on-device reader needs no download but only matches wording.
        </p>
        <ChipRow>
          <Chip
            strong={settings.embeddingMode === 'auto'}
            onClick={() => void patch({ embeddingMode: 'auto' })}
          >
            Automatic
          </Chip>
          <Chip
            strong={settings.embeddingMode === 'neural'}
            onClick={() => void patch({ embeddingMode: 'neural' })}
          >
            Always neural
          </Chip>
          <Chip
            strong={settings.embeddingMode === 'lexical'}
            onClick={() => void patch({ embeddingMode: 'lexical' })}
          >
            Lightweight
          </Chip>
        </ChipRow>
      </section>

      <section className="settings__section">
        <h2 className="u-eyebrow">Motion</h2>
        <ChipRow>
          <Chip
            strong={!settings.reducedMotionOverride}
            onClick={() => void patch({ reducedMotionOverride: false })}
          >
            Full motion
          </Chip>
          <Chip
            strong={settings.reducedMotionOverride}
            onClick={() => void patch({ reducedMotionOverride: true })}
          >
            Reduced
          </Chip>
        </ChipRow>
      </section>

      <section className="settings__section">
        <h2 className="u-eyebrow">Developer</h2>
        <p className="u-meta settings__hint">
          The trace shows every source a reading asked, what came back, and how
          each value was worked out from it: on the analysis screen, under a
          song, in match details and on a playlist's representation.
        </p>
        <ChipRow>
          <Chip strong={settings.devTrace} onClick={() => void patch({ devTrace: true })}>
            Show trace
          </Chip>
          <Chip strong={!settings.devTrace} onClick={() => void patch({ devTrace: false })}>
            Hide trace
          </Chip>
        </ChipRow>
        <div className="settings__actions">
          <Button
            variant="quiet"
            size="sm"
            disabled={backfill.running}
            onClick={() => void runBackfill()}
          >
            {backfill.running
              ? `Asking audio sources · ${backfill.done}/${backfill.total || '…'}`
              : 'Fetch measured audio for read songs'}
          </Button>
        </div>
        {settings.devTrace && <SourceCalibrationReadout />}
        {backfill.report && (
          <p className="u-meta settings__hint" role="status">
            {backfill.report.checked === 0
              ? 'Every read song has already been asked.'
              : `Asked about ${backfill.report.checked} songs; ${backfill.report.measured} measured (${
                  Object.entries(backfill.report.bySource)
                    .map(([source, count]) => `${source} ${count}`)
                    .join(', ') || 'no source answered'
                }). Recalculate a playlist to bring the scores up to date.`}
          </p>
        )}
      </section>

      <section className="settings__section">
        <h2 className="u-eyebrow">Storage</h2>
        <div className="settings__actions">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              void clearEmbeddingCache();
            }}
          >
            Clear cached readings
          </Button>
          {confirmingReset ? (
            <>
              <Button variant="tinted" size="sm" onClick={resetEverything}>
                Erase everything
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingReset(true)}>
              Reset library
            </Button>
          )}
        </div>
        {confirmingReset && (
          <p className="u-meta settings__warning">
            This deletes every playlist, analysis and correction on this device.
          </p>
        )}
      </section>

      <section className="settings__section settings__about">
        <p className="u-meta">
          {APP.name} · local library v{DB_VERSION} · reader {EMBEDDING_CONFIG.modelId}
        </p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          Back to Analyze
        </Button>
      </section>
    </div>
  );
}

/**
 * How each axis source is being mapped onto the measured scale, as fitted at
 * the last recalculation. Development aid.
 */
function SourceCalibrationReadout() {
  const calibration = getSourceCalibration();
  const rows = Object.entries(calibration).flatMap(([source, axes]) =>
    Object.entries(axes ?? {}).map(([axis, map]) => ({ source, axis, map })),
  );
  if (rows.length === 0) {
    return (
      <p className="u-meta settings__hint">
        No source calibration yet. Recalculate the library once some songs have
        measured audio.
      </p>
    );
  }
  return (
    <ul className="settings__calibration">
      {rows.map(({ source, axis, map }) => (
        <li key={`${source}-${axis}`}>
          {source} · {axis}: y = {map?.intercept.toFixed(2)} + {map?.slope.toFixed(2)}x · n{' '}
          {map?.pairs} · r {map?.r}
        </li>
      ))}
    </ul>
  );
}
