<script setup lang="ts">
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CalendarRange,
  CircleCheck,
  Download,
  List,
  LoaderCircle,
  Scale,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
} from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { browser } from 'wxt/browser';
import { createApiSource } from '../data/apiSource';
import { pageTransport } from '../data/pageTransport';
import { collect } from '../data/paginator';
import type { RawTx } from '../data/schema';
import { AuthError, SchemaError } from '../data/source';
import {
  dayKey,
  formatJalali,
  monthLength,
  preset,
  todayJalali,
  validateRange,
  type JalaliDate,
  type PresetId,
} from '../dates/jalali';
import { account } from '../domain/accounting';
import { applyQuery, sortByDate, summarize } from '../domain/filters';
import type { ExportQuery, Summary } from '../domain/model';
import { normalizeAll, parseVoucherDate, passedRangeStart, rawKey } from '../domain/normalize';
import { toCsv } from '../export/csv';
import { exportFilename } from '../export/filename';
import { fa, JALALI_MONTHS, type MessageKey } from '../i18n';
import ReportView, { type ReportData } from './ReportView.vue';

type Phase = 'idle' | 'running' | 'done' | 'empty' | 'cancelled' | 'error';
interface Result {
  rows: number;
  rangeLabel: string;
  partial: boolean;
  pdf: boolean;
  pnl: Summary;
}

const today = todayJalali();
const open = ref(false);
const direction = ref<ExportQuery['direction']>('all');
const format = ref<ExportQuery['format']>('pdf');
const order = ref<'newest' | 'oldest'>('newest');
const useRange = ref(false);
const range = reactive(preset('thisMonth', today));

const phase = ref<Phase>('idle');
const progress = reactive({ count: 0, oldest: '' });
const result = ref<Result | null>(null);
const errorKey = ref<MessageKey>('errNetwork');
const rangeError = ref<MessageKey | null>(null);
const running = computed(() => phase.value === 'running');

let loaded: RawTx[] | null = null;
let controller: AbortController | null = null;

const t = (k: MessageKey) => fa[k];
const nf = new Intl.NumberFormat('fa-IR');
const num = (n: number) => nf.format(n);
const plain = (n: number) => nf.format(n).replace(/٬/g, '');
const faDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

const scopes = [
  { value: 'all', icon: List },
  { value: 'in', icon: ArrowDownLeft },
  { value: 'out', icon: ArrowUpRight },
] as const;
const formats = ['pdf', 'csv'] as const;
const years = Array.from({ length: today.jy - 1379 }, (_, i) => today.jy - i);
const ends = [
  { key: 'from' as const, date: range.from },
  { key: 'to' as const, date: range.to },
];
const presets: PresetId[] = ['thisMonth', 'lastMonth', 'thisYear', 'last30Days'];

const daysIn = (d: JalaliDate) => monthLength(d.jy, d.jm);
watch(
  () => [range.from.jy, range.from.jm, range.to.jy, range.to.jm],
  () => {
    for (const d of [range.from, range.to]) d.jd = Math.min(d.jd, daysIn(d));
  },
);

function applyPreset(id: PresetId) {
  const r = preset(id, today);
  Object.assign(range.from, r.from);
  Object.assign(range.to, r.to);
  rangeError.value = null;
}

onMounted(async () => {
  const saved = (await browser.storage.local.get('prefs')).prefs as Record<string, string> | undefined;
  if (saved?.direction) direction.value = saved.direction as ExportQuery['direction'];
  if (saved?.format === 'csv' || saved?.format === 'pdf') format.value = saved.format;
});
watch([direction, format], () =>
  browser.storage.local.set({ prefs: { direction: direction.value, format: format.value } }),
);

const inner = ref<HTMLElement>();
const height = ref<number | null>(null);
const animateHeight = ref(false);
let observer: ResizeObserver | undefined;
watch(
  inner,
  (el) => {
    observer?.disconnect();
    animateHeight.value = false;
    height.value = el ? el.offsetHeight : null;
    if (!el) return;
    observer = new ResizeObserver(() => (height.value = el.offsetHeight));
    observer.observe(el);
    requestAnimationFrame(() => requestAnimationFrame(() => (animateHeight.value = true)));
  },
  { flush: 'post' },
);
onBeforeUnmount(() => {
  observer?.disconnect();
  controller?.abort();
});

