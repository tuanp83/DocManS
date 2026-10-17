"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogItem } from "@/lib/admin-api";
import {
  DASHBOARD_FILTER_KEYS,
  formatMoney,
  HEALTH_KEY_LABELS,
  HEALTH_KEYS,
  loadProductStats,
  loadProjectDistribution,
  loadProposalDistribution,
  loadTrends,
  isFilterableType,
  NO_OFFICER,
  SCOPE_KEYS,
  SCOPE_LABELS,
  trendFrom,
  PRODUCT_FORM_LABELS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  type Bucket,
  type DashboardFilters,
  type DrillDownFilters,
  type OfficerBucket,
  type ProductStats,
  type ProjectDistribution,
  type ProposalDistribution,
  type ScopeKey,
  type Trends
} from "@/lib/dashboard-api";
import { getProposalLevelLabel } from "@/lib/proposal-classification";
import { projectStatusLabel } from "@/lib/projects-api";
import { loadProposalCatalogs } from "@/lib/research-proposals-api";
import { statusMeta } from "@/lib/status";
import { DashboardConferenceSection } from "@/components/conferences/conference-stats";
import { DrillDownPanel, type DashboardLabels, type DrillRequest } from "./drill-down-panel";
import { UnitHealthHeatmap } from "./unit-health-heatmap";
import { ChartCard, HBarChart, LineChart, StackedColumnChart, StackedHBarChart, type HBarRow, type Series } from "./viz";

const HEALTH_SERIES: Series[] = [
  { key: "green", label: HEALTH_KEY_LABELS.green, color: "var(--status-good)" },
  { key: "amber", label: HEALTH_KEY_LABELS.amber, color: "var(--status-warning)", ink: true },
  { key: "red", label: HEALTH_KEY_LABELS.red, color: "var(--status-critical)" },
  { key: "none", label: HEALTH_KEY_LABELS.none, color: "var(--status-none)", ink: true }
];
// Trạng thái sản phẩm: màu phân loại cố định theo thực thể (đã kiểm tra CVD, có khe 2px + nhãn + bảng).
const PRODUCT_SERIES: Series[] = [
  { key: "PLANNED", label: PRODUCT_STATUS_LABELS.PLANNED, color: "var(--series-1)" },
  { key: "SUBMITTED", label: PRODUCT_STATUS_LABELS.SUBMITTED, color: "var(--series-4)", ink: true },
  { key: "UNDER_REVIEW", label: PRODUCT_STATUS_LABELS.UNDER_REVIEW, color: "var(--series-5)", ink: true },
  { key: "PASSED", label: PRODUCT_STATUS_LABELS.PASSED, color: "var(--series-3)", ink: true },
  { key: "FAILED", label: PRODUCT_STATUS_LABELS.FAILED, color: "var(--series-2)", ink: true }
];
const BUDGET_SERIES: Series[] = [
  { key: "totalBudget", label: "Tổng kinh phí", color: "var(--series-1)" },
  { key: "totalDisbursed", label: "Đã cấp", color: "var(--series-2)" }
];
const PROGRESS_SERIES: Series[] = [
  { key: "planned", label: "Kế hoạch (bình quân)", color: "var(--series-1)" },
  { key: "actual", label: "Thực tế (bình quân)", color: "var(--series-2)" }
];
const SINGLE: Series[] = [{ key: "count", label: "Số lượng", color: "var(--series-1)" }];
const OFFICER_SERIES: Series[] = [
  { key: "count", label: "Đề tài", color: "var(--series-1)" },
  { key: "behind", label: "Chậm tiến độ", color: "var(--status-critical)" }
];

const RANGES = [
  { value: "3", label: "3 tháng" },
  { value: "6", label: "6 tháng" },
  { value: "12", label: "12 tháng" },
  { value: "24", label: "24 tháng" }
];

const percent = (value: number) => `${value}%`;
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Đọc bộ lọc từ URL để liên kết dashboard chia sẻ được; chỉ nhận các khoá đã khai báo. */
function readUrlState() {
  if (typeof window === "undefined") return { filters: {} as DashboardFilters, range: "6" };
  const params = new URLSearchParams(window.location.search);
  const filters: DashboardFilters = {};
  for (const key of DASHBOARD_FILTER_KEYS) {
    const value = params.get(key);
    if (value) (filters as Record<string, string>)[key] = value;
  }
  const range = params.get("range");
  return { filters, range: RANGES.some((item) => item.value === range) ? (range as string) : "6" };
}

