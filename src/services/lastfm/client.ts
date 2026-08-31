/**
 * Thin Last.fm client.
 *
 * The API key is read from `VITE_LASTFM_API_KEY`. This is a static browser
 * app, so that key is visible to anyone who opens devtools and cannot be
 * treated as a secret; see README. The provider boundary exists so a proxy or
 * serverless function can be dropped in later without touching feature code.
 */

const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';

export function getLastfmApiKey(): string | undefined {
  const key = import.meta.env.VITE_LASTFM_API_KEY as string | undefined;
  return key && key.trim() ? key.trim() : undefined;
}

export function isLastfmConfigured(): boolean {
  return Boolean(getLastfmApiKey());
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export async function lastfmRequest<T>(
  method: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const apiKey = getLastfmApiKey();
  if (!apiKey) throw new ProviderUnavailableError('Last.fm is not configured');

  const url = new URL(ENDPOINT);
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new ProviderUnavailableError(`Last.fm responded ${response.status}`);
  }
  const data = (await response.json()) as T & { error?: number; message?: string };
  if (data.error) {
    throw new ProviderUnavailableError(data.message ?? 'Last.fm returned an error');
  }
  return data;
}

/** Last.fm ships placeholder art for unknown releases; those are not useful. */
export function pickImage(
  images: { size: string; ['#text']: string }[] | undefined,
): string | undefined {
  if (!images) return undefined;
  const preferred = ['extralarge', 'large', 'medium'];
  for (const size of preferred) {
    const match = images.find((img) => img.size === size && img['#text']);
    if (match && !match['#text'].includes('2a96cbd8b46e442fc41c2b86b821562f')) {
      return match['#text'];
    }
  }
  return undefined;
}
