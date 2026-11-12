import { dayKey, formatJalali, gregorianToJalali, isValidJalali, jalaliToGregorianIso, type JalaliDate } from '../dates/jalali';
import { tehranCivil } from '../dates/tehran';
import type { RawTx } from '../data/schema';
import { SchemaError } from '../data/source';
import { normalizeDigits, parseRial } from './digits';
import type { Direction, Transaction } from './model';

const pad = (n: number) => String(n).padStart(2, '0');

interface ParsedDate {
  date: JalaliDate;
  gregorian: string;
  time: string | null;
}

function fromInstant(instant: Date, raw: unknown): ParsedDate {
  if (Number.isNaN(instant.getTime())) throw new SchemaError(`Unrecognized date: ${String(raw)}`);
  const c = tehranCivil(instant);
  return {
    date: gregorianToJalali(c.gy, c.gm, c.gd),
    gregorian: `${c.gy}-${pad(c.gm)}-${pad(c.gd)}`,
    time: c.time,
  };
}

const DATE_RE =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

export function parseVoucherDate(v: string | number): ParsedDate {
  if (typeof v === 'number') return fromInstant(new Date(v < 1e11 ? v * 1000 : v), v);
  const s = normalizeDigits(v).trim();
  if (/^\d{9,}$/.test(s)) return parseVoucherDate(Number(s));

  const m = DATE_RE.exec(s);
  if (!m) throw new SchemaError(`Unrecognized date: ${v}`);
  const [, y, mo, d, hh, mi, ss = '00', tz] = m;
  const time = hh ? `${hh}:${mi}:${ss}` : null;

  if (tz && time) {
    const offset = tz.toUpperCase() === 'Z' ? 'Z' : tz.replace(/^([+-]\d{2}):?(\d{2})$/, '$1:$2');
    return fromInstant(new Date(`${y}-${pad(+mo)}-${pad(+d)}T${time}${offset}`), v);
  }

  if (Number(y) < 1700) {
    const date = { jy: Number(y), jm: Number(mo), jd: Number(d) };
    if (!isValidJalali(date)) throw new SchemaError(`Unrecognized date: ${v}`);
    return { date, gregorian: jalaliToGregorianIso(date), time };
  }
  return {
    date: gregorianToJalali(Number(y), Number(mo), Number(d)),
    gregorian: `${y}-${pad(+mo)}-${pad(+d)}`,
    time,
  };
}

const keyCache = new WeakMap<RawTx, number>();
function rawDayKey(raw: RawTx): number {
  let k = keyCache.get(raw);
  if (k === undefined) keyCache.set(raw, (k = dayKey(parseVoucherDate(raw.voucherDate).date)));
  return k;
}

export function passedRangeStart(items: RawTx[], fromKey: number): boolean {
  if (!items.length || rawDayKey(items[items.length - 1]) >= fromKey) return false;
  for (let i = 1; i < items.length; i++) if (rawDayKey(items[i]) > rawDayKey(items[i - 1])) return false;
  return true;
}

export function rawKey(raw: RawTx): string | null {
  if (raw.remain == null) return null;
  return JSON.stringify([
    raw.voucherDate,
    raw.amount,
    raw.description,
    raw.voucherDetailDescription,
    raw.voucherType,
    raw.remain,
  ]);
}

export function normalizeAll(raws: RawTx[]): Transaction[] {
  const rows = raws.map((raw) => {
    const d = parseVoucherDate(raw.voucherDate);
    const amount = parseRial(raw.amount);
    if (amount === null) throw new SchemaError(`Unrecognized amount: ${String(raw.amount)}`);
    return {
      d,
      rawAmount: amount,
      remain: raw.remain == null ? null : parseRial(raw.remain),
      type: raw.voucherType == null ? '' : String(raw.voucherType),
      raw,
    };
  });

  const n = rows.length;
  const ascending = n > 1 && dayKey(rows[0].d.date) < dayKey(rows[n - 1].d.date);
  const directions: Direction[] = rows.map((r, i) => {
    if (r.rawAmount < 0) return 'out';
    const older = rows[ascending ? i - 1 : i + 1];
    if (r.rawAmount === 0 || r.remain === null || !older || older.remain === null) return 'unknown';
    const delta = r.remain - older.remain;
    return delta === r.rawAmount ? 'in' : delta === -r.rawAmount ? 'out' : 'unknown';
  });

  const byType = new Map<string, Set<Direction>>();
  rows.forEach((r, i) => {
    if (!r.type || directions[i] === 'unknown') return;
    byType.set(r.type, (byType.get(r.type) ?? new Set()).add(directions[i]));
  });

  return rows.map((r, i) => {
    let direction = directions[i];
    const learned = byType.get(r.type);
    if (direction === 'unknown' && learned?.size === 1) direction = [...learned][0];
    const amount = Math.abs(r.rawAmount);
    return {
      date: r.d.date,
      dateJalali: formatJalali(r.d.date),
      title: r.raw.description ?? '',
      description: r.raw.voucherDetailDescription ?? '',
      type: r.type,
      direction,
      amount,
      signedAmount: direction === 'in' ? amount : direction === 'out' ? -amount : null,
      balanceAfter: r.remain,
    };
  });
}
