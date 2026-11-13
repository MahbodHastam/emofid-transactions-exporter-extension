<script setup lang="ts">
import { computed } from 'vue';
import { formatJalali, gregorianToJalali } from '../dates/jalali';
import { tehranCivil } from '../dates/tehran';
import type { Accounting, ExportQuery, Summary, Transaction } from '../domain/model';

export interface ReportData {
  txs: Transaction[];
  query: ExportQuery;
  summary: Summary;
  accounting: Accounting;
  partial: boolean;
}

const props = defineProps<{ data: ReportData }>();

const nf = new Intl.NumberFormat('fa-IR');
const num = (n: number | null | undefined) => (n == null ? '' : nf.format(n));
const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
const tone = (n: number | null) => (n == null || n === 0 ? '' : n > 0 ? 'good' : 'bad');
const avg = (value: number, quantity: number) => (quantity ? Math.round(value / quantity) : null);

const FILTER = { all: 'همهٔ تراکنش‌ها', in: 'فقط واریز', out: 'فقط برداشت' };

const meta = computed(() => {
  const { query } = props.data;
  const c = tehranCivil(new Date());
  return [
    [
      'بازه',
      query.range
        ? `${faDigits(formatJalali(query.range.from))} تا ${faDigits(formatJalali(query.range.to))}`
        : 'کل تاریخچه',
    ],
    ['ردیف‌های جدول', FILTER[query.direction]],
    ['تاریخ تهیه', `${faDigits(formatJalali(gregorianToJalali(c.gy, c.gm, c.gd)))}، ساعت ${faDigits(c.time.slice(0, 5))}`],
  ];
});

interface Line {
  label: string;
  value: number | null;
  signed?: boolean;
  plain?: boolean;
}

const groups = computed<{ title: string; lines: Line[] }[]>(() => {
  const { summary: s, accounting: a } = props.data;
  const change = a.openingBalance !== null && a.closingBalance !== null ? a.closingBalance - a.openingBalance : null;
  return [
    {
      title: 'موجودی حساب',
      lines: [
        { label: 'ابتدای بازه', value: a.openingBalance },
        { label: 'پایان بازه', value: a.closingBalance },
        { label: 'تغییر موجودی', value: change, signed: true },
      ],
    },
    {
      title: 'گردش حساب',
      lines: [
        { label: 'جمع واریز', value: s.totalIn },
        { label: 'جمع برداشت', value: s.totalOut },
        { label: 'سود یا زیان بازه (واریز منهای برداشت)', value: s.net, signed: true },
      ],
    },
    {
      title: 'واریز و برداشت وجه (بدون معاملات)',
      lines: [
        { label: 'واریز وجه', value: a.deposits },
        { label: 'برداشت وجه', value: a.withdrawals },
        { label: 'خالص واریز وجه', value: a.deposits - a.withdrawals, signed: true },
      ],
    },
    {
      title: 'معاملات',
      lines: [
        { label: 'تعداد معامله', value: a.trades, plain: true },
        { label: 'جمع خرید', value: a.buys },
        { label: 'جمع فروش', value: a.sells },
        { label: 'خالص نقدی معاملات (فروش منهای خرید)', value: a.sells - a.buys, signed: true },
        { label: 'کارمزد و مالیات', value: a.fees },
        { label: 'سود یا زیان محقق‌شدهٔ معاملات', value: a.trades ? a.realized : null, signed: true },
      ],
    },
  ];
});
</script>

