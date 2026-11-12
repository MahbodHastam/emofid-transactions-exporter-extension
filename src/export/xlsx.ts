import type { Sheet } from 'write-excel-file/universal';
import { formatJalali, gregorianToJalali } from '../dates/jalali';
import { tehranCivil } from '../dates/tehran';
import type { ExportQuery, Summary, Transaction } from '../domain/model';
import { COLUMNS } from './columns';

const NUM = '#,##0';

export interface XlsxMeta {
  query: Pick<ExportQuery, 'direction' | 'range'>;
  summary: Summary;
  version: string;
  partial: boolean;
  now?: Date;
}

export function buildSheets(txs: Transaction[], meta: XlsxMeta): Sheet<never>[] {
  const cols = COLUMNS;
  const header = cols.map((c) => ({ value: c.header, fontWeight: 'bold' as const }));
  const rows = txs.map((t) =>
    cols.map((c) => {
      const v = c.get(t);
      if (v === null || v === '') return null;
      // '@' = Text: stops Excel reinterpreting text (and formulas) in string cells.
      return c.kind === 'number'
        ? { value: v as number, format: NUM }
        : { value: String(v), type: String, format: '@' };
    }),
  );

  const { query, summary: s } = meta;
  const c = tehranCivil(meta.now ?? new Date());
  const num = (value: number) => ({ value, format: NUM });
  const summary = [
    ['direction', query.direction],
    ['range_jalali', query.range ? `${formatJalali(query.range.from)} - ${formatJalali(query.range.to)}` : 'full history'],
    ['timezone', 'Asia/Tehran'],
    ['exported_at_tehran', `${formatJalali(gregorianToJalali(c.gy, c.gm, c.gd))} ${c.time}`],
    ['rows', num(s.count)],
    ['total_in_rial', num(s.totalIn)],
    ['total_out_rial', num(s.totalOut)],
    ['profit_loss_rial', num(s.net)],
    ['rows_with_unknown_direction', num(s.unknown)],
    ['oldest_date_jalali', s.oldest ?? ''],
    ['newest_date_jalali', s.newest ?? ''],
    ['complete', meta.partial ? 'no (partial export)' : 'yes'],
    ['extension_version', meta.version],
  ];

  return [
    {
      data: [header, ...rows],
      sheet: 'Transactions',
      columns: cols.map((col) => ({ width: col.width })),
      stickyRowsCount: 1,
      rightToLeft: true,
    },
    { data: summary, sheet: 'Summary', columns: [{ width: 30 }, { width: 30 }] },
  ];
}
