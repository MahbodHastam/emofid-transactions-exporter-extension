import type { Transaction } from '../domain/model';
import { COLUMNS } from './columns';

/** Text cells are written by other people: neutralize spreadsheet formulas. */
const guard = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ');
const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(txs: Transaction[]): string {
  const cols = COLUMNS;
  const lines = [cols.map((c) => c.header).join(',')];
  for (const t of txs) {
    lines.push(
      cols
        .map((c) => {
          const v = c.get(t);
          if (v === null) return '';
          return c.kind === 'number' ? String(v) : quote(guard(oneLine(String(v))));
        })
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
