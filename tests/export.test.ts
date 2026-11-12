import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { pageSchema } from '../src/data/schema';
import { summarize } from '../src/domain/filters';
import { normalizeAll } from '../src/domain/normalize';
import { toCsv } from '../src/export/csv';
import { exportFilename } from '../src/export/filename';
import { buildSheets } from '../src/export/xlsx';
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
    expect(lines[0]).toBe('date_jalali,title,description,type,direction,amount_rial,signed_amount_rial,balance_after_rial');
    expect(toCsv(normalizeAll([{ voucherDate: '2026-11-12T09:05:00', amount: 1 }]))).not.toMatch(/2026|09:05/);
  });
  it('keeps Persian text and numeric amounts', () => {
    expect(lines[1]).toBe('1405/08/21,واریز نمونه,شرح نمونه ۱,SampleDeposit,in,2500000,2500000,9000000');
  });
  it('guards text cells against formula injection, but not numbers', () => {
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://example.invalid"")"`);
    expect(lines[2]).toContain(',out,3350771,-3350771,6500000');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(csv).toContain('"واریز, با ""نقل قول""\nو خط جدید"');
  });
});

describe('xlsx', async () => {
  const summary = summarize(txs);
  const sheets = buildSheets(txs, {
    query: { direction: 'all', range: null },
    summary,
    version: '0.1.0',
    partial: false,
    now: new Date('2026-11-12T08:00:00Z'),
  });
  const files = unzipSync(await writeXlsxFile(sheets).toBuffer());
  const xml = (name: string) => strFromU8(files[name]);
  const names = Object.keys(files);

  it('has a Transactions and a Summary sheet', () => {
    expect(xml('xl/workbook.xml')).toMatch(/name="Transactions".*name="Summary"/s);
    expect(names).toContain('xl/worksheets/sheet2.xml');
  });
  it('is right-to-left with a frozen header', () => {
    const sheet = xml('xl/worksheets/sheet1.xml');
    expect(sheet).toMatch(/rightToLeft="(1|true)"/);
    expect(sheet).toMatch(/<pane[^>]*ySplit="1"/);
  });
  it('writes amounts as numeric cells', () => {
    const sheet = xml('xl/worksheets/sheet1.xml');
    expect(sheet).toMatch(/<c r="F2"[^>]*><v>2500000<\/v>/);
    expect(sheet).toMatch(/<c r="G3"[^>]*><v>-3350771<\/v>/);
    expect(sheet).not.toMatch(/<c r="F2"[^>]*t="(s|str|inlineStr)"/);
    expect(sheet).not.toContain('<f>');
  });
  it('has summary totals equal to the sum of the rows', () => {
    const sumIn = txs.filter((t) => t.direction === 'in').reduce((a, t) => a + t.amount, 0);
    const sumOut = txs.filter((t) => t.direction === 'out').reduce((a, t) => a + t.amount, 0);
    expect(summary).toMatchObject({ totalIn: sumIn, totalOut: sumOut, net: sumIn - sumOut });
    const sheet = xml('xl/worksheets/sheet2.xml');
    expect(sheet).toContain(`<v>${sumIn}</v>`);
    expect(sheet).toContain(`<v>${sumOut}</v>`);
    expect(sheet).toContain(`<v>${sumIn - sumOut}</v>`);
  });
});

describe('filename', () => {
  it('follows the naming scheme', () => {
    expect(exportFilename({ direction: 'in', range, format: 'csv' })).toBe(
      'emofid-transactions_in_1405-07-01_1405-07-30.csv',
    );
    expect(exportFilename({ direction: 'all', range: null, format: 'xlsx' })).toBe(
      'emofid-transactions_all_full-history.xlsx',
    );
  });
});
