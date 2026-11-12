import { describe, expect, it, vi } from 'vitest';
import { createApiSource, type Transport, type TransportResult } from '../src/data/apiSource';
import { collect } from '../src/data/paginator';
import { AuthError, HttpError, SchemaError, type TransactionSource } from '../src/data/source';

const noSleep = async () => {};
const ok = (items: unknown[]): TransportResult => ({ status: 200, body: { data: { items } }, retryAfterMs: null });
const item = (n: number) => ({ voucherDate: '2026-11-12', amount: n, remain: n });

/** Mock server: `total` rows served by skip/pageSize. */
const server = (total: number): Transport => async (skip, pageSize) =>
  ok(Array.from({ length: Math.max(0, Math.min(pageSize, total - skip)) }, (_, i) => item(skip + i)));

describe('apiSource + paginator', () => {
  it('returns the full history and stops on a short page', async () => {
    const transport = vi.fn(server(45));
    const res = await collect(createApiSource(transport), { signal: new AbortController().signal, sleep: noSleep });
    expect(res.status).toBe('complete');
    expect(res.items).toHaveLength(45);
    expect(transport.mock.calls.map((c) => c[0])).toEqual([0, 20, 40]);
  });

  it('makes one extra request when the last page is exactly full', async () => {
    const transport = vi.fn(server(40));
    const res = await collect(createApiSource(transport), { signal: new AbortController().signal, sleep: noSleep });
    expect(res.items).toHaveLength(40);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('stops early when asked', async () => {
    const transport = vi.fn(server(1000));
    const res = await collect(createApiSource(transport), {
      signal: new AbortController().signal,
      sleep: noSleep,
      shouldStop: (items) => items.length >= 40,
    });
    expect(res.items).toHaveLength(40);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('dedupes overlapping pages', async () => {
    const pages = [[1, 2, 3], [3, 4, 5], [5]];
    const source: TransactionSource<number, number> = {
      fetchPage: async (c) => ({ items: pages[c ?? 0], next: (c ?? 0) + 1 < pages.length ? (c ?? 0) + 1 : null }),
    };
    const res = await collect(source, { signal: new AbortController().signal, sleep: noSleep, keyOf: String });
    expect(res.items).toEqual([1, 2, 3, 4, 5]);
  });

  it('retries 429 with Retry-After, then succeeds', async () => {
    const sleep = vi.fn(noSleep);
    let calls = 0;
    const transport: Transport = async () =>
      ++calls === 1 ? { status: 429, body: null, retryAfterMs: 7000 } : ok([item(1)]);
    const res = await collect(createApiSource(transport), { signal: new AbortController().signal, sleep });
    expect(res.status).toBe('complete');
    expect(sleep).toHaveBeenCalledWith(7000, expect.anything());
  });

  it('gives up after max retries and keeps what was loaded', async () => {
    let calls = 0;
    const transport: Transport = async (skip, size) =>
      ++calls === 1 ? server(100)(skip, size, new AbortController().signal) : { status: 503, body: null, retryAfterMs: null };
    const res = await collect(createApiSource(transport), {
      signal: new AbortController().signal,
      sleep: noSleep,
      maxRetries: 2,
    });
    expect(res.status).toBe('error');
    expect(res.error).toBeInstanceOf(HttpError);
    expect(res.items).toHaveLength(20);
    expect(calls).toBe(1 + 3);
  });

  it('stops on 401 mid-export after one retry', async () => {
    let calls = 0;
    const transport: Transport = async (skip, size) =>
      ++calls === 1 ? server(100)(skip, size, new AbortController().signal) : { status: 401, body: null, retryAfterMs: null };
    const res = await collect(createApiSource(transport), { signal: new AbortController().signal, sleep: noSleep });
    expect(res.error).toBeInstanceOf(AuthError);
    expect(res.items).toHaveLength(20);
    expect(calls).toBe(3);
  });

  it('reports a schema change without retrying', async () => {
    const transport = vi.fn<Transport>(async () => ({ status: 200, body: { data: { rows: [] } }, retryAfterMs: null }));
    const res = await collect(createApiSource(transport), { signal: new AbortController().signal, sleep: noSleep });
    expect(res.error).toBeInstanceOf(SchemaError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('cancels mid-export and returns the partial result', async () => {
    const controller = new AbortController();
    const res = await collect(createApiSource(server(1000)), {
      signal: controller.signal,
      onProgress: (items) => items.length >= 60 && controller.abort(),
    });
    expect(res.status).toBe('cancelled');
    expect(res.items).toHaveLength(60);
  });

  it('handles an empty history', async () => {
    const res = await collect(createApiSource(server(0)), { signal: new AbortController().signal, sleep: noSleep });
    expect(res).toEqual({ items: [], status: 'complete' });
  });
});
