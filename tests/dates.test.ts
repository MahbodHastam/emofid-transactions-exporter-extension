import { describe, expect, it } from 'vitest';
import {
  formatJalali,
  gregorianToJalali,
  isValidJalali,
  preset,
  todayJalali,
  validateRange,
} from '../src/dates/jalali';
import { tehranCivil } from '../src/dates/tehran';
import { normalizeDigits, parseRial } from '../src/domain/digits';

const j = (jy: number, jm: number, jd: number) => ({ jy, jm, jd });

describe('jalali', () => {
  it('converts across year boundaries', () => {
    const cases: [ReturnType<typeof j>, string][] = [
      [j(1403, 12, 30), '2025-03-20'], // last day of a leap year
      [j(1404, 1, 1), '2025-03-21'],
      [j(1404, 12, 29), '2026-03-20'], // last day of a non-leap year
      [j(1405, 1, 1), '2026-03-21'],
      [j(1405, 8, 21), '2026-11-12'],
    ];
    for (const [jal, iso] of cases) {
      const [y, m, d] = iso.split('-').map(Number);
      expect(gregorianToJalali(y, m, d)).toEqual(jal);
    }
  });

  it('validates month lengths and leap years', () => {
    expect(isValidJalali(j(1403, 12, 30))).toBe(true);
    expect(isValidJalali(j(1404, 12, 30))).toBe(false);
    expect(isValidJalali(j(1404, 12, 31))).toBe(false);
    expect(isValidJalali(j(1405, 6, 31))).toBe(true);
    expect(isValidJalali(j(1405, 7, 31))).toBe(false);
    expect(isValidJalali(j(1405, 13, 1))).toBe(false);
    expect(isValidJalali(j(1405, 1.5, 1))).toBe(false);
  });

  it('rejects bad ranges', () => {
    expect(validateRange({ from: j(1405, 7, 1), to: j(1405, 7, 30) })).toBeNull();
    expect(validateRange({ from: j(1405, 7, 1), to: j(1405, 7, 1) })).toBeNull();
    expect(validateRange({ from: j(1405, 8, 1), to: j(1405, 7, 30) })).toBe('from-after-to');
    expect(validateRange({ from: j(1404, 12, 31), to: j(1405, 1, 1) })).toBe('invalid-from');
    expect(validateRange({ from: j(1405, 1, 1), to: j(1405, 7, 31) })).toBe('invalid-to');
  });


  it('builds presets', () => {
    const today = j(1405, 8, 21);
    expect(preset('thisMonth', today)).toEqual({ from: j(1405, 8, 1), to: j(1405, 8, 30) });
    expect(preset('lastMonth', today)).toEqual({ from: j(1405, 7, 1), to: j(1405, 7, 30) });
    expect(preset('lastMonth', j(1405, 1, 5))).toEqual({ from: j(1404, 12, 1), to: j(1404, 12, 29) });
    expect(preset('thisYear', j(1403, 2, 2))).toEqual({ from: j(1403, 1, 1), to: j(1403, 12, 30) });
    expect(preset('last30Days', today)).toEqual({ from: j(1405, 7, 22), to: today });
  });

  it('knows today in Tehran, not in UTC', () => {
    // 21:00 UTC is already the next day in Tehran.
    expect(formatJalali(todayJalali(new Date('2026-11-11T21:00:00Z')))).toBe('1405/08/21');
  });
});

describe('tehran offsets', () => {
  it('uses +04:30 during DST before the 2022 abolition', () => {
    expect(tehranCivil(new Date('2021-06-01T19:45:00Z'))).toEqual({ gy: 2021, gm: 6, gd: 2, time: '00:15:00' });
  });
  it('uses +03:30 after it', () => {
    expect(tehranCivil(new Date('2023-06-01T19:45:00Z'))).toEqual({ gy: 2023, gm: 6, gd: 1, time: '23:15:00' });
  });
});

describe('parseRial', () => {
  it('handles localized amounts', () => {
    expect(parseRial(2500000)).toBe(2500000);
    expect(parseRial('۲٬۵۰۰٬۰۰۰')).toBe(2500000);
    expect(parseRial('3,350,771')).toBe(3350771);
    expect(parseRial('-500')).toBe(-500);
    expect(parseRial('abc')).toBeNull();
    expect(parseRial(null)).toBeNull();
  });
});
