import { MATCHING_CONFIG } from '../../config/matching';
import { DESCRIPTOR_AXES, LYRIC_AXES } from '../../data/descriptorAxes';
import { DESCRIPTORS } from '../../data/descriptors';
import type { AudioEvidence, SongProfile } from '../../types';
import { AXES, AXIS_CENTRE, clamp01, type AxisId } from './axes';

/**
 * The machine's reading of the eight scales.
 *
 * Every source that has an opinion about an axis contributes one piece of
 * evidence with a confidence, and the axis is their confidence-weighted mean.
 * A hand-placed value is never averaged with anything: it is the answer.
 *
 * Nothing is stored. The reading is recomputed from the raw evidence on the
 * profile every time it is needed, so a change to a mapping here reaches every
 * song at once and an edit to a song's mood reaches its axes immediately.
 */

export interface AxisEvidence {
  /** Who said so: `reccobeats`, `acousticbrainz`, `descriptors`, `lyrics`… */
  source: string;
  /** Which of their outputs, e.g. `1 - valence` or `Melancholic, Intimate`. */
  field: string;
  value: number;
  confidence: number;
  /** The value before it was mapped onto the measured scale, when it was. */
  raw?: number;
}

export type AxisOrigin = 'user' | 'measured' | 'inferred' | 'none';

export interface AxisReading {
  value: number;
  /** 0 when nothing at all spoke to the axis. */
  confidence: number;
  origin: AxisOrigin;
  /** The single most confident source, for compact display. */
  primary: string;
  evidence: AxisEvidence[];
}

export type AxisReadings = Record<AxisId, AxisReading>;

const MEASURED_SOURCES = new Set(['reccobeats', 'acousticbrainz', 'mock']);

const conf = MATCHING_CONFIG.axes.sourceConfidence;

/* ------------------------------ measured audio ---------------------------- */

/** Loudness in dB onto 0-1: -24 dB and below is quiet, -4 dB and above loud. */
export function loudnessToPresence(db: number): number {
  return clamp01((db + 24) / 20);
}

type Evidence = Partial<Record<AxisId, AxisEvidence[]>>;

function push(into: Evidence, axis: AxisId, evidence: AxisEvidence): void {
  if (!Number.isFinite(evidence.value)) return;
  (into[axis] ??= []).push({ ...evidence, value: clamp01(evidence.value) });
}

