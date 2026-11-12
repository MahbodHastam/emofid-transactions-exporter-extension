export interface Page<T, C> {
  items: T[];
  next: C | null;
}

export interface TransactionSource<T, C> {
  fetchPage(cursor: C | null, signal: AbortSignal): Promise<Page<T, C>>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public retryAfterMs: number | null = null,
  ) {
    super(`HTTP ${status}`);
  }
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export class AuthError extends Error {}

export class SchemaError extends Error {}
