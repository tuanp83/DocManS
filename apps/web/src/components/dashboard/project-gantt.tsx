"use client";

import Link from "next/link";
import { formatDay, HEALTH_KEY_LABELS, type ProjectRow } from "@/lib/dashboard-api";

const DAY = 86_400_000;

const toTime = (value: string | null) => {
  if (!value) return null;
  const time = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Mốc trục: đầu tháng, giãn cách để có khoảng ≤ 8 nhãn. */
export function ganttTicks(start: number, end: number) {
  const months = Math.max(1, Math.round((end - start) / (30 * DAY)));
  const every = [1, 2, 3, 6, 12, 24].find((step) => months / step <= 8) ?? 36;
  const first = new Date(start);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  while (cursor.getUTCMonth() % every !== 0) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  const ticks: Array<{ time: number; label: string }> = [];
  for (; cursor.getTime() <= end; cursor.setUTCMonth(cursor.getUTCMonth() + every)) {
    ticks.push({ time: cursor.getTime(), label: every >= 12 ? String(cursor.getUTCFullYear()) : `${cursor.getUTCMonth() + 1}/${cursor.getUTCFullYear()}` });
  }
  return ticks;
}

/**
 * Gantt các đề tài trong danh sách chi tiết: thanh nhạt = thời gian thực hiện (bắt đầu → kết thúc),
 * phần đậm = tiến độ thực tế (% khối lượng), vạch đứng = tiến độ kế hoạch tại hôm nay, đường dọc = hôm nay.
 */
export function ProjectGantt({ rows, now = Date.now() }: { rows: ProjectRow[]; now?: number }) {
  const dated = rows.map((row) => ({ row, start: toTime(row.startDate), end: toTime(row.endDate) }));
  const usable = dated.filter((item): item is { row: ProjectRow; start: number; end: number } => item.start !== null && item.end !== null && item.end >= item.start);
  if (!usable.length) return <p className="chart-card-subtitle">Các đề tài trong danh sách chưa có ngày bắt đầu / kết thúc.</p>;
  const domainStart = Math.min(now, ...usable.map((item) => item.start));
  const domainEnd = Math.max(now, ...usable.map((item) => item.end));
  const span = Math.max(DAY, domainEnd - domainStart);
  const pct = (time: number) => `${((time - domainStart) / span) * 100}%`;
  const ticks = ganttTicks(domainStart, domainEnd);
  return (
    <div className="viz-root" style={{ overflowX: "auto" }}>
      <ul className="viz-legend" aria-label="Chú giải">
        <li><span className="viz-swatch" style={{ background: "var(--seq-1)" }} aria-hidden="true" />Thời gian thực hiện</li>
        <li><span className="viz-swatch" style={{ background: "var(--series-1)" }} aria-hidden="true" />Tiến độ thực tế</li>
        <li><span className="viz-swatch" style={{ width: 2, height: 12, background: "var(--viz-ink)" }} aria-hidden="true" />Tiến độ kế hoạch</li>
        <li><span className="viz-swatch" style={{ width: 1, height: 12, background: "var(--viz-ink)" }} aria-hidden="true" />Hôm nay</li>
      </ul>
      <div className="gantt" role="table" aria-label="Biểu đồ Gantt các đề tài">
        <div className="gantt-row" role="row">
          <span role="columnheader" className="gantt-label"><small>Đề tài</small></span>
          <div className="gantt-axis" role="columnheader" aria-label="Trục thời gian">
            {ticks.map((tick) => <span key={tick.time} style={{ left: pct(tick.time) }}>{tick.label}</span>)}
          </div>
        </div>
        {dated.map(({ row, start, end }) => (
          <div className="gantt-row" role="row" key={row.id}>
            <span className="gantt-label" role="rowheader">
              <Link href={row.link}>{row.code ? `${row.code} · ` : ""}{row.title}</Link>
              <small>{row.unit.name} · {HEALTH_KEY_LABELS[row.health]}{row.daysOverdue ? ` · trễ ${row.daysOverdue} ngày` : ""}</small>
            </span>
            <div className="gantt-track" role="cell" aria-label={`${formatDay(row.startDate)} – ${formatDay(row.endDate)}; thực tế ${row.actualPercent}%, kế hoạch ${row.plannedPercent}%`}>
              {ticks.map((tick) => <span key={tick.time} className="gantt-grid" style={{ left: pct(tick.time) }} aria-hidden="true" />)}
              {start !== null && end !== null && end >= start ? (
                <span className="gantt-plan" style={{ left: pct(start), width: `${((end - start) / span) * 100}%` }} aria-hidden="true">
                  <span className="gantt-actual" style={{ width: `${Math.min(100, Math.max(0, row.actualPercent))}%` }} />
                  {row.health !== "none" ? <span className="gantt-planned-mark" style={{ left: `calc(${Math.min(100, Math.max(0, row.plannedPercent))}% - 1px)` }} /> : null}
                </span>
              ) : (
                <small style={{ color: "var(--text-secondary)" }}>Chưa có thời gian thực hiện</small>
              )}
              <span className="gantt-today" style={{ left: pct(now) }} aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
