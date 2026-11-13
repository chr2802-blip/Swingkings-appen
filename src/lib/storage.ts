/**
 * Where a picture's bytes live when Supabase Storage is set up: a private bucket, read and
 * written only here, with the secret key. Nothing in the bucket is reachable from a
 * browser — `/api/photos/<id>` checks the session first and streams the object itself.
 *
 * Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` there is no storage, and pictures stay
 * in Postgres exactly as before. A picture's row says which it is (`storageKey`), so the
 * two can coexist while the old ones are moved (`npm run db:photos`).
 *
 * Plain `fetch` against the Storage REST API: no client library to carry.
 */
export const PHOTO_BUCKET = "photos";
const TIMEOUT_MS = 15_000;

export type StorageConfig = { url: string; secretKey: string };

export function storageConfig(env: Record<string, string | undefined> = process.env): StorageConfig | null {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  return url && secretKey ? { url, secretKey } : null;
}

function headers(config: StorageConfig, extra: Record<string, string> = {}) {
  // New-style secret keys are not JWTs and go in `apikey` alone; a legacy key is a JWT
  // and is also the bearer.
  return {
    apikey: config.secretKey,
    ...(config.secretKey.startsWith("eyJ") ? { authorization: `Bearer ${config.secretKey}` } : {}),
    ...extra,
  };
}

const objectUrl = (config: StorageConfig, key: string) => `${config.url}/storage/v1/object/${PHOTO_BUCKET}/${key}`;

/** The object names of one picture: the full size and its thumbnail. */
export const fullKey = (key: string) => key;
export const thumbKey = (key: string) => `${key}-thumb`;

export async function putObject(config: StorageConfig, key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(objectUrl(config, key), {
    method: "POST",
    headers: headers(config, { "content-type": contentType, "x-upsert": "false" }),
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Storage refused ${key}: ${response.status}`);
}

/** The object as a response to stream, or null when there is none. */
export async function getObject(config: StorageConfig, key: string): Promise<Response | null> {
  const response = await fetch(objectUrl(config, key), { headers: headers(config), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 400 || response.status === 404) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.ok) throw new Error(`Storage failed on ${key}: ${response.status}`);
  return response;
}

/**
 * Removes objects, and never throws: a picture's row is already gone by now, and a stray
 * object costs a few kilobytes where a failed delete would cost somebody their action.
 */
export async function removeObjects(config: StorageConfig, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const response = await fetch(`${config.url}/storage/v1/object/${PHOTO_BUCKET}`, {
      method: "DELETE",
      headers: headers(config, { "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: keys }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) console.error(JSON.stringify({ event: "storage_remove_failed", status: response.status }));
  } catch (error) {
    console.error(JSON.stringify({ event: "storage_remove_failed", error: error instanceof Error ? error.message : String(error) }));
  }
}
