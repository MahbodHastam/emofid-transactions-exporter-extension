// Never hard-code +03:30: Tehran was on +04:30 during DST before 2022.
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tehran',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface CivilDateTime {
  gy: number;
  gm: number;
  gd: number;
  time: string;
}

export function tehranCivil(instant: Date): CivilDateTime {
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(instant)) p[part.type] = part.value;
  return {
    gy: Number(p.year),
    gm: Number(p.month),
    gd: Number(p.day),
    time: `${p.hour}:${p.minute}:${p.second}`,
  };
}
