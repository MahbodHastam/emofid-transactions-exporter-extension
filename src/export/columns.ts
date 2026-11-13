import type { Transaction } from '../domain/model';

export interface Column {
  header: string;
  kind: 'text' | 'number';
  get: (t: Transaction) => string | number | null;
}

const DIRECTION = { in: 'واریز', out: 'برداشت', unknown: '' };
const SIDE = { buy: 'خرید', sell: 'فروش' };

export const COLUMNS: Column[] = [
  { header: 'تاریخ', kind: 'text', get: (t) => t.dateJalali },
  { header: 'عنوان', kind: 'text', get: (t) => t.title },
  { header: 'مبلغ (ریال)', kind: 'number', get: (t) => t.amount },
  { header: 'واریز یا برداشت', kind: 'text', get: (t) => DIRECTION[t.direction] },
  { header: 'مبلغ با علامت (ریال)', kind: 'number', get: (t) => t.signedAmount },
  { header: 'مانده (ریال)', kind: 'number', get: (t) => t.balanceAfter },
  { header: 'نماد', kind: 'text', get: (t) => t.trade?.symbol ?? '' },
  { header: 'خرید یا فروش', kind: 'text', get: (t) => (t.trade ? SIDE[t.trade.side] : '') },
  { header: 'تعداد', kind: 'number', get: (t) => t.trade?.quantity ?? null },
  { header: 'نرخ هر سهم (ریال)', kind: 'number', get: (t) => t.trade?.price ?? null },
  { header: 'کارمزد و مالیات (ریال)', kind: 'number', get: (t) => t.trade?.fee ?? null },
  { header: 'نوع سند', kind: 'text', get: (t) => t.type },
  { header: 'شرح', kind: 'text', get: (t) => t.description },
];