const shownNet = ref(0);
let frame = 0;
watch(
  () => result.value?.pnl.net,
  (target) => {
    cancelAnimationFrame(frame);
    if (target === undefined) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void (shownNet.value = target);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      shownNet.value = Math.round(target * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  },
);

const query = (): ExportQuery => ({
  direction: direction.value,
  format: format.value,
  range: useRange.value ? { from: { ...range.from }, to: { ...range.to } } : null,
});

async function run() {
  rangeError.value = useRange.value ? validateRange(range) : null;
  if (rangeError.value) return;

  const q = query();
  const fromKey = q.range ? dayKey(q.range.from) : null;
  phase.value = 'running';
  progress.count = 0;
  progress.oldest = '';
  loaded = null;
  controller = new AbortController();

  const res = await collect(createApiSource(pageTransport), {
    signal: controller.signal,
    keyOf: rawKey,
    onProgress(items) {
      progress.count = items.length;
      if (items.length) progress.oldest = formatJalali(parseVoucherDate(items[items.length - 1].voucherDate));
    },
    shouldStop: fromKey === null ? undefined : (items) => passedRangeStart(items, fromKey),
  });

  if (res.status === 'complete') return finish(res.items, q, false);
  loaded = res.items;
  if (res.status === 'cancelled') phase.value = 'cancelled';
  else fail(res.error);
}

function fail(e: unknown) {
  errorKey.value = e instanceof AuthError ? 'errAuth' : e instanceof SchemaError ? 'errSchema' : 'errNetwork';
  phase.value = 'error';
}

async function finish(raws: RawTx[], q: ExportQuery, partial: boolean) {
  try {
    const inRange = applyQuery(normalizeAll(raws), { direction: 'all', range: q.range });
    const txs = sortByDate(applyQuery(inRange, q), order.value);
    loaded = null;
    if (!txs.length) {
      phase.value = 'empty';
      return;
    }
    const pnl = summarize(inRange);
    if (q.format === 'csv') download(new Blob([toCsv(txs)], { type: 'text/csv;charset=utf-8' }), exportFilename(q));
    else await printReport({ txs, query: q, summary: pnl, accounting: account(inRange), partial });
    result.value = {
      rows: txs.length,
      partial,
      pdf: q.format === 'pdf',
      pnl,
      rangeLabel: q.range
        ? `${faDigits(formatJalali(q.range.from))} ${t('to')} ${faDigits(formatJalali(q.range.to))}`
        : t('fullHistory'),
    };
    phase.value = 'done';
  } catch (e) {
    fail(e);
  }
}

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #fff !important; }
body > :not([data-emx-print]) { display: none !important; }
[data-emx-print] { display: block !important; }
`;

const root = ref<HTMLElement>();
const report = shallowRef<ReportData | null>(null);

// The browser's own print dialog does the PDF: it shapes Persian text correctly and keeps it selectable.
async function printReport(data: ReportData) {
  const el = root.value!;
  const rootNode = el.getRootNode();
  let host: Element = rootNode instanceof ShadowRoot ? rootNode.host : el;
  while (host.parentElement && host.parentElement !== document.body) host = host.parentElement;

  const style = document.createElement('style');
  style.textContent = PRINT_CSS;
  const title = document.title;
  report.value = data;
  try {
    await nextTick();
    document.head.append(style);
    host.setAttribute('data-emx-print', '');
    document.title = exportFilename(data.query).replace(/\.pdf$/, '');
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    window.print();
  } finally {
    document.title = title;
    host.removeAttribute('data-emx-print');
    style.remove();
    report.value = null;
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const exportLoaded = () => loaded && finish(loaded, query(), true);
const cancel = () => controller?.abort();
</script>

<template>
  <div ref="root" class="emx" :class="{ printing: report }" dir="rtl" lang="fa">
    <ReportView v-if="report" :data="report" />
    <Transition name="pop" mode="out-in">
      <button v-if="!open" key="fab" class="fab" type="button" @click="open = true">
        <Download :size="16" aria-hidden="true" /> {{ t('open') }}
      </button>

      <section v-else key="panel" class="panel" role="dialog" :aria-label="t('title')">
        <div
          class="sizer"
          :class="{ animate: animateHeight }"
          :style="height === null ? undefined : { height: `${height}px` }"
        >
          <div ref="inner" class="inner">
            <header>
              <div>
                <h2>{{ t('title') }}</h2>
              </div>
              <button type="button" class="icon-btn" :aria-label="t('close')" @click="open = false">
                <X :size="16" aria-hidden="true" />
              </button>
            </header>

            <div class="field">
              <span class="label">{{ t('scope') }}</span>
              <div
                class="seg"
                role="radiogroup"
                :aria-label="t('scope')"
                :style="{ '--n': scopes.length, '--i': scopes.findIndex((s) => s.value === direction) }"
              >
                <label v-for="s in scopes" :key="s.value" :class="{ on: direction === s.value }">
                  <input v-model="direction" type="radio" name="emx-direction" :value="s.value" :disabled="running" />
                  <component :is="s.icon" :size="14" aria-hidden="true" /> {{ t(s.value) }}
                </label>
              </div>
            </div>

            <div class="field">
              <label class="switch-row">
                <span class="label"><CalendarRange :size="14" aria-hidden="true" /> {{ t('useRange') }}</span>
                <input v-model="useRange" type="checkbox" class="switch" role="switch" :disabled="running" />
              </label>
              <div class="rel">
                <Transition name="swap">
                  <fieldset v-if="useRange" class="range" :disabled="running">
                    <div class="presets">
                      <button v-for="p in presets" :key="p" type="button" class="chip" @click="applyPreset(p)">
                        {{ t(p) }}
                      </button>
                    </div>
                    <div v-for="e in ends" :key="e.key" class="date-row">
                      <span class="date-label">{{ t(e.key) }}</span>
                      <select v-model.number="e.date.jd" :aria-label="`${t(e.key)}، ${t('day')}`">
                        <option v-for="d in daysIn(e.date)" :key="d" :value="d">{{ plain(d) }}</option>
                      </select>
                      <select v-model.number="e.date.jm" class="grow" :aria-label="`${t(e.key)}، ${t('month')}`">
                        <option v-for="(m, i) in JALALI_MONTHS" :key="m" :value="i + 1">{{ m }}</option>
                      </select>
                      <select v-model.number="e.date.jy" :aria-label="`${t(e.key)}، ${t('year')}`">
                        <option v-for="y in years" :key="y" :value="y">{{ plain(y) }}</option>
                      </select>
                    </div>
                    <p class="muted">{{ t('tz') }}</p>
                    <div class="rel">
                      <Transition name="swap">
                        <p v-if="rangeError" class="note bad" role="alert">
                          <TriangleAlert :size="14" aria-hidden="true" /> {{ t(rangeError) }}
                        </p>
                      </Transition>
                    </div>
                  </fieldset>
                </Transition>
              </div>
            </div>

            <div class="field row">
              <div
                class="seg"
                role="radiogroup"
                :aria-label="t('format')"
                :style="{ '--n': formats.length, '--i': formats.indexOf(format) }"
              >
                <label v-for="f in formats" :key="f" :class="{ on: format === f }">
                  <input v-model="format" type="radio" name="emx-format" :value="f" :disabled="running" />
                  {{ f.toUpperCase() }}
                </label>
              </div>
              <select v-model="order" :aria-label="t('order')" :disabled="running">
                <option value="newest">{{ t('newest') }}</option>
                <option value="oldest">{{ t('oldest') }}</option>
              </select>
            </div>
            <div class="rel">
              <Transition name="swap">
                <p v-if="format === 'pdf'" class="muted">{{ t('pdfHint') }}</p>
              </Transition>
            </div>

            <div class="rel action">
              <Transition name="swap">
                <button v-if="!running" key="go" type="button" class="primary" @click="run">
                  <Download :size="16" aria-hidden="true" /> {{ t('export') }}
                </button>
                <button v-else key="stop" type="button" class="primary stop" @click="cancel">
                  <Ban :size="16" aria-hidden="true" /> {{ t('cancel') }}
                </button>
              </Transition>
            </div>

            <div class="rel">
              <Transition name="swap">
                <div v-if="phase !== 'idle'" :key="phase" class="status" aria-live="polite">
                  <template v-if="phase === 'running'">
                    <div class="bar"><div /></div>
                    <p class="note">
                      <LoaderCircle :size="14" class="spin" aria-hidden="true" />
                      {{ num(progress.count) }} {{ t('loaded') }}
                    </p>
                    <p v-if="progress.oldest" class="muted">{{ t('oldestSoFar') }}: {{ faDigits(progress.oldest) }}</p>
                  </template>

                  <template v-else-if="phase === 'done' && result">
                    <p class="note good">
                      <CircleCheck :size="16" aria-hidden="true" /> {{ t(result.pdf ? 'donePdf' : 'done') }}
                      <span class="muted push">{{ num(result.rows) }} {{ t('rows') }}</span>
                    </p>
                    <div class="pnl" :class="result.pnl.net > 0 ? 'good' : result.pnl.net < 0 ? 'bad' : ''">
                      <div class="pnl-head">
                        <component
                          :is="result.pnl.net > 0 ? TrendingUp : result.pnl.net < 0 ? TrendingDown : Scale"
                          :size="18"
                          aria-hidden="true"
                        />
                        <span>{{ t(result.pnl.net > 0 ? 'profit' : result.pnl.net < 0 ? 'loss' : 'even') }}</span>
                        <span class="muted push">{{ result.rangeLabel }}</span>
                      </div>
                      <div class="pnl-value">
                        {{ num(Math.abs(shownNet)) }} <small>{{ t('rial') }}</small>
                      </div>
                      <p class="muted">{{ t('pnlHint') }}</p>
                    </div>
                    <div class="stats">
                      <div>
                        <span class="muted"><ArrowDownLeft :size="13" class="good" aria-hidden="true" /> {{ t('totalIn') }}</span>
                        <b>{{ num(result.pnl.totalIn) }}</b>
                      </div>
                      <div>
                        <span class="muted"><ArrowUpRight :size="13" class="bad" aria-hidden="true" /> {{ t('totalOut') }}</span>
                        <b>{{ num(result.pnl.totalOut) }}</b>
                      </div>
                    </div>
                    <p v-if="result.partial" class="note bad">
                      <TriangleAlert :size="14" aria-hidden="true" /> {{ t('partialNote') }}
                    </p>
                    <p v-if="result.pnl.unknown" class="note bad">
                      <TriangleAlert :size="14" aria-hidden="true" /> {{ num(result.pnl.unknown) }} {{ t('unknownWarn') }}
                    </p>
                  </template>

                  <p v-else-if="phase === 'empty'" class="note">{{ t('empty') }}</p>

                  <template v-else>
                    <p class="note" :class="{ bad: phase === 'error' }" role="alert">
                      <component :is="phase === 'error' ? TriangleAlert : Ban" :size="14" aria-hidden="true" />
                      {{ phase === 'error' ? t(errorKey) : t('cancelled') }}
                    </p>
                    <button
                      v-if="progress.count && !(phase === 'error' && errorKey === 'errSchema')"
                      type="button"
                      class="chip"
                      @click="exportLoaded"
                    >
                      {{ t('partialOffer') }} ({{ num(progress.count) }})
                    </button>
                  </template>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style>
.emx {
  --ink: #1b2733;
  --muted: #6b7785;
  --line: #e3e8ee;
  --soft: #f3f5f8;
  --brand: #1f4e79;
  --good: #12805c;
  --bad: #c0362c;
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 2147483000;
  font: 13px/1.7 EmxVazirmatn, Vazirmatn, Tahoma, system-ui, sans-serif;
  color: var(--ink);
}
.emx * {
  box-sizing: border-box;
  font-family: inherit;
}
.emx svg {
  flex: none;
  vertical-align: -0.2em;
}

.emx.printing {
  position: static;
}
.emx.printing > :not(.report) {
  display: none !important;
}

/* Buttons */
.fab,
.primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--brand);
  color: #fff;
  border: 0;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.15s var(--ease),
    box-shadow 0.2s,
    background-color 0.2s;
}
.fab {
  box-shadow: 0 6px 18px rgb(31 78 121 / 0.35);
  transform-origin: bottom left;
}
.fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px rgb(31 78 121 / 0.4);
}
.fab:active,
.primary:active {
  transform: scale(0.97);
}
.primary {
  width: 100%;
}
.primary:hover {
  background: #173d60;
}
.primary.stop {
  background: var(--soft);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line);
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--muted);
  cursor: pointer;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.icon-btn:hover {
  background: var(--soft);
  color: var(--ink);
}
.chip {
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    transform 0.15s var(--ease);
}
.chip:hover {
  background: #e8eef5;
  border-color: #c9d5e2;
}
.chip:active {
  transform: scale(0.95);
}

/* Panel */
.panel {
  width: 348px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 16px 40px rgb(15 30 50 / 0.2);
  transform-origin: bottom left;
}
.sizer {
  overflow: hidden;
}
.sizer.animate {
  transition: height 0.3s var(--ease);
}
.inner {
  padding: 16px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
p {
  margin: 0;
}
.muted {
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
}
.field {
  margin-top: 14px;
}
.field.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field.row .seg {
  flex: 1;
}
.label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-weight: 600;
}
.rel {
  position: relative;
}
.action {
  margin-top: 16px;
}

/* Segmented control with a sliding thumb */
.seg {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--n), 1fr);
  padding: 3px;
  background: var(--soft);
  border-radius: 10px;
}
.seg::before {
  content: '';
  position: absolute;
  inset-block: 3px;
  inset-inline-start: 3px;
  width: calc((100% - 6px) / var(--n));
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 3px rgb(15 30 50 / 0.15);
  transform: translateX(calc(var(--i) * -100%));
  transition: transform 0.25s var(--ease);
}
.seg label {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 4px;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s;
}
.seg label.on {
  color: var(--ink);
  font-weight: 600;
}
.seg input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.seg label:has(input:focus-visible) {
  outline: 2px solid #2f80ed;
  outline-offset: 1px;
}
.seg label:has(input:disabled) {
  cursor: default;
  opacity: 0.6;
}

/* Switch */
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.switch-row .label {
  margin: 0;
}
.switch {
  appearance: none;
  position: relative;
  width: 34px;
  height: 20px;
  margin: 0;
  border-radius: 999px;
  background: #cfd7e0;
  cursor: pointer;
  transition: background-color 0.2s;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  inset-inline-start: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: transform 0.2s var(--ease);
}
.switch:checked {
  background: var(--brand);
}
.switch:checked::after {
  transform: translateX(-14px);
}

/* Range */
.range {
  margin: 0;
  padding: 10px 0 0;
  border: 0;
  min-width: 0;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.date-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.date-label {
  width: 18px;
  color: var(--muted);
}
.grow {
  flex: 1;
}
select {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 6px;
  background: #fff;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
select:hover {
  border-color: #c2cedb;
}
select:disabled,
.chip:disabled,
.switch:disabled {
  opacity: 0.6;
  cursor: default;
}

/* Status */
.status {
  padding-top: 14px;
}
.note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.note svg {
  align-self: flex-start;
  margin-top: 0.3em;
}
.push {
  margin-inline-start: auto;
}
.good {
  color: var(--good);
}
.bad {
  color: var(--bad);
}
.note.good {
  font-weight: 600;
}
.bar {
  height: 4px;
  margin-bottom: 10px;
  background: var(--soft);
  border-radius: 2px;
  overflow: hidden;
}
.bar div {
  width: 40%;
  height: 100%;
  border-radius: 2px;
  background: var(--brand);
  animation: emx-slide 1.1s ease-in-out infinite;
}
.spin {
  animation: emx-spin 0.9s linear infinite;
}
.pnl {
  margin: 8px 0;
  padding: 12px;
  border-radius: 12px;
  background: var(--soft);
  color: var(--ink);
  animation: emx-rise 0.45s var(--ease) both;
}
.pnl.good {
  background: #e9f6f0;
  color: var(--good);
}
.pnl.bad {
  background: #fcedeb;
  color: var(--bad);
}
.pnl-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.pnl-value {
  font-size: 22px;
  font-weight: 800;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.pnl-value small {
  font-size: 12px;
  font-weight: 500;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.stats div {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  animation: emx-rise 0.45s var(--ease) both;
}
.stats div:first-child {
  animation-delay: 0.08s;
}
.stats div:last-child {
  animation-delay: 0.14s;
}
.stats b {
  font-variant-numeric: tabular-nums;
}

/* Transitions */
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.18s,
    transform 0.24s var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.94);
}
.swap-enter-active,
.swap-leave-active {
  transition:
    opacity 0.22s,
    transform 0.28s var(--ease);
}
.swap-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.swap-leave-to {
  opacity: 0;
}
/* The leaving block steps out of the flow, so height follows the entering one. */
.swap-leave-active {
  position: absolute;
  inset-inline: 0;
  top: 0;
}
@keyframes emx-slide {
  from {
    transform: translateX(-110%);
  }
  to {
    transform: translateX(260%);
  }
}
@keyframes emx-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes emx-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
button:focus-visible,
select:focus-visible,
.switch:focus-visible {
  outline: 2px solid #2f80ed;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .emx *,
  .emx *::before,
  .emx *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
