import type { Descriptor, DescriptorGroup } from '../types';

/**
 * The curated interpretation vocabulary.
 *
 * `label` is what a person sees. `description` is never shown; it exists purely
 * to give the embedding model enough context to place the descriptor
 * meaningfully in vector space.
 */

const moods: Descriptor[] = [
  {
    id: 'euphoric',
    label: 'Euphoric',
    group: 'mood',
    description:
      'overwhelming joy and release, a soaring rush of happiness, ecstatic and uplifting, the feeling of a peak moment on a dancefloor',
  },
  {
    id: 'melancholic',
    label: 'Melancholic',
    group: 'mood',
    description:
      'quiet sadness and reflection, wistful and downcast, a soft grey sorrow without drama, sitting with loss',
  },
  {
    id: 'bittersweet',
    label: 'Bittersweet',
    group: 'mood',
    description:
      'emotionally mixed, combining sadness, longing or regret with beauty, affection or uplift, crying while smiling',
  },
  {
    id: 'angry',
    label: 'Angry',
    group: 'mood',
    description:
      'furious, confrontational and aggressive, spitting resentment, hostile energy and refusal to back down',
  },
  {
    id: 'dreamy',
    label: 'Dreamy',
    group: 'mood',
    description:
      'hazy, floating and weightless, blurred edges and soft focus, half asleep, drifting through a warm fog',
  },
  {
    id: 'calm',
    label: 'Calm',
    group: 'mood',
    description:
      'settled, peaceful and unhurried, steady breathing, stillness and quiet contentment without tension',
  },
  {
    id: 'playful',
    label: 'Playful',
    group: 'mood',
    description:
      'silly, mischievous and light-hearted, not taking itself seriously, teasing and full of charm',
  },
  {
    id: 'sensual',
    label: 'Sensual',
    group: 'mood',
    description:
      'physical, intimate and slow burning, bodily and seductive, warm skin and closeness, charged attraction',
  },
  {
    id: 'anxious',
    label: 'Anxious',
    group: 'mood',
    description:
      'restless and unsettled, nervous tension, racing thoughts, a sense of unease that will not resolve',
  },
  {
    id: 'cathartic',
    label: 'Cathartic',
    group: 'mood',
    description:
      'emotional release after pressure, letting everything out, breaking open, a purging climax of feeling',
  },
  {
    id: 'defiant',
    label: 'Defiant',
    group: 'mood',
    description:
      'unapologetic and self-assured resistance, standing your ground, refusing to be diminished or controlled',
  },
  {
    id: 'romantic',
    label: 'Romantic',
    group: 'mood',
    description:
      'tender devotion and adoration, being in love, sweetness and warmth directed at another person',
  },
  {
    id: 'nostalgic',
    label: 'Nostalgic',
    group: 'mood',
    description:
      'looking back fondly at the past, memory-soaked and faded, missing a time or a person now gone',
  },
  {
    id: 'triumphant',
    label: 'Triumphant',
    group: 'mood',
    description:
      'victorious and vindicated, rising after struggle, a chest-out moment of arrival and self-belief',
  },
];

