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
import { NEUTRAL_MOOD } from '../features/mood/moodVisualState';
import { isLastfmConfigured } from '../services/lastfm/client';
import {
  getRuntimeSettings,
  updateRuntimeSettings,
  type RuntimeSettings,
} from '../services/runtimeSettings';
import './settings.css';

export default function SettingsPage() {
  const [settings, setSettings] = useState<RuntimeSettings>(getRuntimeSettings());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const navigate = useNavigate();

  useMoodEnvironment(NEUTRAL_MOOD, { resolution: 0.4, quality: 0.6 });

  const patch = async (next: Partial<RuntimeSettings>) => {
    setSettings(await updateRuntimeSettings(next));
  };

  const resetEverything = async () => {
    await clearAllData();
    // A full reload re-seeds the development library from scratch.
    window.location.href = '/';
  };

  return (
    <div className="page settings">
      <PageHeader back title="Settings" />

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
