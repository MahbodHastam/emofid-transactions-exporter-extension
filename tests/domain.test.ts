import { describe, expect, it } from 'vitest';
import { pageSchema, type RawTx } from '../src/data/schema';
import { SchemaError } from '../src/data/source';
import { applyQuery, sortByDate, summarize } from '../src/domain/filters';
import { normalizeAll, parseVoucherDate, passedRangeStart, rawKey } from '../src/domain/normalize';
import fixture from './fixtures/accountHistory.page1.json';

const raws = pageSchema.parse(fixture).data.items;
const raw = (voucherDate: string | number, amount: number, remain: number | null = null, voucherType = 'T'): RawTx => ({
  voucherDate,
  amount,
  remain,
  voucherType,
  description: 'x',
});
const day = { from: { jy: 1405, jm: 8, jd: 21 }, to: { jy: 1405, jm: 8, jd: 21 } };

describe('parseVoucherDate', () => {
  it('takes offset-less ISO as the civil date, without a timezone round-trip', () => {
    expect(parseVoucherDate('2026-11-12T00:00:00')).toMatchObject({
      date: { jy: 1405, jm: 8, jd: 21 },
      gregorian: '2026-11-12',
      time: '00:00:00',
    });
    expect(parseVoucherDate('2026-11-12').time).toBeNull();
  });
  it('converts instants to Tehran wall clock', () => {
    expect(parseVoucherDate('2026-11-11T20:30:00Z')).toMatchObject({ gregorian: '2026-11-12', time: '00:00:00' });
    expect(parseVoucherDate('2026-11-12T00:00:00+03:30').gregorian).toBe('2026-11-12');
    expect(parseVoucherDate(Date.UTC(2026, 10, 11, 20, 30)).gregorian).toBe('2026-11-12');
    expect(parseVoucherDate(Date.UTC(2026, 10, 11, 20, 30) / 1000).gregorian).toBe('2026-11-12');
  });
  it('accepts Jalali strings with Persian digits', () => {
    expect(parseVoucherDate('۱۴۰۵/۰۸/۲۱')).toMatchObject({ date: { jy: 1405, jm: 8, jd: 21 }, gregorian: '2026-11-12' });
  });
  it('rejects garbage clearly', () => {
    expect(() => parseVoucherDate('yesterday')).toThrow(SchemaError);
    expect(() => parseVoucherDate('1404/12/30')).toThrow(SchemaError);
  });
});

describe('range inclusivity (Asia/Tehran)', () => {
  const at = (iso: string) => applyQuery(normalizeAll([raw(iso, 1)]), { direction: 'all', range: day }).length;
  it('includes 00:00:00 on from and 23:59:59 on to', () => {
    expect(at('2026-11-11T20:30:00Z')).toBe(1); // 00:00:00 Tehran
    expect(at('2026-11-12T20:29:59Z')).toBe(1); // 23:59:59 Tehran
  });
  it('excludes one second either side', () => {
    expect(at('2026-11-11T20:29:59Z')).toBe(0);
    expect(at('2026-11-12T20:30:00Z')).toBe(0);
  });
});

describe('direction', () => {
  const txs = normalizeAll(raws);
  it('derives direction from balance deltas, then from the learned type', () => {
    expect(txs.map((t) => t.direction)).toEqual(['in', 'out', 'in', 'in']); // last: learned from SampleDeposit
    expect(txs.map((t) => t.signedAmount)).toEqual([2500000, -3350771, 500000, 1000000]);
  });
  it('treats a negative amount as outgoing and exports it unsigned', () => {
    expect(normalizeAll([raw('2026-11-12', -700)])[0]).toMatchObject({ direction: 'out', amount: 700, signedAmount: -700 });
  });
  it('keeps unknown as its own state', () => {
    const [t] = normalizeAll([raw('2026-11-12', 700)]);
    expect(t).toMatchObject({ direction: 'unknown', signedAmount: null });
    expect(applyQuery([t], { direction: 'all', range: null })).toHaveLength(1);
    expect(applyQuery([t], { direction: 'in', range: null })).toHaveLength(0);
    expect(applyQuery([t], { direction: 'out', range: null })).toHaveLength(0);
    expect(summarize([t]).unknown).toBe(1);
  });
  it('does not learn a type that goes both ways', () => {
    const rows = [raw('2026-11-12', 5), raw('2026-11-11', 10, 110), raw('2026-11-10', 20, 100), raw('2026-11-09', 30, 120)];
    expect(normalizeAll(rows).map((t) => t.direction)).toEqual(['unknown', 'in', 'out', 'unknown']);
  });
  it('rejects an unreadable amount', () => {
    expect(() => normalizeAll([{ ...raw('2026-11-12', 1), amount: 'lots' }])).toThrow(SchemaError);
  });
});

describe('filters', () => {
  const txs = normalizeAll(raws);
  const aban = { from: { jy: 1405, jm: 8, jd: 1 }, to: { jy: 1405, jm: 8, jd: 30 } };
  it('combines range with each direction', () => {
    expect(applyQuery(txs, { direction: 'all', range: null })).toHaveLength(4);
    expect(applyQuery(txs, { direction: 'in', range: null })).toHaveLength(3);
    expect(applyQuery(txs, { direction: 'out', range: null })).toHaveLength(1);
    expect(applyQuery(txs, { direction: 'all', range: aban })).toHaveLength(3);
    expect(applyQuery(txs, { direction: 'in', range: aban })).toHaveLength(2);
    expect(applyQuery(txs, { direction: 'out', range: aban })).toHaveLength(1);
  });
  it('summarizes', () => {
    expect(summarize(txs)).toEqual({
      count: 4,
      totalIn: 4000000,
      totalOut: 3350771,
      net: 649229,
      unknown: 0,
      oldest: '1405/07/28',
      newest: '1405/08/21',
    });
  });
  it('sorts either way, keeping same-day sequence', () => {
    expect(sortByDate(txs, 'newest')).toBe(txs);
    expect(sortByDate(txs, 'oldest').map((t) => t.dateJalali)).toEqual([...txs].reverse().map((t) => t.dateJalali));
  });
});

describe('paging helpers', () => {
  it('stops only when order is descending and the range start is passed', () => {
    expect(passedRangeStart(raws, 14050801)).toBe(true);
    expect(passedRangeStart(raws, 14050701)).toBe(false);
    expect(passedRangeStart([...raws].reverse(), 14050901)).toBe(false); // ascending: never stop early
    expect(passedRangeStart([], 14050801)).toBe(false);
  });
  it('builds a dedupe key only when a balance exists', () => {
    expect(rawKey(raws[0])).toBe(rawKey({ ...raws[0] }));
    expect(rawKey(raws[0])).not.toBe(rawKey(raws[1]));
    expect(rawKey(raw('2026-11-12', 1))).toBeNull();
  });
});

describe('schema', () => {
  it('fails loudly when the site changes shape', () => {
    expect(pageSchema.safeParse({ data: { rows: [] } }).success).toBe(false);
    expect(pageSchema.safeParse({ data: { items: [{ amount: 1 }] } }).success).toBe(false);
  });
});