/** Mean of whichever of the values exist, or undefined when none do. */
function meanOf(values: (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => typeof v === 'number');
  if (present.length === 0) return undefined;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/**
 * Turns raw measured audio into axis evidence.
 *
 * The mappings are direct where a feature measures the axis (danceability is
 * movement, valence is the inverse of dark) and blended, at reduced
 * confidence, where the axis is only approximated (nothing measures "heavy",
 * so it is built from energy, darkness and loudness).
 */
export function audioEvidence(audio: AudioEvidence | undefined): Evidence {
  const out: Evidence = {};
  if (!audio) return out;

  const r = audio.reccobeats;
  if (r) {
    const c = conf.reccobeats;
    const loud = loudnessToPresence(r.loudness);
    push(out, 'energy', { source: 'reccobeats', field: 'energy', value: r.energy, confidence: c });
    push(out, 'mood', { source: 'reccobeats', field: '1 - valence', value: 1 - r.valence, confidence: c });
    push(out, 'movement', { source: 'reccobeats', field: 'danceability', value: r.danceability, confidence: c });
    push(out, 'sound', { source: 'reccobeats', field: '1 - acousticness', value: 1 - r.acousticness, confidence: c * 0.9 });
    push(out, 'presence', {
      source: 'reccobeats',
      field: `0.6 loudness(${r.loudness.toFixed(1)}dB) + 0.4 energy`,
      value: loud * 0.6 + r.energy * 0.4,
      confidence: c * 0.75,
    });
    push(out, 'weight', {
      source: 'reccobeats',
      field: '0.45 energy + 0.35 (1 - valence) + 0.2 loudness',
      value: r.energy * 0.45 + (1 - r.valence) * 0.35 + loud * 0.2,
      confidence: c * 0.5,
    });
  }

  const a = audio.acousticbrainz;
  if (a) {
    // More submissions agreeing is worth a little more, never a lot.
    const c = conf.acousticbrainz * Math.min(1.2, 0.85 + 0.05 * (a.submissions ?? 1));
    if (typeof a.danceable === 'number') {
      push(out, 'movement', { source: 'acousticbrainz', field: 'danceable', value: a.danceable, confidence: c });
    }
    const dark = meanOf([a.sad, a.happy === undefined ? undefined : 1 - a.happy]);
    if (dark !== undefined) {
      push(out, 'mood', { source: 'acousticbrainz', field: 'mean(sad, 1 - happy)', value: dark, confidence: c });
    }
    const energy = meanOf([
      a.aggressive,
      a.party,
      a.relaxed === undefined ? undefined : 1 - a.relaxed,
    ]);
    if (energy !== undefined) {
      push(out, 'energy', {
        source: 'acousticbrainz',
        field: 'mean(aggressive, party, 1 - relaxed)',
        value: energy,
        confidence: c * 0.8,
      });
    }
    const electric = meanOf([a.electronic, a.acoustic === undefined ? undefined : 1 - a.acoustic]);
    if (electric !== undefined) {
      push(out, 'sound', {
        source: 'acousticbrainz',
        field: 'mean(electronic, 1 - acoustic)',
        value: electric,
        confidence: c * 0.8,
      });
    }
    if (typeof a.aggressive === 'number') {
      push(out, 'weight', { source: 'acousticbrainz', field: 'aggressive', value: a.aggressive, confidence: c * 0.5 });
    }
  }

  const m = audio.mock;
  if (m) {
    const c = conf.mock;
    if (typeof m.energy === 'number') {
      push(out, 'energy', { source: 'mock', field: 'energy', value: m.energy, confidence: c });
    }
    if (typeof m.danceability === 'number') {
      push(out, 'movement', { source: 'mock', field: 'danceability', value: m.danceability, confidence: c });
    }
    if (typeof m.acousticness === 'number') {
      push(out, 'sound', { source: 'mock', field: '1 - acousticness', value: 1 - m.acousticness, confidence: c * 0.9 });
    }
    if (typeof m.brightness === 'number') {
      push(out, 'mood', { source: 'mock', field: '1 - brightness', value: 1 - m.brightness, confidence: c });
    }
  }

  return out;
}

/* ------------------------------- descriptors ------------------------------ */

const LABEL_TO_ID = new Map(
  DESCRIPTORS.map((descriptor) => [descriptor.label.toLowerCase(), descriptor.id]),
);

export function descriptorIdFor(label: string): string | undefined {
  return LABEL_TO_ID.get(label.trim().toLowerCase());
}

/**
 * An axis position from a descriptor ranking.
 *
 * A softmax over the similarities of every descriptor that says something
 * about the axis, so the nearest few decide and the long tail of near-equal
 * similarities does not drag every song to the centre.
 */
export function axisFromScores(
  scores: Record<string, number>,
  axis: AxisId,
  temperature: number = MATCHING_CONFIG.axes.temperature,
): { value: number; top: string[] } | undefined {
  const entries = Object.entries(scores).filter(
    ([id]) => typeof DESCRIPTOR_AXES[id]?.[axis] === 'number',
  );
  if (entries.length === 0) return undefined;

  const best = Math.max(...entries.map(([, score]) => score));
  let total = 0;
  let sum = 0;
  const weighted = entries.map(([id, score]) => {
    const weight = Math.exp((score - best) / temperature);
    total += weight;
    sum += weight * (DESCRIPTOR_AXES[id][axis] as number);
    return { id, weight };
  });
  if (total === 0) return undefined;

  const top = weighted
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((entry) => entry.id);
  return { value: sum / total, top };
}

/** Plain mean of the signatures of a set of labels, for profiles without scores. */
function axisFromLabels(labels: string[], axis: AxisId): number | undefined {
  const values = labels
    .map(descriptorIdFor)
    .map((id) => (id ? DESCRIPTOR_AXES[id]?.[axis] : undefined));
  return meanOf(values);
}

/** The top-scoring mood descriptor in a stored ranking, if any. */
function rankedMood(scores: Record<string, number> | undefined): string | undefined {
  if (!scores) return undefined;
  const moods = DESCRIPTORS.filter((d) => d.group === 'mood');
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const descriptor of moods) {
    const score = scores[descriptor.id];
    if (typeof score === 'number' && score > bestScore) {
      bestScore = score;
      best = descriptor.id;
    }
  }
  return best;
}

