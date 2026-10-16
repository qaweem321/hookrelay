import type { Stats } from "../../../shared/types";
import { formatHour } from "../lib/format";

// Stacked bars: delivered (green) and failed (red) per hour, with received events as a gray
// outline behind them. Plain SVG; no chart library needed for 24 bars.
export function HourlyChart({ hourly }: { hourly: Stats["hourly"] }) {
  const max = Math.max(1, ...hourly.map((h) => Math.max(h.events, h.succeeded + h.failed)));
  const width = 720;
  const height = 160;
  const gap = 4;
  const bar = width / hourly.length - gap;
  const y = (value: number) => (value / max) * (height - 10);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height + 20}`}
        className="h-48 w-full"
        role="img"
        aria-label="Events and deliveries per hour, last 24 hours"
      >
        {hourly.map((h, i) => {
          const x = i * (bar + gap);
          const ok = y(h.succeeded);
          const failed = y(h.failed);
          return (
            <g key={h.hour}>
              <title>{`${formatHour(h.hour)} UTC: ${h.events} received, ${h.succeeded} delivered, ${h.failed} failed`}</title>
              <rect
                x={x}
                y={height - y(h.events)}
                width={bar}
                height={y(h.events)}
                rx={2}
                className="fill-slate-200 dark:fill-slate-800"
              />
              <rect
                x={x + bar * 0.2}
                y={height - ok}
                width={bar * 0.6}
                height={ok}
                className="fill-emerald-500"
              />
              <rect
                x={x + bar * 0.2}
                y={height - ok - failed}
                width={bar * 0.6}
                height={failed}
                className="fill-red-500"
              />
              {i % 4 === 0 && (
                <text
                  x={x + bar / 2}
                  y={height + 15}
                  textAnchor="middle"
                  className="fill-slate-500 text-[11px]"
                >
                  {formatHour(h.hour)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="muted mt-2 flex flex-wrap gap-4 text-xs">
        <Legend className="bg-slate-200 dark:bg-slate-800" label="Received" />
        <Legend className="bg-emerald-500" label="Delivered" />
        <Legend className="bg-red-500" label="Failed for good" />
        <span>Times in UTC</span>
      </figcaption>
    </figure>
  );
}

const Legend = ({ className, label }: { className: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className={`size-2.5 rounded-sm ${className}`} />
    {label}
  </span>
);
