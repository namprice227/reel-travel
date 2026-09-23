// Server-only transport shared by real extraction and Places adapters.
export class ProviderError extends Error {
  constructor(public readonly code: string, message: string, public readonly transient = false) { super(message); this.name = "ProviderError"; }
}
const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
/** Backoff for import-path calls. Interactive itinerary calls keep their own 40-second budget instead. */
export const PROVIDER_RETRY_DELAYS_MS = [1_000, 3_000];

/** Idempotent calls may pass retryDelaysMs to back off on busy/rate-limited replies and network errors, not timeouts. */
export async function providerJson(url: string, init: RequestInit, options: {
  fetch?: typeof fetch; timeoutMs?: number; code: string; retryDelaysMs?: number[];
}): Promise<unknown> {
  const delays = options.retryDelaysMs ?? [];
  for (let retry = 0; ; retry++) {
    try { return await providerJsonOnce(url, init, options); }
    catch (error) {
      if (!(error instanceof ProviderError) || !error.transient || retry >= delays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[retry]));
    }
  }
}

async function providerJsonOnce(url: string, init: RequestInit, options: {
  fetch?: typeof fetch; timeoutMs?: number; code: string;
}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new ProviderError("INVALID_CONFIGURATION", "Provider timeout must be between 1 and 300000 ms.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    controller.abort(); reject(new ProviderError(options.code, "Provider request timed out."));
  }, timeoutMs); });
  try {
    return await Promise.race([deadline, (async () => {
      const response = await (options.fetch ?? globalThis.fetch)(url, { ...init, signal: controller.signal, redirect: "error" })
        .catch(() => { throw new ProviderError(options.code, "Provider could not be reached.", true); });
      if (!response.ok) throw new ProviderError(options.code, `Provider request failed (HTTP ${response.status}). Check provider access and request limits.`,
        TRANSIENT_HTTP_STATUS.has(response.status));
      const reader = response.body?.getReader();
      if (!reader) throw new ProviderError(options.code, "Provider returned no body.");
      let text = "", size = 0; const decoder = new TextDecoder();
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 2_000_000) throw new ProviderError(options.code, "Provider response exceeds size limit.");
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return JSON.parse(text) as unknown;
    })()]);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(options.code, "Provider request failed or returned invalid JSON.");
  } finally { clearTimeout(timer); }
}