function labelOf(id: string): string {
  return DESCRIPTORS.find((d) => d.id === id)?.label ?? id;
}

/** Evidence from what was read in words: tags and metadata, lyrics, chosen mood. */
export function textEvidence(profile: SongProfile): Evidence {
  const out: Evidence = {};
  const reading = profile.reading;

  for (const { id: axis } of AXES) {
    if (reading?.signal) {
      const result = axisFromScores(reading.signal, axis);
      if (result) {
        push(out, axis, {
          source: 'descriptors',
          field: result.top.map(labelOf).join(', '),
          value: result.value,
          confidence: conf.descriptors,
        });
      }
    } else {
      // Read before scores were kept: fall back to the words that were chosen.
      const labels = [...(profile.mood ? [profile.mood] : []), ...profile.vibes, ...profile.themes];
      const value = axisFromLabels(labels, axis);
      if (value !== undefined) {
        push(out, axis, {
          source: 'descriptors',
          field: `labels: ${labels.slice(0, 3).join(', ')}`,
          value,
          confidence: conf.descriptors * 0.7,
        });
      }
    }

    if (reading?.lyrics && LYRIC_AXES.includes(axis)) {
      const result = axisFromScores(reading.lyrics, axis);
      if (result) {
        push(out, axis, {
          source: 'lyrics',
          field: result.top.map(labelOf).join(', '),
          value: result.value,
          confidence: conf.lyrics,
        });
      }
    }
  }

  // A mood that differs from the one the ranking chose was picked by hand,
  // and that is a statement about the song worth more than the ranking.
  const moodId = profile.mood ? descriptorIdFor(profile.mood) : undefined;
  const machineMood = reading?.mood
    ? descriptorIdFor(reading.mood)
    : rankedMood(reading?.signal);
  if (moodId && reading?.signal && machineMood !== moodId) {
    for (const [axis, value] of Object.entries(DESCRIPTOR_AXES[moodId] ?? {}) as [
      AxisId,
      number,
    ][]) {
      push(out, axis, {
        source: 'chosen mood',
        field: profile.mood as string,
        value,
        confidence: conf.chosenMood,
      });
    }
  }

  return out;
}

/* --------------------------------- fusion --------------------------------- */

function fuse(evidence: AxisEvidence[]): AxisReading {
  if (evidence.length === 0) {
    return { value: AXIS_CENTRE, confidence: 0, origin: 'none', primary: 'none', evidence };
  }
  let total = 0;
  let sum = 0;
  let disbelief = 1;
  for (const item of evidence) {
    total += item.confidence;
    sum += item.confidence * item.value;
    disbelief *= 1 - Math.min(0.95, item.confidence);
  }
  const primary = [...evidence].sort((a, b) => b.confidence - a.confidence)[0];
  return {
    value: total > 0 ? sum / total : AXIS_CENTRE,
    // Independent sources agreeing should be worth more than any one of them,
    // but never certainty: only a hand placement is that.
    confidence: Math.min(0.95, 1 - disbelief),
    origin: evidence.some((item) => MEASURED_SOURCES.has(item.source)) ? 'measured' : 'inferred',
    primary: primary.source,
    evidence,
  };
}

