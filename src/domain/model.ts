import type { JalaliDate, JalaliRange } from '../dates/jalali';

export type Direction = 'in' | 'out' | 'unknown';

export interface Trade {
  side: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price: number;
  fee: number | null;
}

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
  trade: Trade | null;
}

export interface ExportQuery {
  direction: 'all' | 'in' | 'out';
  range: JalaliRange | null;
  format: 'csv' | 'pdf';
}

export interface SymbolSummary {
  symbol: string;
  buyQuantity: number;
  buyValue: number;
  sellQuantity: number;
  sellValue: number;
  fees: number;
  realized: number | null;
}

export interface Accounting {
  openingBalance: number | null;
  closingBalance: number | null;
  deposits: number;
  withdrawals: number;
  buys: number;
  sells: number;
  fees: number;
  trades: number;
  realized: number;
  symbols: SymbolSummary[];
}

export interface Summary {
  totalIn: number;
  totalOut: number;
  net: number;
  unknown: number;
}
