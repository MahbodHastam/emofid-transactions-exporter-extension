import { createApp } from 'vue';
import { BRIDGE_SOURCE, PANEL_SOURCE, type BridgeReply, type PanelRequest } from '../src/data/bridge';
import ExportPanel from '../src/ui/ExportPanel.vue';

const TYPES = [
  { title: 'واریز وجه', type: 'Deposit', sign: 1, trade: '' },
  { title: 'فروش سهم', type: 'Deposit', sign: 1, trade: 'فروش' },
  { title: 'خرید سهم', type: 'Withdrawal', sign: -1, trade: 'خرید' },
  { title: 'برداشت وجه', type: 'Withdrawal', sign: -1, trade: '' },
];
const SYMBOLS = [
  { symbol: 'نمونه', name: 'شرکت نمونه', price: 12_400 },
  { symbol: 'آزمون', name: 'صنایع آزمون', price: 3_850 },
  { symbol: 'الگو', name: 'سرمایه‌گذاری الگو', price: 27_900 },
];

function mockHistory(count: number) {
  let remain = 48_250_000;
  const day = new Date(Date.UTC(2026, 10, 12));
  return Array.from({ length: count }, (_, i) => {
    const t = TYPES[(i * 7 + 3) % TYPES.length];
    const s = SYMBOLS[i % SYMBOLS.length];
    const quantity = (((i * 37) % 19) + 1) * 20;
    const price = s.price + (t.sign > 0 ? 600 : 0) + ((i * 53) % 400);
    const amount = t.trade
      ? Math.round(quantity * price * (t.sign > 0 ? 0.9912 : 1.0037))
      : (((i * 37) % 19) + 1) * 250_000;
    const row = {
      voucherDate: day.toISOString().slice(0, 19),
      description: t.trade ? `${t.title} ${s.symbol}` : t.title,
      voucherDetailDescription: t.trade
        ? `${t.trade} تعداد ${quantity} سهم ${s.name}(${s.symbol}1) به نرخ ${price.toLocaleString('en-US')} به شماره اعلامیه ${100000 + i}_Mo`
        : `نمونه ${i + 1}`,
      amount,
      voucherType: t.type,
      remain,
    };
    remain -= t.sign * amount;
    if (i % 2) day.setUTCDate(day.getUTCDate() - 1);
    return row;
  });
}

const history = mockHistory(137);

window.addEventListener('message', (event) => {
  const msg = event.data as PanelRequest | null;
  if (!msg || msg.source !== PANEL_SOURCE || msg.abort || msg.skip === undefined) return;
  const items = history.slice(msg.skip, msg.skip + (msg.pageSize ?? 20));
  setTimeout(() => {
    const reply: BridgeReply = { source: BRIDGE_SOURCE, id: msg.id, status: 200, body: { data: { items } }, retryAfterMs: null };
    window.postMessage(reply, location.origin);
  }, 150);
});

createApp(ExportPanel).mount('#app');
