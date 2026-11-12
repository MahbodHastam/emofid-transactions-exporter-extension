import type { Transaction } from '../domain/model';

export interface Column {
  header: string;
  kind: 'text' | 'number';
  width: number;
  get: (t: Transaction) => string | number | null;
}

export const COLUMNS: Column[] = [
  { header: 'date_jalali', kind: 'text', width: 13, get: (t) => t.dateJalali },
  { header: 'title', kind: 'text', width: 28, get: (t) => t.title },
  { header: 'description', kind: 'text', width: 50, get: (t) => t.description },
  { header: 'type', kind: 'text', width: 16, get: (t) => t.type },
  { header: 'direction', kind: 'text', width: 10, get: (t) => (t.direction === 'unknown' ? '' : t.direction) },
  { header: 'amount_rial', kind: 'number', width: 18, get: (t) => t.amount },
  { header: 'signed_amount_rial', kind: 'number', width: 20, get: (t) => t.signedAmount },
  { header: 'balance_after_rial', kind: 'number', width: 20, get: (t) => t.balanceAfter },
];
