import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { tehranCivil } from './tehran';

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface JalaliRange {
  from: JalaliDate;
  to: JalaliDate;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (d: JalaliDate) => d.jy * 10000 + d.jm * 100 + d.jd;

export const formatJalali = (d: JalaliDate, sep = '/') => `${d.jy}${sep}${pad(d.jm)}${sep}${pad(d.jd)}`;

export const isValidJalali = (d: JalaliDate) =>
  [d.jy, d.jm, d.jd].every(Number.isInteger) && isValidJalaaliDate(d.jy, d.jm, d.jd);

export const monthLength = (jy: number, jm: number) => jalaaliMonthLength(jy, jm);

export const gregorianToJalali = (gy: number, gm: number, gd: number): JalaliDate => toJalaali(gy, gm, gd);

export type RangeIssue = 'invalid-from' | 'invalid-to' | 'from-after-to';

export function validateRange(r: JalaliRange): RangeIssue | null {
  if (!isValidJalali(r.from)) return 'invalid-from';
  if (!isValidJalali(r.to)) return 'invalid-to';
  if (dayKey(r.from) > dayKey(r.to)) return 'from-after-to';
  return null;
}

export function todayJalali(now = new Date()): JalaliDate {
  const c = tehranCivil(now);
  return toJalaali(c.gy, c.gm, c.gd);
}

function addDays(d: JalaliDate, days: number): JalaliDate {
  const g = toGregorian(d.jy, d.jm, d.jd);
  const t = new Date(Date.UTC(g.gy, g.gm - 1, g.gd + days));
  return toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export type PresetId = 'thisMonth' | 'lastMonth' | 'thisYear' | 'last30Days';

export function preset(id: PresetId, today: JalaliDate): JalaliRange {
  const { jy, jm } = today;
  switch (id) {
    case 'thisMonth':
      return { from: { jy, jm, jd: 1 }, to: { jy, jm, jd: monthLength(jy, jm) } };
    case 'lastMonth': {
      const y = jm === 1 ? jy - 1 : jy;
      const m = jm === 1 ? 12 : jm - 1;
      return { from: { jy: y, jm: m, jd: 1 }, to: { jy: y, jm: m, jd: monthLength(y, m) } };
    }
    case 'thisYear':
      return { from: { jy, jm: 1, jd: 1 }, to: { jy, jm: 12, jd: monthLength(jy, 12) } };
    case 'last30Days':
      return { from: addDays(today, -29), to: today };
  }
}
