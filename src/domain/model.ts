import type { JalaliDate, JalaliRange } from '../dates/jalali';

export type Direction = 'in' | 'out' | 'unknown';

export interface Transaction {
  date: JalaliDate;
  dateJalali: string;
  title: string;
  description: string;
  type: string;
  direction: Direction;
  amount: number;
  signedAmount: number | null;
  balanceAfter: number | null;
}

export interface ExportQuery {
  direction: 'all' | 'in' | 'out';
  range: JalaliRange | null;
  format: 'csv' | 'xlsx';
}

export interface Summary {
  count: number;
  totalIn: number;
  totalOut: number;
  net: number;
  unknown: number;
  oldest: string | null;
  newest: string | null;
}
