/**
 * RFC 3339 instants at nanosecond precision.
 *
 * Freshness boundaries in PAP v0.1 are compared as instants, so the verifier
 * keeps a BigInt nanosecond value rather than a JavaScript Date. `--now`
 * accepts 1–9 fraction digits, rejects leap seconds and normalises offsets.
 */

export type Instant = bigint;

const RFC3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

const NS_PER_SECOND = 1_000_000_000n;
const NS_PER_DAY = 86_400n * NS_PER_SECOND;

export function parseRfc3339(value: string): Instant | null {
  const match = RFC3339.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetSign = match[9];
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);

  if (month < 1 || month > 12) {
    return null;
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  if (offsetHour > 23 || offsetMinute > 59) {
    return null;
  }

  let offsetSeconds = 0;
  if (offsetSign === "+" || offsetSign === "-") {
    offsetSeconds = (offsetHour * 60 + offsetMinute) * 60;
    if (offsetSign === "-") {
      offsetSeconds = -offsetSeconds;
    }
  }

  const days = daysFromCivil(year, month, day);
  const epochSeconds =
    days * 86_400n +
    BigInt(hour * 3600 + minute * 60 + second - offsetSeconds);
  const nanoseconds = fraction === "" ? 0n : BigInt(fraction.padEnd(9, "0"));
  return epochSeconds * NS_PER_SECOND + nanoseconds;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. */
function daysFromCivil(year: number, month: number, day: number): bigint {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return BigInt(era * 146097 + doe - 719468);
}

function civilFromDays(days: bigint): { year: number; month: number; day: number } {
  const z = Number(days) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

function floorDiv(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value % divisor < 0n ? quotient - 1n : quotient;
}

export function formatRfc3339(instant: Instant): string {
  const seconds = floorDiv(instant, NS_PER_SECOND);
  const fraction = instant - seconds * NS_PER_SECOND;
  const days = floorDiv(seconds, 86_400n);
  const daySeconds = seconds - days * 86_400n;
  const { year, month, day } = civilFromDays(days);
  const hour = Number(daySeconds / 3600n);
  const minute = Number((daySeconds % 3600n) / 60n);
  const second = Number(daySeconds % 60n);
  let out =
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-` +
    `${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:` +
    `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  if (fraction !== 0n) {
    const digits = fraction.toString().padStart(9, "0").replace(/0+$/, "");
    out += `.${digits}`;
  }
  return `${out}Z`;
}

/** The local system clock, read once by the caller, at millisecond precision. */
export function systemClock(): Instant {
  return BigInt(Date.now()) * 1_000_000n;
}

export function isFresh(instant: Instant, issuedAt: Instant, expiresAt: Instant): boolean {
  return instant >= issuedAt && instant <= expiresAt;
}
