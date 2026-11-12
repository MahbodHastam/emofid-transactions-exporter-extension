import { pageSchema, type RawTx } from './schema';
import { AuthError, HttpError, SchemaError, type TransactionSource } from './source';

export interface TransportResult {
  status: number;
  body: unknown;
  retryAfterMs: number | null;
}

export type Transport = (skip: number, pageSize: number, signal: AbortSignal) => Promise<TransportResult>;

export const PAGE_SIZE = 20;

export function createApiSource(transport: Transport, pageSize = PAGE_SIZE): TransactionSource<RawTx, number> {
  return {
    async fetchPage(cursor, signal) {
      const skip = cursor ?? 0;
      const res = await transport(skip, pageSize, signal);
      if (res.status === -1 || res.status === 401 || res.status === 403 || res.status === 440) {
        throw new AuthError(`auth ${res.status}`);
      }
      if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, res.retryAfterMs);

      const parsed = pageSchema.safeParse(res.body);
      if (!parsed.success) throw new SchemaError(parsed.error.message);
      const { items } = parsed.data.data;
      return { items, next: items.length === pageSize ? skip + pageSize : null };
    },
  };
}
