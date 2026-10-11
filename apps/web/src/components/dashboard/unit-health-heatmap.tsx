"use client";

import { HEALTH_KEY_LABELS, HEALTH_KEYS, type HealthKey, type UnitHealthBucket } from "@/lib/dashboard-api";

const STEPS = ["var(--seq-0)", "var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];

/** Bậc màu tuần tự (một sắc xanh lam, nhạt → đậm) theo số đề tài; 0 dùng nền gần trắng. Chữ trắng từ bậc 5 (≥ 4.5:1). */
export function heatStep(count: number, max: number) {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(6, 1 + Math.floor((count / max) * 5.999));
}

export function UnitHealthHeatmap({ rows, onSelect }: { rows: UnitHealthBucket[]; onSelect: (unitId: string, health?: HealthKey) => void }) {
  const max = Math.max(0, ...rows.flatMap((row) => HEALTH_KEYS.map((key) => row[key] ?? 0)));
  if (!rows.length) return <p className="chart-card-subtitle">Chưa có đề tài trong phạm vi xem.</p>;
  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table className="heatmap">
          <caption className="sr-only">Số đề tài theo đơn vị và mức sức khoẻ</caption>
          <thead>
            <tr>
              <th scope="col">Đơn vị</th>
              {HEALTH_KEYS.map((key) => <th scope="col" key={key}>{HEALTH_KEY_LABELS[key]}</th>)}
              <th scope="col">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                {HEALTH_KEYS.map((key) => {
                  const count = row[key] ?? 0;
                  const step = heatStep(count, max);
                  return (
                    <td key={key}>
                      <button
                        type="button"
                        className="heat-cell"
                        style={{ background: STEPS[step], color: step >= 5 ? "#ffffff" : "var(--viz-ink)" }}
                        disabled={!count}
                        onClick={() => onSelect(row.key, key)}
                        aria-label={`${row.label}, ${HEALTH_KEY_LABELS[key]}: ${count} đề tài${count ? ". Xem danh sách" : ""}`}
                      >
                        {count}
                      </button>
                    </td>
                  );
                })}
                <td>
                  <button type="button" className="heat-cell" style={{ background: "var(--surface-muted)", color: "var(--viz-ink)" }} onClick={() => onSelect(row.key)} aria-label={`${row.label}: tổng ${row.count} đề tài. Xem danh sách`}>
                    {row.count}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heat-scale" aria-hidden="true">
        <span>Ít</span>
        {STEPS.slice(1).map((color) => <span key={color} className="step" style={{ background: color }} />)}
        <span>Nhiều (tối đa {max})</span>
      </div>
    </>
  );
}