function writeUrlState(filters: DashboardFilters, range: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  for (const key of DASHBOARD_FILTER_KEYS) if (filters[key]) params.set(key, filters[key] as string);
  if (range !== "6") params.set("range", range);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

type Option = { value: string; label: string };
type Options = { units: Option[]; levels: Bucket[][]; fields: Bucket[][]; years: string[] };

/** Lựa chọn của bộ lọc lấy từ số liệu CHƯA lọc của chính người xem. */
function deriveOptions(allProjects: ProjectDistribution, allProposals: ProposalDistribution): Options {
  const years = new Set<string>([String(new Date().getFullYear()), ...allProposals.byYear.map((bucket) => bucket.key), ...(allProjects.byYear ?? []).map((bucket) => bucket.key)].filter(Boolean));
  return {
    units: mergeOptions([allProjects.byUnit, allProposals.byUnit], (bucket) => bucket.label),
    levels: [allProjects.byLevel, allProposals.byLevel],
    fields: [allProjects.byField, allProposals.byField],
    years: [...years].sort((left, right) => right.localeCompare(left))
  };
}

function mergeOptions(lists: Bucket[][], label: (bucket: Bucket) => string): Option[] {
  const seen = new Map<string, string>();
  for (const list of lists) for (const bucket of list) if (bucket.key && !seen.has(bucket.key)) seen.set(bucket.key, label(bucket));
  return [...seen.entries()].map(([value, text]) => ({ value, label: text })).sort((left, right) => left.label.localeCompare(right.label, "vi"));
}

function BucketTable({ rows, columns }: { rows: Array<Record<string, string | number>>; columns: Array<{ key: string; label: string; numeric?: boolean }> }) {
  return (
    <table className="data-table drill-table">
      <thead><tr>{columns.map((column) => <th key={column.key} className={column.numeric ? "num" : undefined}>{column.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>{columns.map((column) => <td key={column.key} className={column.numeric ? "num" : undefined}>{row[column.key]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

type OfficerRow = { key: string; label: string; projects: number; overdue: number; behind: number; lateReports: number; proposals: number; pending: number };

/** Gộp nhóm chuyên viên của đề tài và hồ sơ; "chưa có người phụ trách" luôn ở cuối. */
function mergeOfficers(projectBuckets: OfficerBucket[], proposalBuckets: OfficerBucket[]): OfficerRow[] {
  const rows = new Map<string, OfficerRow>();
  const row = (bucket: OfficerBucket) => rows.get(bucket.key) ?? { key: bucket.key, label: bucket.label, projects: 0, overdue: 0, behind: 0, lateReports: 0, proposals: 0, pending: 0 };
  for (const bucket of projectBuckets) rows.set(bucket.key, { ...row(bucket), projects: bucket.count, overdue: bucket.overdue ?? 0, behind: bucket.behind ?? 0, lateReports: bucket.lateReports ?? 0 });
  for (const bucket of proposalBuckets) rows.set(bucket.key, { ...row(bucket), proposals: bucket.count, pending: bucket.pending ?? 0 });
  return [...rows.values()].sort((left, right) => Number(left.key === NO_OFFICER) - Number(right.key === NO_OFFICER) || right.projects + right.proposals - (left.projects + left.proposals) || left.label.localeCompare(right.label, "vi"));
}

function OfficerTable({ rows, onOpen }: { rows: OfficerRow[]; onOpen: (officerId: string, metric: "projects" | "proposals", extra: DrillDownFilters, title: string) => void }) {
  const cell = (row: OfficerRow, value: number, metric: "projects" | "proposals", extra: DrillDownFilters, title: string) =>
    value ? <button type="button" className="dash-cell-link" onClick={() => onOpen(row.key, metric, extra, `${title} — ${row.label}`)}>{value.toLocaleString("vi-VN")}</button> : "0";
  return (
    <table className="data-table drill-table">
      <thead>
        <tr>
          <th>Chuyên viên</th><th className="num">Đề tài</th><th className="num">Quá hạn</th><th className="num">Chậm tiến độ</th><th className="num">Báo cáo trễ</th><th className="num">Hồ sơ</th><th className="num">Hồ sơ đang xét</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td className="num">{cell(row, row.projects, "projects", {}, "Đề tài")}</td>
            <td className="num">{cell(row, row.overdue, "projects", { overdue: "true" }, "Đề tài quá hạn")}</td>
            <td className="num">{row.behind.toLocaleString("vi-VN")}</td>
            <td className="num">{row.lateReports.toLocaleString("vi-VN")}</td>
            <td className="num">{cell(row, row.proposals, "proposals", {}, "Hồ sơ")}</td>
            <td className="num">{row.pending.toLocaleString("vi-VN")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tile({ label, value, meta, onClick }: { label: string; value: string; meta?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="dash-tile-label">{label}</span>
      <span className="dash-tile-value">{value}</span>
      {meta ? <span className="dash-tile-meta">{meta}</span> : null}
    </>
  );
  return onClick ? <button type="button" className="dash-tile" onClick={onClick} aria-label={`${label}: ${value}. Xem danh sách`}>{body}</button> : <div className="dash-tile">{body}</div>;
}

/**
 * Dashboard thống kê nâng cao (docs/design/dashboard-thong-ke-dot-2.md): một hàng bộ lọc chung phía trên,
 * mọi biểu đồ và ô số dùng cùng bộ lọc; bấm vào số / cột / ô để mở danh sách chi tiết.
 */
export function DashboardAnalytics() {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [range, setRange] = useState("6");
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectDistribution | null>(null);
  const [proposals, setProposals] = useState<ProposalDistribution | null>(null);
  const [products, setProducts] = useState<ProductStats | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<(DrillRequest & { id: number }) | null>(null);

  // Bộ lọc ban đầu từ URL; danh sách lựa chọn lấy từ số liệu chưa lọc (chỉ gồm những gì người xem đã được thấy).
  useEffect(() => {
    const initial = readUrlState();
    setFilters(initial.filters);
    setRange(initial.range);
    setReady(true);
    void loadProposalCatalogs().then(setCatalogs).catch(() => undefined);
    // Không có bộ lọc trong URL: lần tải chính cũng là số liệu chưa lọc, dùng luôn để dựng lựa chọn.
    if (!Object.keys(initial.filters).length) return;
    const controller = new AbortController();
    Promise.all([loadProjectDistribution({}, controller.signal), loadProposalDistribution({}, controller.signal)])
      .then(([allProjects, allProposals]) => setOptions(deriveOptions(allProjects, allProposals)))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // Giá trị bộ lọc trong URL không có trong lựa chọn (đơn vị không được xem, gõ tay…): bỏ, để ô chọn và số liệu khớp nhau.
  useEffect(() => {
    if (!options) return;
    const allowed: Record<keyof DashboardFilters, string[]> = {
      year: options.years,
      unitId: options.units.map((item) => item.value),
      level: options.levels.flat().map((bucket) => bucket.key),
      field: options.fields.flat().map((bucket) => bucket.key),
      scope: SCOPE_KEYS
    };
    const invalid = (Object.keys(filters) as Array<keyof DashboardFilters>).filter((key) => filters[key] && !allowed[key].includes(filters[key] as string));
    if (invalid.length) setFilters((current) => { const next = { ...current }; for (const key of invalid) delete next[key]; return next; });
  }, [options, filters]);

  useEffect(() => {
    if (!ready) return;
    writeUrlState(filters, range);
    const controller = new AbortController();
    const unfiltered = !Object.keys(filters).length;
    setLoading(true);
    setError(null);
    Promise.all([
      loadProjectDistribution(filters, controller.signal),
      loadProposalDistribution(filters, controller.signal),
      loadProductStats(filters, controller.signal),
      loadTrends(filters, { from: trendFrom(Number(range)) }, controller.signal)
    ])
      .then(([projectData, proposalData, productData, trendData]) => {
        if (unfiltered) setOptions(deriveOptions(projectData, proposalData));
        setProjects(projectData);
        setProposals(proposalData);
        setProducts(productData);
        setTrends(trendData);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Không tải được số liệu thống kê."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, range, ready]);

  const labels = useMemo<DashboardLabels>(() => {
    const catalogName = (type: string, code: string | null) => (code ? catalogs.find((item) => item.type === type && item.code === code)?.name : undefined);
    return {
      status: (value, subject) => (subject === "projects" ? projectStatusLabel(value) : statusMeta[value]?.label ?? projectStatusLabel(value)),
      level: (value) => (value ? catalogName("proposal-type", value) ?? getProposalLevelLabel(value) : "Chưa phân cấp"),
      field: (value) => (value ? catalogName("research-field", value) ?? value : "Chưa phân lĩnh vực")
    };
  }, [catalogs]);

  const levelOptions = useMemo(() => mergeOptions(options?.levels ?? [], (bucket) => labels.level(bucket.key)), [options, labels]);
  const fieldOptions = useMemo(() => mergeOptions(options?.fields ?? [], (bucket) => labels.field(bucket.key)), [options, labels]);
  const unitOptions = options?.units ?? [];
  const yearOptions = options?.years ?? [];
  const unitName = (unitId?: string) => unitOptions.find((item) => item.value === unitId)?.label ?? unitId ?? "";

  const describeFilters = (extra: string[] = []) => {
    const parts = [
      filters.year ? `Năm ${filters.year}` : null,
      filters.unitId ? unitName(filters.unitId) : null,
      filters.level ? labels.level(filters.level) : null,
      filters.field ? labels.field(filters.field) : null,
      filters.scope ? SCOPE_LABELS[filters.scope] : null,
      ...extra
    ].filter(Boolean);
    return parts.length ? `Bộ lọc: ${parts.join(" · ")}.` : "Toàn bộ phạm vi bạn được xem.";
  };

  // Bộ lọc của ô được bấm thay cho bộ lọc chung cùng khoá (ví dụ bấm một đơn vị khi đang xem toàn trường).
  const openDrill = (metric: DrillRequest["metric"], extra: DrillDownFilters, title: string, extraLabels: string[] = []) => {
    setDrill({ id: Date.now(), metric, filters: { ...filters, ...extra }, title, description: describeFilters(extraLabels) });
  };

  const setFilter = (key: keyof DashboardFilters, value: string) => setFilters((current) => {
    const next = { ...current };
    if (value) (next as Record<string, string>)[key] = value; else delete next[key];
    return next;
  });

  // Nhóm "Chưa phân loại" (khoá rỗng) không lọc được ở API: hiện như hàng thường, không phải nút.
  const bucketRows = (buckets: Bucket[], label: (bucket: Bucket) => string, value: (bucket: Bucket) => number = (bucket) => bucket.count): HBarRow[] =>
    buckets.map((bucket) => ({ key: bucket.key, label: label(bucket), values: { count: value(bucket) }, clickable: bucket.key !== "" }));

  const officerRows = mergeOfficers(projects?.byOfficer ?? [], proposals?.byOfficer ?? []);
  const officerLabel = (key: string) => officerRows.find((row) => row.key === key)?.label ?? "chuyên viên";

  const trendPoints = (trends?.series ?? []).map((point) => ({ key: point.date, label: shortDay(point.date), note: point.live ? "hiện tại" : undefined, values: point.health as Record<string, number> }));
  const progressPoints = (trends?.series ?? []).map((point) => ({ key: point.date, label: shortDay(point.date), note: point.live ? "hiện tại" : undefined, values: { planned: point.averagePlannedPercent, actual: point.averageActualPercent } }));
  const refreshing = loading && !!projects;
  const red = projects?.byHealth.find((item) => item.key === "red")?.count ?? 0;
  const amber = projects?.byHealth.find((item) => item.key === "amber")?.count ?? 0;

  return (
    <div>
      <form className="dash-filters" aria-label="Bộ lọc dashboard" onSubmit={(event) => event.preventDefault()}>
        <div className="filter-field">
          <label htmlFor="dash-range">Khoảng thời gian (xu hướng)</label>
          <select id="dash-range" value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGES.map((item) => <option key={item.value} value={item.value}>{item.label} gần nhất</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="dash-year">Năm</label>
          <select id="dash-year" value={filters.year ?? ""} onChange={(event) => setFilter("year", event.target.value)}>
            <option value="">Tất cả</option>
            {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="dash-unit">Đơn vị</label>
          <select id="dash-unit" value={filters.unitId ?? ""} onChange={(event) => setFilter("unitId", event.target.value)}>
            <option value="">Tất cả đơn vị được xem</option>
            {unitOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="dash-level">Cấp</label>
          <select id="dash-level" value={filters.level ?? ""} onChange={(event) => setFilter("level", event.target.value)}>
            <option value="">Tất cả</option>
            {levelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="dash-field">Lĩnh vực</label>
          <select id="dash-field" value={filters.field ?? ""} onChange={(event) => setFilter("field", event.target.value)}>
            <option value="">Tất cả</option>
            {fieldOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="dash-scope">Tính chất</label>
          <select id="dash-scope" value={filters.scope ?? ""} onChange={(event) => setFilter("scope", event.target.value)}>
            <option value="">Tất cả</option>
            {SCOPE_KEYS.map((key) => <option key={key} value={key}>{SCOPE_LABELS[key]}</option>)}
          </select>
        </div>
        {Object.keys(filters).length ? <button type="button" className="button small" onClick={() => setFilters({})}>Xoá bộ lọc</button> : null}
        <p className="dash-filters-note">Năm: đề tài theo năm bắt đầu, hồ sơ theo năm nộp; không áp dụng cho biểu đồ xu hướng.</p>
      </form>

      {error ? <div className="callout danger" role="alert"><strong>Không tải được số liệu thống kê.</strong><p>{error}</p></div> : null}
      {!projects && loading && !error ? <p className="chart-card-subtitle">Đang tải số liệu…</p> : null}

      {projects && proposals && products && trends ? (
        <div style={{ opacity: refreshing ? 0.55 : 1, transition: "opacity 0.15s ease" }} aria-busy={refreshing}>
          <h2 className="dash-section-title">Đề tài đang quản lý</h2>
          <div className="dash-tiles">
            <Tile label="Đề tài" value={projects.totals.count.toLocaleString("vi-VN")} meta="Trong phạm vi bạn được xem" onClick={() => openDrill("projects", {}, "Danh sách đề tài")} />
            <Tile label="Chậm tiến độ" value={red.toLocaleString("vi-VN")} meta={`${amber.toLocaleString("vi-VN")} đề tài cần chú ý`} onClick={() => openDrill("projects", { health: "red" }, "Đề tài chậm tiến độ", [HEALTH_KEY_LABELS.red])} />
            <Tile label="Quá hạn" value={projects.totals.overdue.toLocaleString("vi-VN")} meta="Có mốc hoặc ngày kết thúc đã qua" onClick={() => openDrill("projects", { overdue: "true" }, "Đề tài quá hạn", ["Quá hạn"])} />
            <Tile label="Kinh phí đã cấp" value={formatMoney(projects.totals.totalDisbursed)} meta={`/ ${formatMoney(projects.totals.totalBudget)} · ${projects.totals.financeVisibleCount} đề tài có số liệu`} />
          </div>

          <div className="dash-grid">
            <ChartCard
              wide
              refreshing={refreshing}
              title="Sức khoẻ đề tài theo tuần"
              subtitle="Số đề tài theo mức sức khoẻ ở mỗi lần chụp hằng tuần; cột cuối là số liệu hiện tại."
              table={<BucketTable columns={[{ key: "date", label: "Ngày" }, ...HEALTH_KEYS.map((key) => ({ key, label: HEALTH_KEY_LABELS[key], numeric: true })), { key: "total", label: "Tổng", numeric: true }]} rows={trends.series.map((point) => ({ date: `${shortDay(point.date)}/${point.date.slice(0, 4)}${point.live ? " (hiện tại)" : ""}`, ...point.health, total: point.total }))} />}
            >
              {trendPoints.length ? <StackedColumnChart points={trendPoints} series={HEALTH_SERIES} ariaLabel="Số đề tài theo mức sức khoẻ qua các tuần" /> : <p className="chart-card-subtitle">Chưa có ảnh chụp nào trong khoảng thời gian này.</p>}
            </ChartCard>

            <ChartCard
              refreshing={refreshing}
              title="Đường cong S: tiến độ kế hoạch và thực tế"
              subtitle="% khối lượng bình quân của các đề tài đang thực hiện / tạm dừng."
              table={<BucketTable columns={[{ key: "date", label: "Ngày" }, { key: "planned", label: "Kế hoạch", numeric: true }, { key: "actual", label: "Thực tế", numeric: true }, { key: "spi", label: "SPI bình quân", numeric: true }]} rows={trends.series.map((point) => ({ date: `${shortDay(point.date)}/${point.date.slice(0, 4)}${point.live ? " (hiện tại)" : ""}`, planned: point.averagePlannedPercent === null ? "—" : `${point.averagePlannedPercent}%`, actual: point.averageActualPercent === null ? "—" : `${point.averageActualPercent}%`, spi: point.averageSpi === null ? "—" : point.averageSpi.toFixed(2) }))} />}
            >
              {progressPoints.length ? <LineChart points={progressPoints} series={PROGRESS_SERIES} yMax={100} format={percent} ariaLabel="Tiến độ kế hoạch và thực tế bình quân theo tuần" /> : <p className="chart-card-subtitle">Chưa có số liệu.</p>}
            </ChartCard>

            <ChartCard
              refreshing={refreshing}
              title="Đơn vị × sức khoẻ"
              subtitle="Bấm vào ô để xem danh sách đề tài."
              table={<BucketTable columns={[{ key: "label", label: "Đơn vị" }, ...HEALTH_KEYS.map((key) => ({ key, label: HEALTH_KEY_LABELS[key], numeric: true })), { key: "count", label: "Tổng", numeric: true }]} rows={projects.byUnitHealth.map((row) => ({ label: row.label, green: row.green, amber: row.amber, red: row.red, none: row.none, count: row.count }))} />}
            >
              <UnitHealthHeatmap rows={projects.byUnitHealth} onSelect={(unitId, health) => openDrill("projects", health ? { unitId, health } : { unitId }, `Đề tài của ${projects.byUnitHealth.find((row) => row.key === unitId)?.label ?? "đơn vị"}${health ? ` — ${HEALTH_KEY_LABELS[health].toLowerCase()}` : ""}`)} />
            </ChartCard>

            <ChartCard
              wide
              refreshing={refreshing}
              title="Kinh phí theo đơn vị"
              subtitle={`Tổng kinh phí và số đã cấp; chỉ tính ${projects.totals.financeVisibleCount} đề tài bạn được xem kinh phí.`}
              table={<BucketTable columns={[{ key: "label", label: "Đơn vị" }, { key: "budget", label: "Tổng kinh phí", numeric: true }, { key: "disbursed", label: "Đã cấp", numeric: true }]} rows={projects.byUnit.map((bucket) => ({ label: bucket.label, budget: formatMoney(bucket.totalBudget ?? 0), disbursed: formatMoney(bucket.totalDisbursed ?? 0) }))} />}
            >
              <HBarChart rows={projects.byUnit.map((bucket) => ({ key: bucket.key, label: bucket.label, values: { totalBudget: bucket.totalBudget ?? 0, totalDisbursed: bucket.totalDisbursed ?? 0 } }))} series={BUDGET_SERIES} onSelect={(unitId) => openDrill("projects", { unitId }, `Đề tài của ${unitName(unitId) || "đơn vị"}`)} />
            </ChartCard>

            <ChartCard
              refreshing={refreshing}
              title="Đề tài theo cấp"
              table={<BucketTable columns={[{ key: "label", label: "Cấp" }, { key: "count", label: "Số đề tài", numeric: true }, { key: "budget", label: "Kinh phí", numeric: true }]} rows={projects.byLevel.map((bucket) => ({ label: labels.level(bucket.key || null), count: bucket.count, budget: formatMoney(bucket.totalBudget ?? 0) }))} />}
            >
              <HBarChart rows={bucketRows(projects.byLevel, (bucket) => labels.level(bucket.key || null))} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(level) => openDrill("projects", { level }, `Đề tài ${labels.level(level).toLowerCase()}`)} />
            </ChartCard>

            <ChartCard
              refreshing={refreshing}
              title="Đề tài theo trạng thái"
              table={<BucketTable columns={[{ key: "label", label: "Trạng thái" }, { key: "count", label: "Số đề tài", numeric: true }]} rows={projects.byStatus.map((bucket) => ({ label: labels.status(bucket.key, "projects"), count: bucket.count }))} />}
            >
              <HBarChart rows={bucketRows(projects.byStatus, (bucket) => labels.status(bucket.key, "projects"))} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(status) => openDrill("projects", { status }, `Đề tài: ${labels.status(status, "projects").toLowerCase()}`)} />
            </ChartCard>
          </div>

          <h2 className="dash-section-title">Theo tính chất và chuyên viên phụ trách</h2>
          <div className="dash-grid">
            <ChartCard
              refreshing={refreshing}
              title="Đề tài theo tính chất"
              subtitle="Quân sự / Dân sự theo hồ sơ đề xuất gốc."
              table={<BucketTable columns={[{ key: "label", label: "Tính chất" }, { key: "count", label: "Số đề tài", numeric: true }, { key: "budget", label: "Kinh phí", numeric: true }]} rows={projects.byScope.map((bucket) => ({ label: bucket.label, count: bucket.count, budget: formatMoney(bucket.totalBudget ?? 0) }))} />}
            >
              <HBarChart rows={bucketRows(projects.byScope, (bucket) => bucket.label)} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(scope) => openDrill("projects", { scope: scope as ScopeKey }, `Đề tài ${SCOPE_LABELS[scope as ScopeKey]?.toLowerCase() ?? ""}`, [SCOPE_LABELS[scope as ScopeKey]])} />
            </ChartCard>
            <ChartCard
              refreshing={refreshing}
              title="Hồ sơ theo tính chất"
              table={<BucketTable columns={[{ key: "label", label: "Tính chất" }, { key: "count", label: "Số hồ sơ", numeric: true }]} rows={proposals.byScope.map((bucket) => ({ label: bucket.label, count: bucket.count }))} />}
            >
              <HBarChart rows={bucketRows(proposals.byScope, (bucket) => bucket.label)} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(scope) => openDrill("proposals", { scope: scope as ScopeKey }, `Hồ sơ ${SCOPE_LABELS[scope as ScopeKey]?.toLowerCase() ?? ""}`, [SCOPE_LABELS[scope as ScopeKey]])} />
            </ChartCard>
            <ChartCard
              wide
              refreshing={refreshing}
              title="Theo chuyên viên phụ trách"
              subtitle="Số đề tài, đề tài quá hạn, chậm tiến độ (Cần chú ý / Chậm tiến độ) và hồ sơ đang xét của từng chuyên viên. Bấm tên để xem danh sách đề tài."
              table={<OfficerTable rows={officerRows} onOpen={(officerId, metric, extra, title) => openDrill(metric, { officerId, ...extra }, title, [officerLabel(officerId)])} />}
            >
              <HBarChart
                rows={officerRows.map((row) => ({ key: row.key, label: row.label, values: { count: row.projects, behind: row.behind } }))}
                series={OFFICER_SERIES}
                format={(value) => value.toLocaleString("vi-VN")}
                onSelect={(officerId) => openDrill("projects", { officerId }, `Đề tài do ${officerLabel(officerId)} phụ trách`, [officerLabel(officerId)])}
              />
            </ChartCard>
          </div>

          <h2 className="dash-section-title">Sản phẩm</h2>
          <div className="dash-grid">
            <ChartCard
              refreshing={refreshing}
              title="Sản phẩm đề tài theo dạng"
              subtitle={`${products.projectProducts.total} sản phẩm (mỗi nội dung công việc trong thuyết minh là một sản phẩm). Bấm đoạn màu để xem danh sách.`}
              table={<BucketTable columns={[{ key: "form", label: "Dạng" }, ...PRODUCT_STATUSES.map((status) => ({ key: status, label: PRODUCT_STATUS_LABELS[status], numeric: true })), { key: "total", label: "Tổng", numeric: true }]} rows={products.projectProducts.byForm.map((row) => ({ form: PRODUCT_FORM_LABELS[row.form] ?? String(row.form), ...row.byStatus, total: row.total }))} />}
            >
              <StackedHBarChart rows={products.projectProducts.byForm.map((row) => ({ key: String(row.form), label: PRODUCT_FORM_LABELS[row.form] ?? String(row.form), values: row.byStatus }))} series={PRODUCT_SERIES} onSelect={(form, status) => openDrill("products", { form, productStatus: status as (typeof PRODUCT_STATUSES)[number] }, `Sản phẩm ${PRODUCT_FORM_LABELS[Number(form)] ?? form} — ${PRODUCT_STATUS_LABELS[status as (typeof PRODUCT_STATUSES)[number]].toLowerCase()}`)} />
            </ChartCard>

            <ChartCard
              refreshing={refreshing}
              title="Sản phẩm đầu ra của hồ sơ theo loại"
              subtitle={`${products.proposalDeliverables.total} sản phẩm đầu ra (bài báo, bằng sáng chế, …).`}
              table={<BucketTable columns={[{ key: "type", label: "Loại" }, { key: "total", label: "Số lượng", numeric: true }]} rows={products.proposalDeliverables.byType.map((row) => ({ type: row.type, total: row.total }))} />}
            >
              <HBarChart rows={products.proposalDeliverables.byType.map((row) => ({ key: row.type, label: row.type, values: { count: row.total }, clickable: isFilterableType(row.type) }))} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(type) => openDrill("deliverables", { type }, `Sản phẩm đầu ra: ${type}`)} />
            </ChartCard>
          </div>

          <h2 className="dash-section-title">Hồ sơ đề xuất</h2>
          <div className="dash-tiles">
            <Tile label="Hồ sơ" value={proposals.totals.count.toLocaleString("vi-VN")} meta="Trong phạm vi bạn được xem" onClick={() => openDrill("proposals", {}, "Danh sách hồ sơ đề xuất")} />
            <Tile label="Chờ xử lý" value={proposals.totals.pending.toLocaleString("vi-VN")} meta="Đã nộp, đang xét" />
            <Tile label="Đã phê duyệt" value={proposals.totals.approved.toLocaleString("vi-VN")} meta={`Kinh phí duyệt ${formatMoney(proposals.totals.approvedBudget)}`} onClick={() => openDrill("proposals", { status: "approved" }, "Hồ sơ đã phê duyệt")} />
            <Tile label="Quá hạn" value={proposals.totals.overdue.toLocaleString("vi-VN")} meta="Đã qua ngày kết thúc, chưa hoàn tất" onClick={() => openDrill("proposals", { overdue: "true" }, "Hồ sơ quá hạn")} />
          </div>
          <div className="dash-grid">
            <ChartCard
              refreshing={refreshing}
              title="Hồ sơ theo đơn vị"
              table={<BucketTable columns={[{ key: "label", label: "Đơn vị" }, { key: "count", label: "Số hồ sơ", numeric: true }, { key: "budget", label: "Kinh phí duyệt", numeric: true }]} rows={proposals.byUnit.map((bucket) => ({ label: bucket.label, count: bucket.count, budget: formatMoney(bucket.approvedBudget ?? 0) }))} />}
            >
              <HBarChart rows={bucketRows(proposals.byUnit, (bucket) => bucket.label)} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(unitId) => openDrill("proposals", { unitId }, `Hồ sơ của ${unitName(unitId) || "đơn vị"}`)} />
            </ChartCard>
            <ChartCard
              refreshing={refreshing}
              title="Hồ sơ theo trạng thái"
              table={<BucketTable columns={[{ key: "label", label: "Trạng thái" }, { key: "count", label: "Số hồ sơ", numeric: true }]} rows={proposals.byStatus.map((bucket) => ({ label: labels.status(bucket.key, "proposals"), count: bucket.count }))} />}
            >
              <HBarChart rows={bucketRows(proposals.byStatus, (bucket) => labels.status(bucket.key, "proposals"))} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(status) => openDrill("proposals", { status }, `Hồ sơ: ${labels.status(status, "proposals").toLowerCase()}`)} />
            </ChartCard>
            <ChartCard
              refreshing={refreshing}
              title="Hồ sơ theo lĩnh vực"
              table={<BucketTable columns={[{ key: "label", label: "Lĩnh vực" }, { key: "count", label: "Số hồ sơ", numeric: true }]} rows={proposals.byField.map((bucket) => ({ label: labels.field(bucket.key || null), count: bucket.count }))} />}
            >
              <HBarChart rows={bucketRows(proposals.byField, (bucket) => labels.field(bucket.key || null))} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(field) => openDrill("proposals", { field }, `Hồ sơ lĩnh vực ${labels.field(field)}`)} />
            </ChartCard>
            <ChartCard
              refreshing={refreshing}
              title="Hồ sơ theo năm nộp"
              table={<BucketTable columns={[{ key: "label", label: "Năm" }, { key: "count", label: "Số hồ sơ", numeric: true }]} rows={proposals.byYear.map((bucket) => ({ label: bucket.key || "Chưa nộp", count: bucket.count }))} />}
            >
              <HBarChart rows={bucketRows(proposals.byYear, (bucket) => bucket.key || "Chưa nộp")} series={SINGLE} format={(value) => value.toLocaleString("vi-VN")} onSelect={(year) => openDrill("proposals", { year }, `Hồ sơ nộp năm ${year}`)} />
            </ChartCard>
          </div>
        </div>
      ) : null}

      <DashboardConferenceSection year={filters.year} unitId={filters.unitId} />

      {drill ? <DrillDownPanel key={drill.id} request={drill} labels={labels} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}