<template>
  <article class="report" dir="rtl" lang="fa">
    <header class="r-head">
      <div>
        <h1>گزارش گردش حساب</h1>
        <p class="r-muted">تهیه‌شده با افزونهٔ غیررسمی «خروجی تراکنش‌ها». همهٔ مبلغ‌ها به ریال است.</p>
      </div>
      <dl>
        <div v-for="[k, v] in meta" :key="k">
          <dt>{{ k }}</dt>
          <dd>{{ v }}</dd>
        </div>
      </dl>
    </header>

    <section class="r-groups">
      <div v-for="g in groups" :key="g.title" class="r-group">
        <h2>{{ g.title }}</h2>
        <div v-for="l in g.lines" :key="l.label" class="r-line">
          <span>{{ l.label }}</span>
          <b :class="l.signed ? tone(l.value) : ''" dir="ltr">{{ l.value === null ? 'نامشخص' : num(l.value) }}</b>
        </div>
      </div>
    </section>

    <section v-if="data.accounting.symbols.length">
      <h2>خلاصهٔ هر نماد</h2>
      <table>
        <thead>
          <tr>
            <th>نماد</th>
            <th>تعداد خرید</th>
            <th>مبلغ خرید</th>
            <th>میانگین خرید</th>
            <th>تعداد فروش</th>
            <th>مبلغ فروش</th>
            <th>میانگین فروش</th>
            <th>ماندهٔ تعداد</th>
            <th>کارمزد و مالیات</th>
            <th>سود یا زیان محقق‌شده</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="y in data.accounting.symbols" :key="y.symbol">
            <td class="r-strong">{{ y.symbol }}</td>
            <td class="r-num">{{ num(y.buyQuantity) }}</td>
            <td class="r-num">{{ num(y.buyValue) }}</td>
            <td class="r-num">{{ num(avg(y.buyValue, y.buyQuantity)) }}</td>
            <td class="r-num">{{ num(y.sellQuantity) }}</td>
            <td class="r-num">{{ num(y.sellValue) }}</td>
            <td class="r-num">{{ num(avg(y.sellValue, y.sellQuantity)) }}</td>
            <td class="r-num">{{ num(y.buyQuantity - y.sellQuantity) }}</td>
            <td class="r-num">{{ num(y.fees) }}</td>
            <td class="r-num r-strong" :class="tone(y.realized)">{{ num(y.realized) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <ul class="r-notes">
      <li>مبلغ خرید و فروش هر نماد، مبلغ واقعی کسر یا واریزشده به حساب است و کارمزد و مالیات را در خود دارد.</li>
      <li>
        سود یا زیان محقق‌شده با میانگین قیمت و فقط از معاملات همین بازه حساب شده است. فروش سهمی که پیش از این بازه خریده
        شده در آن نمی‌آید.
      </li>
      <li v-if="data.query.direction !== 'all'">خلاصه‌ها همهٔ تراکنش‌های بازه را در بر دارند، نه فقط ردیف‌های جدول زیر.</li>
      <li v-if="data.summary.unknown" class="bad">
        {{ num(data.summary.unknown) }} ردیف جهت نامشخص دارند و در جمع‌ها حساب نشده‌اند.
      </li>
      <li v-if="data.partial" class="bad">این گزارش ناقص است و همهٔ بازه را پوشش نمی‌دهد.</li>
    </ul>

    <section>
      <h2>تراکنش‌ها ({{ num(data.txs.length) }} ردیف)</h2>
      <table class="r-rows">
        <thead>
          <tr>
            <th>ردیف</th>
            <th>تاریخ</th>
            <th class="r-wide">عنوان و شرح</th>
            <th>تعداد</th>
            <th>نرخ</th>
            <th>واریز</th>
            <th>برداشت</th>
            <th>مانده</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in data.txs" :key="i">
            <td class="r-num r-muted">{{ num(i + 1) }}</td>
            <td class="r-num">{{ faDigits(t.dateJalali) }}</td>
            <td class="r-wide">
              <span class="r-strong">{{ t.title }}</span>
              <span v-if="t.description" class="r-desc">{{ t.description }}</span>
            </td>
            <td class="r-num">{{ num(t.trade?.quantity) }}</td>
            <td class="r-num">{{ num(t.trade?.price) }}</td>
            <td v-if="t.direction === 'unknown'" class="r-num" colspan="2">{{ num(t.amount) }} (جهت نامشخص)</td>
            <template v-else>
              <td class="r-num good">{{ t.direction === 'in' ? num(t.amount) : '' }}</td>
              <td class="r-num bad">{{ t.direction === 'out' ? num(t.amount) : '' }}</td>
            </template>
            <td class="r-num">{{ num(t.balanceAfter) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </article>
</template>

<style>
.report {
  color: #1b2733;
  font-size: 9pt;
  line-height: 1.7;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.report h1 {
  margin: 0;
  font-size: 16pt;
  font-weight: 700;
}
.report h2 {
  margin: 0 0 6px;
  font-size: 10pt;
  font-weight: 700;
  color: #1f4e79;
  break-after: avoid;
}
.report section {
  margin-top: 16px;
}
.report p {
  margin: 0;
}
.r-muted {
  color: #6b7785;
}
.r-strong {
  font-weight: 600;
}
.report .good {
  color: #12805c;
}
.report .bad {
  color: #c0362c;
}
.r-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #1f4e79;
}
.r-head dl {
  margin: 0;
  font-size: 8.5pt;
}
.r-head dl div {
  display: flex;
  gap: 6px;
}
.r-head dt {
  color: #6b7785;
}
.r-head dd {
  margin: 0;
  font-weight: 600;
}
.r-groups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.r-group {
  border: 1px solid #e3e8ee;
  border-radius: 8px;
  padding: 10px 12px;
  break-inside: avoid;
}
.r-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 2px 0;
}
.r-line + .r-line {
  border-top: 1px dashed #e3e8ee;
}
.r-line b {
  font-weight: 600;
  white-space: nowrap;
}
.r-notes {
  margin: 12px 0 0;
  padding: 0 16px 0 0;
  font-size: 8pt;
  color: #6b7785;
}
.report table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
}
.report th {
  background: #f3f5f8;
  font-weight: 600;
  text-align: right;
  white-space: nowrap;
}
.report th,
.report td {
  padding: 4px 6px;
  border-bottom: 1px solid #e3e8ee;
  vertical-align: top;
}
.report thead {
  display: table-header-group;
}
.report tr {
  break-inside: avoid;
}
.r-num {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.r-wide {
  width: 46%;
}
.r-desc {
  display: block;
  font-size: 7pt;
  color: #6b7785;
  overflow-wrap: anywhere;
}
</style>
