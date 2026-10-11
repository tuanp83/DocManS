"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Các thành phần biểu đồ SVG/HTML nhỏ cho dashboard (không phụ thuộc thư viện vẽ):
 * nét mảnh, đầu cột bo 4px, khe 2px màu nền giữa các phần chồng, chú giải luôn có khi ≥ 2 chuỗi,
 * tooltip khi rê chuột / focus bàn phím, và mỗi biểu đồ có bảng số liệu tương đương (ChartCard).
 */

/** `ink`: chữ đặt trong vùng màu này dùng màu mực tối (màu nền sáng), ngược lại dùng chữ trắng. */
export type Series = { key: string; label: string; color: string; ink?: boolean };

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Mốc trục gọn: 0 → giá trị "tròn" ≥ max, khoảng 4 khoảng; `integer` cho trục đếm (không có mốc 2,5). */
export function niceScale(max: number, ticks = 4, integer = false) {
  if (!(max > 0)) return { max: ticks, step: 1 };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const factors = integer && magnitude < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = factors.map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  const rounded = Math.max(1, integer ? Math.round(step) : step);
  return { max: Math.ceil(max / rounded) * rounded, step: rounded };
}

export function compactNumber(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tr`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} N`;
  return value.toLocaleString("vi-VN");
}

export function Legend({ series, kind = "box" }: { series: Series[]; kind?: "box" | "line" }) {
  return (
    <ul className="viz-legend" aria-label="Chú giải">
      {series.map((item) => (
        <li key={item.key}>
          <span className={`viz-swatch${kind === "line" ? " line" : ""}`} style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export type TooltipState = { x: number; y: number; title: string; rows: Array<{ color: string; value: string; label: string }> } | null;

export function Tooltip({ state, width }: { state: TooltipState; width: number }) {
  if (!state) return null;
  // Bề rộng tối đa của tooltip là 260px (CSS): giữ trọn trong khung biểu đồ.
  const left = Math.max(0, Math.min(state.x + 12, width - 260));
  return (
    <div className="viz-tooltip" style={{ left, top: Math.max(0, state.y - 10) }} aria-hidden="true">
      <div className="viz-tooltip-title">{state.title}</div>
      {state.rows.map((row) => (
        <div className="viz-tooltip-row" key={row.label}>
          <span className="viz-swatch line" style={{ background: row.color }} aria-hidden="true" />
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Đọc cho trình đọc màn hình nội dung tooltip khi người dùng duyệt điểm bằng bàn phím. */
function tooltipText(state: TooltipState) {
  return state ? `${state.title}: ${state.rows.map((row) => `${row.label} ${row.value}`).join(", ")}` : "";
}

/** Khung một biểu đồ: tiêu đề, nút Biểu đồ/Bảng, giữ khung cũ mờ đi khi đang tải lại. */
export function ChartCard({ title, subtitle, table, refreshing, wide, children }: { title: string; subtitle?: string; table: ReactNode; refreshing?: boolean; wide?: boolean; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={`chart-card${wide ? " wide" : ""}`}>
      <div className="chart-card-header">
        <div>
          <h3 className="chart-card-title">{title}</h3>
          {subtitle ? <p className="chart-card-subtitle">{subtitle}</p> : null}
        </div>
        <div className="view-toggle" role="group" aria-label={`Cách xem: ${title}`}>
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Biểu đồ</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Bảng</button>
        </div>
      </div>
      <div className={`chart-card-body viz-root${refreshing ? " refreshing" : ""}`} aria-busy={refreshing ? true : undefined}>
        {view === "chart" ? children : <div className="table-wrap">{table}</div>}
      </div>
    </section>
  );
}

// ---- Thanh ngang (một hoặc vài chuỗi cùng đơn vị) -------------------------------------------------------

/** `clickable: false`: hàng không lọc được (ví dụ "Chưa phân cấp") — hiện như hàng thường, không phải nút. */
export type HBarRow = { key: string; label: string; values: Record<string, number>; clickable?: boolean };

export function HBarChart({ rows, series, format = compactNumber, onSelect, selectLabel }: { rows: HBarRow[]; series: Series[]; format?: (value: number) => string; onSelect?: (key: string) => void; selectLabel?: (row: HBarRow) => string }) {
  const max = Math.max(0, ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)));
  if (!rows.length) return <p className="chart-card-subtitle">Chưa có số liệu.</p>;
  return (
    <>
      {series.length > 1 ? <Legend series={series} /> : null}
      <ul className="hbar-list">
        {rows.map((row) => {
          const body = (
            <>
              <span className="hbar-label" title={row.label}>{row.label}</span>
              <span className="hbar-track">
                {series.map((item) => {
                  const value = row.values[item.key] ?? 0;
                  return (
                    <span className="hbar-line" key={item.key}>
                      <span className="hbar-bar" style={{ width: max && value ? `calc((100% - 70px) * ${value / max})` : 0, minWidth: value > 0 ? 2 : 0, background: item.color }} aria-hidden="true" />
                      <span className="hbar-value">{format(value)}</span>
                    </span>
                  );
                })}
              </span>
            </>
          );
          const label = `${row.label}: ${series.map((item) => `${item.label} ${format(row.values[item.key] ?? 0)}`).join(", ")}`;
          return (
            <li key={row.key}>
              {onSelect && row.clickable !== false ? (
                <button type="button" className="hbar-row" onClick={() => onSelect(row.key)} aria-label={selectLabel ? selectLabel(row) : `${label}. Xem danh sách`}>{body}</button>
              ) : (
                <div className="hbar-row" aria-label={label}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---- Thanh ngang chồng (thành phần của một tổng) --------------------------------------------------------

export function StackedHBarChart({ rows, series, onSelect }: { rows: HBarRow[]; series: Series[]; onSelect?: (rowKey: string, seriesKey: string) => void }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const max = Math.max(0, ...rows.map((row) => series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0)));
  return (
    <div ref={ref}>
      <Legend series={series} />
      <ul className="hbar-list">
        {rows.map((row) => {
          const total = series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0);
          // Bề rộng vùng vẽ ≈ 68% hàng trừ chỗ cho số tổng; dùng để quyết định nhãn có vừa trong đoạn không.
          const track = Math.max(0, width * 0.68 - 40);
          return (
            <li key={row.key} className="hbar-row stack-row">
              <span className="hbar-label" title={row.label}>{row.label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <span className="hbar-track" style={{ width: max ? `calc((100% - 40px) * ${total / max})` : 0 }}>
                  {series.map((item) => {
                    const value = row.values[item.key] ?? 0;
                    if (!value) return null;
                    const px = max ? (track * value) / max : 0;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`stack-seg${item.ink ? " ink" : ""}`}
                        style={{ flex: `${value} 1 0`, background: item.color }}
                        onClick={onSelect ? () => onSelect(row.key, item.key) : undefined}
                        disabled={!onSelect}
                        title={`${row.label} · ${item.label}: ${value}`}
                        aria-label={`${row.label}, ${item.label}: ${value}. Xem danh sách`}
                      >
                        {px >= 22 ? value : ""}
                      </button>
                    );
                  })}
                </span>
                <span className="hbar-value">{total}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Cột chồng theo thời gian ---------------------------------------------------------------------------

export type ColumnPoint = { key: string; label: string; note?: string; values: Record<string, number> };

export function StackedColumnChart({ points, series, height = 220, ariaLabel }: { points: ColumnPoint[]; series: Series[]; height?: number; ariaLabel: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TooltipState>(null);
  const margin = { top: 8, right: 8, bottom: 26, left: 36 };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;
  const totals = points.map((point) => series.reduce((sum, item) => sum + (point.values[item.key] ?? 0), 0));
  const scale = niceScale(Math.max(0, ...totals), 4, true);
  const [active, setActive] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const band = points.length ? innerWidth / points.length : 0;
  const barWidth = Math.max(4, Math.min(24, band * 0.6));
  const y = (value: number) => innerHeight - (value / scale.max) * innerHeight;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 70))));
  const show = (index: number) => {
    const point = points[index];
    setActive(index);
    setTip({ x: margin.left + band * index + band / 2, y: margin.top, title: `${point.label}${point.note ? ` · ${point.note}` : ""}`, rows: [...series].reverse().map((item) => ({ color: item.color, value: String(point.values[item.key] ?? 0), label: item.label })) });
  };
  const hide = () => { setTip(null); setActive(null); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Legend series={series} />
      {width > 0 ? (
        // Một điểm dừng Tab cho cả biểu đồ; phím ←/→ chuyển cột (thay vì mỗi cột một điểm dừng).
        <div
          tabIndex={0}
          role="group"
          aria-label={`${ariaLabel}. Dùng phím mũi tên trái/phải để xem từng cột; bấm nút Bảng để xem toàn bộ số liệu.`}
          onFocus={() => { setKeyboard(true); if (points.length) show(active ?? points.length - 1); }}
          onBlur={() => { setKeyboard(false); hide(); }}
          onKeyDown={(event) => {
            if (!points.length) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); show(Math.max(0, (active ?? points.length - 1) - 1)); }
            if (event.key === "ArrowRight") { event.preventDefault(); show(Math.min(points.length - 1, (active ?? 0) + 1)); }
          }}
        >
        <svg className="viz-svg" width={width} height={height} aria-hidden="true" onMouseLeave={hide}>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step).map((tick) => (
              <g key={tick}>
                <line x1={0} x2={innerWidth} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
                <text x={-6} y={y(tick)} dy="0.32em" textAnchor="end">{compactNumber(tick)}</text>
              </g>
            ))}
            {points.map((point, index) => {
              let base = 0;
              const x = band * index + (band - barWidth) / 2;
              const visible = series.filter((item) => (point.values[item.key] ?? 0) > 0);
              const top = visible[visible.length - 1]?.key;
              return (
                <g key={point.key}>
                  <rect className="viz-hit" x={band * index} y={0} width={band} height={innerHeight} onMouseMove={() => show(index)} />
                  {active === index ? <rect x={band * index} y={0} width={band} height={innerHeight} fill="var(--viz-ink)" opacity={0.04} pointerEvents="none" /> : null}
                  {series.map((item) => {
                    const value = point.values[item.key] ?? 0;
                    if (!value) return null;
                    const y0 = y(base);
                    base += value;
                    const y1 = y(base);
                    // Khe 2px màu nền giữa các đoạn chồng; đoạn trên cùng bo 4px. Đoạn quá thấp bỏ khe để không đè đoạn dưới.
                    const gap = item.key === top || y0 - y1 <= 3 ? 0 : 2;
                    const h = Math.max(0.5, y0 - y1 - gap);
                    const yTop = y1 + gap;
                    const r = item.key === top ? Math.min(4, h, barWidth / 2) : 0;
                    const d = `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barWidth - r} Q${x + barWidth},${yTop} ${x + barWidth},${yTop + r} V${yTop + h} Z`;
                    return <path key={item.key} d={d} fill={item.color} pointerEvents="none" />;
                  })}
                  {index % labelEvery === 0 || index === points.length - 1 ? (
                    <text x={band * index + band / 2} y={innerHeight + 16} textAnchor="middle">{point.label}</text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
        </div>
      ) : <div style={{ height }} />}
      <Tooltip state={tip} width={width} />
      <span className="sr-only" aria-live="polite">{keyboard ? tooltipText(tip) : ""}</span>
    </div>
  );
}

// ---- Đường (một trục, cùng đơn vị) ----------------------------------------------------------------------

export function LineChart({ points, series, height = 220, yMax, format = (value: number) => String(value), ariaLabel }: { points: Array<{ key: string; label: string; note?: string; values: Record<string, number | null> }>; series: Series[]; height?: number; yMax?: number; format?: (value: number) => string; ariaLabel: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const margin = { top: 10, right: 16, bottom: 26, left: 36 };
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;
  const dataMax = Math.max(0, ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0)));
  const scale = niceScale(yMax ?? dataMax);
  const x = (index: number) => (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => innerHeight - (value / scale.max) * innerHeight;
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerWidth / 70))));
  const tip: TooltipState = hover === null ? null : {
    x: margin.left + x(hover), y: margin.top,
    title: `${points[hover].label}${points[hover].note ? ` · ${points[hover].note}` : ""}`,
    rows: series.map((item) => ({ color: item.color, value: points[hover].values[item.key] === null || points[hover].values[item.key] === undefined ? "—" : format(points[hover].values[item.key] as number), label: item.label }))
  };
  const nearest = (clientX: number, element: SVGRectElement) => {
    const box = element.getBoundingClientRect();
    // Vùng bắt chuột lùi trái 8px so với trục.
    const position = clientX - box.left - 8;
    return points.length <= 1 ? 0 : Math.max(0, Math.min(points.length - 1, Math.round((position / innerWidth) * (points.length - 1))));
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Legend series={series} kind="line" />
      {width > 0 ? (
        <div
          tabIndex={0}
          role="group"
          aria-label={`${ariaLabel}. Dùng phím mũi tên trái/phải để xem từng điểm; bấm nút Bảng để xem toàn bộ số liệu.`}
          onFocus={() => { setKeyboard(true); setHover(points.length ? points.length - 1 : null); }}
          onBlur={() => { setKeyboard(false); setHover(null); }}
          onKeyDown={(event) => {
            if (!points.length) return;
            if (event.key === "ArrowLeft") { event.preventDefault(); setHover((current) => Math.max(0, (current ?? points.length - 1) - 1)); }
            if (event.key === "ArrowRight") { event.preventDefault(); setHover((current) => Math.min(points.length - 1, (current ?? 0) + 1)); }
          }}
        >
        <svg className="viz-svg" width={width} height={height} aria-hidden="true">
          <g transform={`translate(${margin.left},${margin.top})`}>
            {Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step).map((tick) => (
              <g key={tick}>
                <line x1={0} x2={innerWidth} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
                <text x={-6} y={y(tick)} dy="0.32em" textAnchor="end">{format(tick)}</text>
              </g>
            ))}
            {points.map((point, index) => (index % labelEvery === 0 || index === points.length - 1 ? <text key={point.key} x={x(index)} y={innerHeight + 16} textAnchor="middle">{point.label}</text> : null))}
            {series.map((item) => {
              // Ngắt đường ở điểm thiếu số liệu thay vì nối qua.
              let d = "";
              let open = false;
              points.forEach((point, index) => {
                const value = point.values[item.key];
                if (value === null || value === undefined) { open = false; return; }
                d += `${open ? "L" : "M"}${x(index)},${y(value)} `;
                open = true;
              });
              let lastIndex = -1;
              points.forEach((point, index) => { if (point.values[item.key] !== null && point.values[item.key] !== undefined) lastIndex = index; });
              return (
                <g key={item.key}>
                  <path d={d} fill="none" stroke={item.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {lastIndex >= 0 ? <circle cx={x(lastIndex)} cy={y(points[lastIndex].values[item.key] as number)} r={4} fill={item.color} stroke="var(--viz-surface)" strokeWidth={2} /> : null}
                </g>
              );
            })}
            {hover !== null ? (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={0} y2={innerHeight} stroke="var(--viz-axis)" strokeWidth={1} />
                {series.map((item) => {
                  const value = points[hover].values[item.key];
                  return value === null || value === undefined ? null : <circle key={item.key} cx={x(hover)} cy={y(value)} r={4} fill={item.color} stroke="var(--viz-surface)" strokeWidth={2} />;
                })}
              </>
            ) : null}
            <rect
              className="viz-hit"
              x={-8}
              y={0}
              width={innerWidth + 16}
              height={innerHeight}
              onMouseMove={(event) => setHover(nearest(event.clientX, event.currentTarget))}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        </svg>
        </div>
      ) : <div style={{ height }} />}
      <Tooltip state={tip} width={width} />
      <span className="sr-only" aria-live="polite">{keyboard ? tooltipText(tip) : ""}</span>
    </div>
  );
}
