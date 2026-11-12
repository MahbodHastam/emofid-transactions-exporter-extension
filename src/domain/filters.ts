import { dayKey } from '../dates/jalali';
import type { ExportQuery, Summary, Transaction } from './model';

export function applyQuery(txs: Transaction[], q: Pick<ExportQuery, 'direction' | 'range'>): Transaction[] {
  const from = q.range ? dayKey(q.range.from) : -Infinity;
  const to = q.range ? dayKey(q.range.to) : Infinity;
  return txs.filter((t) => {
    const k = dayKey(t.date);
    return k >= from && k <= to && (q.direction === 'all' || t.direction === q.direction);
  });
}

export function sortByDate(txs: Transaction[], order: 'newest' | 'oldest'): Transaction[] {
  const newestFirst = txs.length < 2 || dayKey(txs[0].date) >= dayKey(txs[txs.length - 1].date);
  // Source order is the ledger order; only reverse, so same-day rows keep their sequence.
  return (order === 'newest') === newestFirst ? txs : [...txs].reverse();
}

export function summarize(txs: Transaction[]): Summary {
  let totalIn = 0;
  let totalOut = 0;
  let unknown = 0;
  let oldest: Transaction | null = null;
  let newest: Transaction | null = null;
  for (const t of txs) {
    if (t.direction === 'in') totalIn += t.amount;
    else if (t.direction === 'out') totalOut += t.amount;
    else unknown++;
    if (!oldest || dayKey(t.date) < dayKey(oldest.date)) oldest = t;
    if (!newest || dayKey(t.date) > dayKey(newest.date)) newest = t;
  }
  return {
    count: txs.length,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    unknown,
    oldest: oldest?.dateJalali ?? null,
    newest: newest?.dateJalali ?? null,
  };
}
