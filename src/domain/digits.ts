export function normalizeDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

export function parseRial(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  const s = normalizeDigits(v)
    .replace(/[٬,\s\u200e\u200f]/g, '')
    .replace('٫', '.')
    .replace('−', '-');
  return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s)) : null;
}