const themes: Descriptor[] = [
  {
    id: 'heartbreak',
    label: 'Heartbreak',
    group: 'theme',
    description:
      'the end of a relationship, being left, grief over someone who has gone, broken love and its aftermath',
  },
  {
    id: 'longing',
    label: 'Longing',
    group: 'theme',
    description:
      'wanting someone or something out of reach, yearning across distance, waiting and aching for return',
  },
  {
    id: 'desire',
    label: 'Desire',
    group: 'theme',
    description:
      'attraction and wanting, flirtation and physical pull toward another person, temptation',
  },
  {
    id: 'confidence',
    label: 'Confidence',
    group: 'theme',
    description:
      'self-assurance and swagger, knowing your own worth, walking into a room owning it',
  },
  {
    id: 'nostalgia',
    label: 'Nostalgia',
    group: 'theme',
    description:
      'memory of youth and earlier times, old photographs, summers that already ended, looking backwards',
  },
  {
    id: 'freedom',
    label: 'Freedom',
    group: 'theme',
    description:
      'escape and open road, breaking out of constraint, independence and the wide open possibility of leaving',
  },
  {
    id: 'loneliness',
    label: 'Loneliness',
    group: 'theme',
    description:
      'isolation and disconnection, being alone at night, unseen among other people, empty rooms',
  },
  {
    id: 'friendship',
    label: 'Friendship',
    group: 'theme',
    description:
      'closeness with friends, loyalty and shared history, being carried through by the people around you',
  },
  {
    id: 'escapism',
    label: 'Escapism',
    group: 'theme',
    description:
      'leaving reality behind, fantasy and dissociation, going out to forget, dreaming of somewhere else',
  },
  {
    id: 'self-worth',
    label: 'Self-worth',
    group: 'theme',
    description:
      'valuing yourself, healing and reclaiming identity, refusing to be treated as less than you are',
  },
  {
    id: 'jealousy',
    label: 'Jealousy',
    group: 'theme',
    description:
      'envy and possessiveness, watching someone else have what you want, suspicion and comparison',
  },
  {
    id: 'celebration',
    label: 'Celebration',
    group: 'theme',
    description:
      'partying and marking a moment, joy shared with a crowd, dancing together, a night that matters',
  },
  {
    id: 'regret',
    label: 'Regret',
    group: 'theme',
    description:
      'wishing you had acted differently, apology and hindsight, carrying the weight of a past mistake',
  },
  {
    id: 'obsession',
    label: 'Obsession',
    group: 'theme',
    description:
      'consuming fixation on a person, unable to think of anything else, intensity that tips past healthy',
  },
  {
    id: 'growing-up',
    label: 'Growing up',
    group: 'theme',
    description:
      'coming of age, adolescence and change, becoming someone new, leaving childhood or a hometown behind',
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    group: 'theme',
    description:
      'clubs and late hours, taxis at 3am, city lights, getting ready to go out and coming home at dawn',
  },
];

const textures: Descriptor[] = [
  {
    id: 'polished',
    label: 'Polished',
    group: 'texture',
    description:
      'clean high-gloss production, precise and expensive sounding, every element mixed smooth and radio ready',
  },
  {
    id: 'raw',
    label: 'Raw',
    group: 'texture',
    description:
      'unpolished and immediate, rough edges, live-sounding, lo-fi and imperfect on purpose',
  },
  {
    id: 'electronic',
    label: 'Electronic',
    group: 'texture',
    description:
      'synthesisers, drum machines and programmed production, digital and machine-made sound design',
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    group: 'texture',
    description:
      'guitars, piano and unamplified instruments, wooden and human, played in a room rather than programmed',
  },
  {
    id: 'atmospheric',
    label: 'Atmospheric',
    group: 'texture',
    description:
      'reverb-heavy and spacious, ambient washes and long tails, more environment than song structure',
  },
  {
    id: 'bright',
    label: 'Bright',
    group: 'texture',
    description:
      'treble-forward and shining, crisp highs and sparkle, sunlit and open sounding',
  },
  {
    id: 'dark',
    label: 'Dark',
    group: 'texture',
    description:
      'low, shadowed and heavy, minor tonality and murky depth, night-coloured and brooding',
  },
  {
    id: 'warm',
    label: 'Warm',
    group: 'texture',
    description:
      'analogue warmth, tape and vinyl character, rounded low-mids, enveloping and comforting sound',
  },
  {
    id: 'cold',
    label: 'Cold',
    group: 'texture',
    description:
      'clinical and metallic, detached and glassy, sterile precision without human warmth',
  },
  {
    id: 'maximal',
    label: 'Maximal',
    group: 'texture',
    description:
      'dense and layered, everything at once, walls of sound, saturated and overwhelming arrangement',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    group: 'texture',
    description:
      'sparse and restrained, few elements, space between the notes, stripped back to essentials',
  },
  {
    id: 'orchestral',
    label: 'Orchestral',
    group: 'texture',
    description:
      'strings and cinematic arrangement, sweeping and dramatic instrumentation, film score quality',
  },
  {
    id: 'distorted',
    label: 'Distorted',
    group: 'texture',
    description:
      'fuzzed and overdriven, clipped and abrasive, guitars or synths pushed past clean',
  },
  {
    id: 'groovy',
    label: 'Groovy',
    group: 'texture',
    description:
      'bass-led and pocketed rhythm, funky and swung, a physical groove that moves the hips',
  },
];