/** Only what was measured, used to steer descriptor selection during analysis. */
export function readMeasuredAxes(audio: AudioEvidence | undefined): Partial<AxisReadings> {
  const evidence = audioEvidence(audio);
  const out: Partial<AxisReadings> = {};
  for (const { id } of AXES) {
    if (evidence[id]?.length) out[id] = fuse(evidence[id] as AxisEvidence[]);
  }
  return out;
}

/* ------------------------- per-source calibration -------------------------- */

/**
 * A straight-line correction from one source's scale onto the measured one.
 *
 * Sources disagree about scale, not only about songs. Descriptor similarities
 * put almost everything bright, because "Bright" is a strong word in a sentence
 * model; ReccoBeats puts the same songs near the middle. A playlist built from
 * word-only songs would then sit in a different place from a playlist of
 * measured ones, and every comparison across the two would be off by that
 * offset. Fitting each source against the measured value, on songs that have
 * both, puts every source on one scale.
 */
export interface SourceMap {
  slope: number;
  intercept: number;
  /** Songs the fit was made from. */
  pairs: number;
  /** Correlation with the measured value: how much this source knows. */
  r: number;
}

export type SourceCalibration = Partial<Record<string, Partial<Record<AxisId, SourceMap>>>>;

/** Sources whose scale everything else is mapped onto. */
const REFERENCE_SOURCES = new Set(['reccobeats', 'mock']);
/** A chosen mood is a descriptor position, so it shares the descriptors' map. */
const SHARES_MAP_WITH: Record<string, string> = { 'chosen mood': 'descriptors' };

let sourceCalibration: SourceCalibration = {};

export function setSourceCalibration(value: SourceCalibration | null): void {
  sourceCalibration = value ?? {};
}

export function getSourceCalibration(): SourceCalibration {
  return sourceCalibration;
}

/** Every piece of evidence before any calibration, hand placements excluded. */
function rawEvidence(profile: SongProfile): Evidence {
  const measured = audioEvidence(profile.audio);
  const text = textEvidence(profile);

  // Profiles read before audio was kept separately still carry measured
  // numbers in their top-level fields; honour them rather than dropping them.
  if (!profile.audio && profile.measuredFields.length > 0) {
    const legacy = audioEvidence({
      mock: {
        energy: profile.measuredFields.includes('energy') ? profile.energy : undefined,
        danceability: profile.measuredFields.includes('danceability') ? profile.danceability : undefined,
        acousticness: profile.measuredFields.includes('acousticness') ? profile.acousticness : undefined,
        brightness: profile.measuredFields.includes('brightness') ? profile.brightness : undefined,
      },
      checkedAt: 0,
    });
    for (const [axis, items] of Object.entries(legacy) as [AxisId, AxisEvidence[]][]) {
      (measured[axis] ??= []).push(...items);
    }
  }

  const out: Evidence = {};
  for (const { id } of AXES) {
    const items = [...(measured[id] ?? []), ...(text[id] ?? [])];
    if (items.length) out[id] = items;
  }
  return out;
}

/** Least squares, then shrunk towards "leave it alone" by how few pairs there were. */
export function fitLine(
  points: { x: number; y: number }[],
  config = MATCHING_CONFIG.axes.calibration,
): SourceMap | null {
  const n = points.length;
  if (n < config.minPairs) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  // A source that never moves can still be offset, but says nothing about slope.
  const rawSlope = sxx > 1e-6 ? sxy / sxx : 1;
  const slope = Math.min(config.maxSlope, Math.max(config.minSlope, rawSlope));
  const r = sxx > 1e-6 && syy > 1e-6 ? sxy / Math.sqrt(sxx * syy) : 0;

  // f(x) = λ·(my + slope·(x - mx)) + (1 - λ)·x
  const lambda = n / (n + config.shrinkage);
  return {
    slope: lambda * slope + (1 - lambda),
    intercept: lambda * (my - slope * mx),
    pairs: n,
    r: Math.round(r * 100) / 100,
  };
}

