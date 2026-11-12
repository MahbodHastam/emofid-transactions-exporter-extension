import { formatJalali } from '../dates/jalali';
import type { ExportQuery } from '../domain/model';

export function exportFilename(q: ExportQuery): string {
  const span = q.range ? `${formatJalali(q.range.from, '-')}_${formatJalali(q.range.to, '-')}` : 'full-history';
  return `emofid-transactions_${q.direction}_${span}.${q.format}`;
}
