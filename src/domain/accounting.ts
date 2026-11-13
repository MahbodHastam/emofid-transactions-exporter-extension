import { sortByDate } from './filters';
import type { Accounting, SymbolSummary, Transaction } from './model';

export function account(txs: Transaction[]): Accounting {
  const ledger = sortByDate(txs, 'oldest');
  const first = ledger[0];
  const last = ledger[ledger.length - 1];
  const acc: Accounting = {
    openingBalance:
      first && first.balanceAfter !== null && first.signedAmount !== null
        ? first.balanceAfter - first.signedAmount
        : null,
    closingBalance: last?.balanceAfter ?? null,
    deposits: 0,
    withdrawals: 0,
    buys: 0,
    sells: 0,
    fees: 0,
    trades: 0,
    realized: 0,
    symbols: [],
  };

  const bySymbol = new Map<string, SymbolSummary>();
  for (const t of ledger) {
    const { trade } = t;
    if (!trade) {
      if (t.direction === 'in') acc.deposits += t.amount;
      else if (t.direction === 'out') acc.withdrawals += t.amount;
      continue;
    }
    let s = bySymbol.get(trade.symbol);
    if (!s) {
      s = { symbol: trade.symbol, buyQuantity: 0, buyValue: 0, sellQuantity: 0, sellValue: 0, fees: 0, realized: null };
      bySymbol.set(trade.symbol, s);
    }
    acc.trades++;
    acc.fees += trade.fee ?? 0;
    s.fees += trade.fee ?? 0;
    if (trade.side === 'buy') {
      acc.buys += t.amount;
      s.buyQuantity += trade.quantity;
      s.buyValue += t.amount;
    } else {
      acc.sells += t.amount;
      s.sellQuantity += trade.quantity;
      s.sellValue += t.amount;
    }
  }

  for (const s of bySymbol.values()) {
    const matched = Math.min(s.buyQuantity, s.sellQuantity);
    if (matched > 0) {
      s.realized = Math.round(matched * (s.sellValue / s.sellQuantity - s.buyValue / s.buyQuantity));
      acc.realized += s.realized;
    }
  }
  acc.symbols = [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol, 'fa'));
  return acc;
}