const energies: Descriptor[] = [
  {
    id: 'high-energy',
    label: 'High energy',
    group: 'energy',
    description:
      'fast, loud and driving, relentless propulsion, made to move to, peak-time intensity',
  },
  {
    id: 'mid-energy',
    label: 'Steady energy',
    group: 'energy',
    description:
      'moderate mid-tempo pace, moving but not urgent, comfortable forward motion',
  },
  {
    id: 'low-energy',
    label: 'Low energy',
    group: 'energy',
    description:
      'slow, quiet and still, downtempo and restful, barely moving, made for lying down',
  },
  {
    id: 'building',
    label: 'Building',
    group: 'energy',
    description:
      'starts small and grows, gradual escalation toward a climax, tension accumulating over time',
  },
];

const vibes: Descriptor[] = [
  {
    id: 'glossy',
    label: 'Glossy',
    group: 'vibe',
    description:
      'shiny surface pop, lip gloss and mirrors, expensive and reflective, a polished feminine sheen',
  },
  {
    id: 'feminine',
    label: 'Feminine',
    group: 'vibe',
    description:
      'girly and femme-coded, female perspective and female vocals, softness or bratty girlhood',
  },
  {
    id: 'camp',
    label: 'Camp',
    group: 'vibe',
    description:
      'theatrical excess and knowing irony, drag sensibility, deliberately over the top and fabulous',
  },
  {
    id: 'weird',
    label: 'Weird',
    group: 'vibe',
    description:
      'strange and off-kilter, experimental and unpredictable, refusing conventional structure',
  },
  {
    id: 'witchy',
    label: 'Witchy',
    group: 'vibe',
    description:
      'occult and folk-mystical, candles and herbs, autumnal feminine mysticism, spellbound and earthy',
  },
  {
    id: 'nocturnal',
    label: 'Nocturnal',
    group: 'vibe',
    description:
      'after dark, made for night driving and empty streets, moonlit and quietly awake',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    group: 'vibe',
    description:
      'widescreen and dramatic, feels like a film scene, grand emotional staging',
  },
  {
    id: 'intimate',
    label: 'Intimate',
    group: 'vibe',
    description:
      'close and hushed, singing directly into your ear, small room, confessional and private',
  },
  {
    id: 'anthemic',
    label: 'Anthemic',
    group: 'vibe',
    description:
      'stadium-sized singalong, huge chorus meant for a crowd shouting every word',
  },
  {
    id: 'retro',
    label: 'Retro',
    group: 'vibe',
    description:
      'sounds like an earlier decade, vintage production and period reference, deliberately old-fashioned',
  },
  {
    id: 'organic',
    label: 'Organic',
    group: 'vibe',
    description:
      'natural and hand-played, breathing and imperfect, earthy and unprocessed, human hands on instruments',
  },
  {
    id: 'euphoric-dance',
    label: 'Dancefloor',
    group: 'vibe',
    description:
      'four to the floor club music, hands in the air, built for dancing in a crowd',
  },
  {
    id: 'melodramatic',
    label: 'Dramatic',
    group: 'vibe',
    description:
      'heightened emotion performed at full scale, theatrical intensity, nothing understated',
  },
  {
    id: 'laid-back',
    label: 'Easy',
    group: 'vibe',
    description:
      'relaxed and undemanding, background-friendly, pleasant and casual, nothing to prove',
  },
  {
    id: 'hypnotic',
    label: 'Hypnotic',
    group: 'vibe',
    description:
      'repetitive and trance-inducing, looping patterns that pull you under, meditative circularity',
  },
  {
    id: 'singalong',
    label: 'Singalong',
    group: 'vibe',
    description:
      'immediately memorable chorus, easy to shout along to, communal and catchy',
  },
];

export const DESCRIPTORS: Descriptor[] = [
  ...moods,
  ...themes,
  ...textures,
  ...energies,
  ...vibes,
];

export const DESCRIPTORS_BY_GROUP: Record<DescriptorGroup, Descriptor[]> = {
  mood: moods,
  theme: themes,
  texture: textures,
  energy: energies,
  vibe: vibes,
};

export function findDescriptor(id: string): Descriptor | undefined {
  return DESCRIPTORS.find((d) => d.id === id);
}

/** Text used when embedding a descriptor, combining label and hidden meaning. */
export function descriptorEmbeddingText(descriptor: Descriptor): string {
  return `${descriptor.label}: ${descriptor.description}`;
}
