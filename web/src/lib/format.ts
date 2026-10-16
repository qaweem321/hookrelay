// Dates are shown in one fixed time zone (UTC) and spelled out, so "Oct 11, 2026" can't be read
// as November 10th.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export function formatDate(value: string | Date): string {
  return dateFormat.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  const date = new Date(value);
  return `${dateFormat.format(date)}, ${timeFormat.format(date)} UTC`;
}

export function formatHour(value: string | Date): string {
  return `${new Date(value).toISOString().slice(11, 13)}:00`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelative(value: string | Date, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  const [amount, unit] =
    abs < 60
      ? [abs, "s"]
      : abs < 3600
        ? [Math.round(abs / 60), "min"]
        : abs < 86400
          ? [Math.round(abs / 3600), "h"]
          : [Math.round(abs / 86400), "d"];
  return seconds >= 0 ? `in ${amount} ${unit}` : `${amount} ${unit} ago`;
}

export function formatPercent(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(value === 1 ? 0 : 1)}%`;
}

// When a queued delivery will be tried next. Overdue means a worker will pick it up any moment.
export function formatNextTry(value: string | Date, now = Date.now()): string {
  return new Date(value).getTime() - now < 1000 ? "due now" : `next ${formatRelative(value, now)}`;
}
