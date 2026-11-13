import { normalizeDigits } from './digits';
import type { Trade } from './model';

const TRADE_RE = /(خرید|فروش)\s+تعداد\s+([\d,]+)\s+(?:\S+\s+)?.*?\(([^)]+)\)\s+به\s+نرخ\s+([\d,]+(?:\.\d+)?)/;
const TITLE_RE = /^(?:خرید|فروش)\s+\S+\s+(.+)$/;
const MAX_FEE_RATIO = 0.05;

const unify = (s: string) => normalizeDigits(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/٬/g, ',');
const toNumber = (s: string) => Number(s.replace(/,/g, ''));

export function parseTrade(title: string, description: string, amount: number): Trade | null {
  const m = TRADE_RE.exec(unify(description));
  if (!m) return null;
  const side = m[1] === 'خرید' ? 'buy' : 'sell';
  const quantity = toNumber(m[2]);
  const price = toNumber(m[4]);
  if (!(quantity > 0) || !(price > 0)) return null;

  const symbol = TITLE_RE.exec(unify(title).trim())?.[1] ?? unify(m[3]).trim();
  const value = quantity * price;
  const fee = Math.round(side === 'buy' ? amount - value : value - amount);
  return { side, symbol, quantity, price, fee: fee >= 0 && fee <= value * MAX_FEE_RATIO ? fee : null };
}
