import { createApp } from 'vue';
import { BRIDGE_SOURCE, PANEL_SOURCE, type BridgeReply, type PanelRequest } from '../src/data/bridge';
import ExportPanel from '../src/ui/ExportPanel.vue';

const TYPES = [
  { title: 'واریز وجه', type: 'Deposit', sign: 1 },
  { title: 'فروش سهام', type: 'Sell', sign: 1 },
  { title: 'خرید سهام', type: 'Buy', sign: -1 },
  { title: 'برداشت وجه', type: 'Withdraw', sign: -1 },
];

function mockHistory(count: number) {
  let remain = 48_250_000;
  const day = new Date(Date.UTC(2026, 10, 12));
  return Array.from({ length: count }, (_, i) => {
    const t = TYPES[(i * 7 + 3) % TYPES.length];
    const amount = (((i * 37) % 19) + 1) * 250_000;
    const row = {
      voucherDate: day.toISOString().slice(0, 19),
      description: t.title,
      voucherDetailDescription: `نمونه ${i + 1}`,
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
