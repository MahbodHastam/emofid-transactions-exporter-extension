import { AuthError, HttpError, type TransactionSource } from './source';

export interface CollectOptions<T> {
  signal: AbortSignal;
  onProgress?: (items: T[]) => void;
  shouldStop?: (items: T[]) => boolean;
  keyOf?: (item: T) => string | null;
  delayMs?: number;
  maxRetries?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface CollectResult<T> {
  items: T[];
  status: 'complete' | 'cancelled' | 'error';
  error?: unknown;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function collect<T, C>(
  source: TransactionSource<T, C>,
  opts: CollectOptions<T>,
): Promise<CollectResult<T>> {
  const { signal, delayMs = 250, maxRetries = 4, sleep = abortableSleep } = opts;
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: C | null = null;

  try {
    for (;;) {
      let page;
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted) return { items, status: 'cancelled' };
        try {
          page = await source.fetchPage(cursor, signal);
          break;
        } catch (e) {
          // 401 gets one delayed retry: the site may have just refreshed its token.
          const retry =
            (e instanceof HttpError && e.retryable && attempt < maxRetries) || (e instanceof AuthError && attempt < 1);
          if (!retry) throw e;
          const backoff = e instanceof HttpError && e.retryAfterMs != null ? e.retryAfterMs : 1000 * 2 ** attempt;
          await sleep(backoff, signal);
        }
      }

      for (const item of page.items) {
        const key = opts.keyOf?.(item) ?? null;
        if (key !== null) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        items.push(item);
      }
      opts.onProgress?.(items);

      if (page.next === null || opts.shouldStop?.(items)) return { items, status: 'complete' };
      cursor = page.next;
      await sleep(delayMs, signal);
    }
  } catch (e) {
    if (signal.aborted) return { items, status: 'cancelled' };
    return { items, status: 'error', error: e };
  }
}
