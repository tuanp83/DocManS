"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  formatDay,
  formatMoney,
  HEALTH_KEY_LABELS,
  loadDrillDown,
  PRODUCT_FORM_LABELS,
  PRODUCT_STATUS_LABELS,
  type DeliverableRow,
  type DrillDownFilters,
  type DrillDownMetric,
  type DrillDownResult,
  type HealthKey,
  type ProductRow,
  type ProjectRow,
  type ProposalRow
} from "@/lib/dashboard-api";
import { ProjectGantt } from "./project-gantt";

export type DrillRequest = { metric: DrillDownMetric; filters: DrillDownFilters; title: string; description?: string };
export type DashboardLabels = { status: (value: string, subject: "projects" | "proposals") => string; level: (value: string | null) => string; field: (value: string | null) => string };

const PAGE_SIZE = 50;
const HEALTH_TONE: Record<HealthKey, string> = { green: "success", amber: "warning", red: "danger", none: "neutral" };

function HealthBadge({ health }: { health: HealthKey }) {
  return <span className={`status-badge ${HEALTH_TONE[health]}`}>{HEALTH_KEY_LABELS[health]}</span>;
}

function ProjectTable({ rows, labels }: { rows: ProjectRow[]; labels: DashboardLabels }) {
  return (
    <table className="data-table drill-table">
      <thead>
        <tr><th>Đề tài</th><th>Đơn vị · Chủ nhiệm</th><th>Trạng thái</th><th>Sức khoẻ</th><th className="num">Kế hoạch / Thực tế</th><th className="num">SPI</th><th className="num">Trễ (ngày)</th><th className="num">Kết thúc</th><th className="num">Kinh phí</th></tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td><Link href={row.link}>{row.code ? `${row.code} · ` : ""}{row.title}</Link><br /><small>{labels.level(row.level)}</small></td>
            <td>{row.unit.name}<br /><small>{row.piName ?? "—"}</small></td>
            <td>{labels.status(row.status, "projects")}</td>
            <td><HealthBadge health={row.health} /></td>
            <td className="num">{row.health === "none" ? "—" : `${row.plannedPercent}% / ${row.actualPercent}%`}</td>
            <td className="num">{row.spi === null || row.health === "none" ? "—" : row.spi.toFixed(2)}</td>
            <td className="num">{row.daysOverdue || "—"}{row.lateReports ? <><br /><small>{row.lateReports} kỳ BC trễ</small></> : null}</td>
            <td className="num">{formatDay(row.endDate)}{row.overdue ? <><br /><small>quá hạn</small></> : null}</td>
            <td className="num">{row.totalBudget === null ? "—" : formatMoney(row.totalBudget)}{row.totalDisbursed !== null && row.totalBudget !== null ? <><br /><small>đã cấp {formatMoney(row.totalDisbursed)}</small></> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProposalTable({ rows, labels }: { rows: ProposalRow[]; labels: DashboardLabels }) {
  return (
    <table className="data-table drill-table">
      <thead><tr><th>Hồ sơ</th><th>Đơn vị · Chủ nhiệm</th><th>Cấp · Lĩnh vực</th><th>Trạng thái</th><th className="num">Ngày nộp</th><th className="num">Hạn</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td><Link href={row.link}>{row.code ? `${row.code} · ` : ""}{row.title}</Link></td>
            <td>{row.unit.name}<br /><small>{row.ownerName ?? "—"}</small></td>
            <td>{labels.level(row.level)}<br /><small>{labels.field(row.field)}</small></td>
            <td>{labels.status(row.status, "proposals")}</td>
            <td className="num">{formatDay(row.submittedAt)}</td>
            <td className="num">{formatDay(row.endDate)}{row.overdue ? <><br /><small>quá hạn</small></> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductTable({ rows }: { rows: ProductRow[] }) {
  return (
    <table className="data-table drill-table">
      <thead><tr><th>Sản phẩm</th><th>Đề tài</th><th>Đơn vị</th><th>Dạng</th><th>Trạng thái</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.title}</td>
            <td><Link href={row.link}>{row.project.code ? `${row.project.code} · ` : ""}{row.project.title}</Link></td>
            <td>{row.unit.name}</td>
            <td>{PRODUCT_FORM_LABELS[row.productForm] ?? row.productForm}</td>
            <td>{PRODUCT_STATUS_LABELS[row.status] ?? row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeliverableTable({ rows }: { rows: DeliverableRow[] }) {
  return (
    <table className="data-table drill-table">
      <thead><tr><th>Sản phẩm đầu ra</th><th>Loại</th><th>Hồ sơ</th><th>Đơn vị</th><th>Trạng thái</th><th className="num">Công bố</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.title}</td>
            <td>{row.type}</td>
            <td><Link href={row.link}>{row.proposal.code ? `${row.proposal.code} · ` : ""}{row.proposal.title}</Link></td>
            <td>{row.unit.name}</td>
            <td>{row.status}</td>
            <td className="num">{formatDay(row.publishedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Bảng chi tiết sau một con số. Gọi /dashboard/drill-down với đúng bộ lọc của ô được bấm — máy chủ lọc theo
 * quyền xem, nên bảng không bao giờ rộng hơn danh sách người dùng tự mở được. Trang cha gắn `key` theo yêu cầu
 * để mỗi lần bấm là một bảng mới (về trang 1).
 */
export function DrillDownPanel({ request, labels, onClose }: { request: DrillRequest; labels: DashboardLabels; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DrillDownResult<DrillDownMetric> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "gantt">("list");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Giữ onClose mới nhất trong ref: hiệu ứng tiêu điểm chỉ chạy một lần khi mở, không chạy lại mỗi lần trang cha vẽ lại.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadDrillDown(request.metric, request.filters, page, PAGE_SIZE, controller.signal)
      .then((data) => setResult(data))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không tải được danh sách."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, page]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      // Giữ tiêu điểm trong bảng chi tiết (hộp thoại modal).
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (current === first || !panelRef.current.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !panelRef.current.contains(current))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const items = result?.metric === request.metric ? result.items : [];

  return (
    <div className="drill-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="drill-panel" role="dialog" aria-modal="true" aria-labelledby="drill-title">
        <div className="drill-header">
          <div>
            <h2 id="drill-title">{request.title}</h2>
            <p>{request.description ?? "Danh sách chi tiết trong phạm vi bạn được xem."}{result ? ` ${result.total} mục.` : ""}</p>
          </div>
          <div className="button-row">
            {request.metric === "projects" ? (
              <div className="view-toggle" role="group" aria-label="Cách xem danh sách đề tài">
                <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Danh sách</button>
                <button type="button" aria-pressed={view === "gantt"} onClick={() => setView("gantt")}>Gantt</button>
              </div>
            ) : null}
            <button ref={closeRef} type="button" className="button small" onClick={onClose}>Đóng</button>
          </div>
        </div>
        <div className="drill-body" aria-busy={loading}>
          {error ? <div className="callout danger" role="alert"><strong>Không tải được danh sách.</strong><p>{error}</p></div> : null}
          {!error && result && !items.length && !loading ? <p className="chart-card-subtitle">Không có mục nào.</p> : null}
          {items.length ? (
            <div style={{ opacity: loading ? 0.55 : 1 }}>
              {request.metric === "projects" && view === "gantt" ? <ProjectGantt rows={items as ProjectRow[]} /> : null}
              {request.metric === "projects" && view === "list" ? <div className="table-wrap"><ProjectTable rows={items as ProjectRow[]} labels={labels} /></div> : null}
              {request.metric === "proposals" ? <div className="table-wrap"><ProposalTable rows={items as ProposalRow[]} labels={labels} /></div> : null}
              {request.metric === "products" ? <div className="table-wrap"><ProductTable rows={items as ProductRow[]} /></div> : null}
              {request.metric === "deliverables" ? <div className="table-wrap"><DeliverableTable rows={items as DeliverableRow[]} /></div> : null}
            </div>
          ) : null}
          {loading && !items.length && !error ? <p className="chart-card-subtitle">Đang tải…</p> : null}
        </div>
        <div className="drill-footer">
          <span>Trang {page}/{pages}</span>
          <div className="button-row">
            <button type="button" className="button small" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Trang trước</button>
            <button type="button" className="button small" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)}>Trang sau</button>
          </div>
        </div>
      </div>
    </div>
  );
}
