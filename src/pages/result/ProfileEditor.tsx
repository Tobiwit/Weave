import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { Sheet } from '../../components/ui/Sheet';
import { Slider } from '../../components/ui/Slider';
import { DESCRIPTORS_BY_GROUP } from '../../data/descriptors';
import type { SongProfile } from '../../types';

interface ProfileEditorProps {
  profile: SongProfile;
  onChange: (patch: Partial<SongProfile>) => void;
}

const ENERGY_WORDS = ['Very low', 'Low', 'Medium', 'High', 'Very high'];

function wordFor(value: number): string {
  return ENERGY_WORDS[Math.min(ENERGY_WORDS.length - 1, Math.floor(value * 5))];
}

/**
 * The editable fingerprint.
 *
 * Deliberately not a form: chips, a couple of continuous controls, and one
 * sheet for mood. Anything inferred can be removed, and anything removed can
 * come back.
 */
export function ProfileEditor({ profile, onChange }: ProfileEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [moodOpen, setMoodOpen] = useState(false);

  const removed = new Set(profile.removedTags.map((t) => t.toLowerCase()));
  const keep = (terms: string[]) => terms.filter((t) => !removed.has(t.toLowerCase()));

  const remove = (term: string) =>
    onChange({ removedTags: [...profile.removedTags, term] });

  const restore = (term: string) =>
    onChange({
      removedTags: profile.removedTags.filter(
        (t) => t.toLowerCase() !== term.toLowerCase(),
      ),
    });

  const removeManual = (term: string) =>
    onChange({ manualTags: profile.manualTags.filter((t) => t !== term) });

  const addManual = () => {
    const value = draft.trim();
    if (!value) return;
    const exists = profile.manualTags.some(
      (t) => t.toLowerCase() === value.toLowerCase(),
    );
    if (!exists) onChange({ manualTags: [...profile.manualTags, value] });
    setDraft('');
    setAdding(false);
  };

  const isMeasured = (field: string) => profile.measuredFields.includes(field);

  const vibes = keep(profile.vibes);
  const themes = keep(profile.themes);
  const genres = keep(profile.genres);
  const signals = keep(profile.communityTags).slice(0, 8);

  return (
    <div className="fingerprint">
      <Section label="Mood">
        <ChipRow>
          <Chip strong onClick={() => setMoodOpen(true)}>
            {profile.mood ?? 'Choose a mood'}
          </Chip>
        </ChipRow>
      </Section>

      {vibes.length > 0 && (
        <Section label="Character">
          <ChipRow>
            {vibes.map((vibe) => (
              <Chip key={vibe} onRemove={() => remove(vibe)}>
                {vibe}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      )}

      {themes.length > 0 && (
        <Section label="Themes">
          <ChipRow>
            {themes.map((theme) => (
              <Chip key={theme} onRemove={() => remove(theme)}>
                {theme}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      )}

      {genres.length > 0 && (
        <Section label="Style">
          <ChipRow>
            {genres.map((genre) => (
              <Chip key={genre} onRemove={() => remove(genre)}>
                {genre}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      )}

      {signals.length > 0 && (
        <Section label="Signals">
          <ChipRow>
            {signals.map((tag) => (
              <Chip key={tag} onRemove={() => remove(tag)}>
                {tag}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      )}

      <Section
        label="Yours"
        hint={profile.manualTags.length === 0 ? 'Add anything we missed' : undefined}
      >
        <ChipRow>
          {profile.manualTags.map((tag) => (
            <Chip key={tag} manual onRemove={() => removeManual(tag)}>
              {tag}
            </Chip>
          ))}
          {adding ? (
            <form
              className="fingerprint__add"
              onSubmit={(event) => {
                event.preventDefault();
                addManual();
              }}
            >
              <input
                className="fingerprint__input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={addManual}
                placeholder="crying but pretty"
                aria-label="Add a descriptor"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </form>
          ) : (
            <Chip onClick={() => setAdding(true)}>+ Add</Chip>
          )}
        </ChipRow>
      </Section>

      <Section label="Feel">
        <div className="fingerprint__sliders">
          <Slider
            label={`Energy${isMeasured('energy') ? '' : ' · our read'}`}
            value={profile.energy ?? 0.5}
            displayValue={wordFor(profile.energy ?? 0.5)}
            onChange={(value) =>
              onChange({
                energy: value,
                measuredFields: profile.measuredFields.filter((f) => f !== 'energy'),
              })
            }
          />
          <Slider
            label="Intensity · our read"
            value={profile.intensity ?? 0.5}
            displayValue={wordFor(profile.intensity ?? 0.5)}
            onChange={(value) => onChange({ intensity: value })}
          />
        </div>
        {typeof profile.bpm === 'number' && isMeasured('bpm') && (
          <p className="fingerprint__measured u-meta">
            Measured · {Math.round(profile.bpm)} BPM
          </p>
        )}
      </Section>

      {profile.removedTags.length > 0 && (
        <Section label="Removed">
          <ChipRow>
            {profile.removedTags.map((tag) => (
              <Chip key={tag} removed onClick={() => restore(tag)} title="Restore">
                {tag}
              </Chip>
            ))}
          </ChipRow>
        </Section>
      )}

      <Sheet open={moodOpen} onClose={() => setMoodOpen(false)} title="How does it feel?">
        <ChipRow>
          {DESCRIPTORS_BY_GROUP.mood.map((descriptor) => (
            <Chip
              key={descriptor.id}
              strong={profile.mood === descriptor.label}
              onClick={() => {
                onChange({ mood: descriptor.label });
                setMoodOpen(false);
              }}
            >
              {descriptor.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="fingerprint__sheetFoot">
          <Button variant="quiet" block onClick={() => setMoodOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fingerprint__section">
      <div className="fingerprint__head">
        <h2 className="u-eyebrow">{label}</h2>
        {hint && <span className="u-meta fingerprint__hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
