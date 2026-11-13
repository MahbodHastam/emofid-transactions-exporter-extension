import { describe, expect, it } from 'vitest';
import { pageSchema } from '../src/data/schema';
import { normalizeAll } from '../src/domain/normalize';
import { toCsv } from '../src/export/csv';
import { exportFilename } from '../src/export/filename';
import fixture from './fixtures/accountHistory.page1.json';

const txs = normalizeAll(pageSchema.parse(fixture).data.items);
const range = { from: { jy: 1405, jm: 7, jd: 1 }, to: { jy: 1405, jm: 7, jd: 30 } };

describe('csv', () => {
  const csv = toCsv(txs);
  const lines = csv.slice(1).split('\r\n');

  it('starts with a BOM and uses CRLF', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/\r/);
  });
  it('has Jalali dates only: no Gregorian or time column', () => {
    expect(lines[0]).toBe(
      'تاریخ,عنوان,مبلغ (ریال),واریز یا برداشت,مبلغ با علامت (ریال),مانده (ریال),نماد,خرید یا فروش,تعداد,نرخ هر سهم (ریال),کارمزد و مالیات (ریال),نوع سند,شرح',
    );
    expect(toCsv(normalizeAll([{ voucherDate: '2026-11-12T09:05:00', amount: 1 }]))).not.toMatch(/2026|09:05/);
  });
  it('keeps Persian text and numeric amounts', () => {
    expect(lines[1]).toBe('1405/08/21,واریز نمونه,2500000,واریز,2500000,9000000,,,,,,SampleDeposit,شرح نمونه ۱');
  });
  it('guards text cells against formula injection, but not numbers', () => {
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://example.invalid"")"`);
    expect(lines[2]).toContain(',3350771,برداشت,-3350771,6500000,');
  });
  it('quotes commas and quotes, and keeps every row on one line', () => {
    expect(csv).toContain('"واریز, با ""نقل قول"" و خط جدید"');
    expect(lines.length).toBe(txs.length + 2);
  });
});

describe('filename', () => {
  it('follows the naming scheme', () => {
    expect(exportFilename({ direction: 'in', range, format: 'csv' })).toBe(
      'emofid-transactions_in_1405-07-01_1405-07-30.csv',
    );
    expect(exportFilename({ direction: 'all', range: null, format: 'pdf' })).toBe(
      'emofid-transactions_all_full-history.pdf',
    );
  });
});