/**
 * Fits every non-reference source onto the measured scale, axis by axis,
 * from the songs that have both. Run over the whole library on recalculation.
 */
export function fitSourceCalibration(profiles: SongProfile[]): SourceCalibration {
  const pairs: Record<string, Partial<Record<AxisId, { x: number; y: number }[]>>> = {};

  for (const profile of profiles) {
    const evidence = rawEvidence(profile);
    for (const [axis, items] of Object.entries(evidence) as [AxisId, AxisEvidence[]][]) {
      const reference = items.filter((item) => REFERENCE_SOURCES.has(item.source));
      if (reference.length === 0) continue;
      const weight = reference.reduce((s, i) => s + i.confidence, 0);
      const y = reference.reduce((s, i) => s + i.value * i.confidence, 0) / weight;

      for (const item of items) {
        if (REFERENCE_SOURCES.has(item.source)) continue;
        const source = SHARES_MAP_WITH[item.source] ?? item.source;
        ((pairs[source] ??= {})[axis] ??= []).push({ x: item.value, y });
      }
    }
  }

  const out: SourceCalibration = {};
  for (const [source, axes] of Object.entries(pairs)) {
    for (const [axis, points] of Object.entries(axes) as [AxisId, { x: number; y: number }[]][]) {
      const fit = fitLine(points);
      if (fit) (out[source] ??= {})[axis] = fit;
    }
  }
  return out;
}

function calibrate(
  item: AxisEvidence,
  axis: AxisId,
  calibration: SourceCalibration,
): AxisEvidence {
  const map = calibration[SHARES_MAP_WITH[item.source] ?? item.source]?.[axis];
  if (!map) return item;
  return {
    ...item,
    raw: item.value,
    value: clamp01(map.intercept + map.slope * item.value),
  };
}

/** The full reading of all eight axes, hand placements first. */
export function readAxes(
  profile: SongProfile,
  calibration: SourceCalibration = sourceCalibration,
): AxisReadings {
  const evidence = rawEvidence(profile);

  const out = {} as AxisReadings;
  for (const { id } of AXES) {
    const placed = profile.axes?.[id];
    if (typeof placed === 'number') {
      out[id] = {
        value: clamp01(placed),
        confidence: conf.user,
        origin: 'user',
        primary: 'you',
        evidence: [{ source: 'you', field: 'placed by hand', value: clamp01(placed), confidence: conf.user }],
      };
      continue;
    }
    out[id] = fuse((evidence[id] ?? []).map((item) => calibrate(item, id, calibration)));
  }
  return out;
}

/** Mean confidence across the axes, the reliability of the axes component. */
export function axisReliability(readings: AxisReadings): number {
  const values = AXES.map(({ id }) => readings[id].confidence);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A reading with nothing known on any axis, for songs with no profile and tests. */
export function emptyAxisReadings(): AxisReadings {
  const out = {} as AxisReadings;
  for (const { id } of AXES) {
    out[id] = { value: AXIS_CENTRE, confidence: 0, origin: 'none', primary: 'none', evidence: [] };
  }
  return out;
}

/**
 * The machine's position on every axis it has an opinion about and the person
 * has not placed: what the Feel step and the breakdown draw as suggestions.
 */
export function machineSuggestions(profile: SongProfile): Partial<Record<AxisId, number>> {
  const readings = readAxes(profile);
  const out: Partial<Record<AxisId, number>> = {};
  for (const { id } of AXES) {
    const reading = readings[id];
    if (reading.origin !== 'user' && reading.confidence > 0) out[id] = reading.value;
  }
  return out;
}
