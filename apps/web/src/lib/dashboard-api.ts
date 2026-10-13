import { getApiBaseUrl } from "@/lib/session";

/** Bộ lọc chung của dashboard; khớp danh sách trắng ở API (apps/api/src/dashboard/dashboard-query.ts). */
export type DashboardFilters = { year?: string; unitId?: string; level?: string; field?: string };
export const DASHBOARD_FILTER_KEYS = ["year", "unitId", "level", "field"] as const;

export type HealthKey = "green" | "amber" | "red" | "none";
export const HEALTH_KEYS: HealthKey[] = ["green", "amber", "red", "none"];
export const HEALTH_KEY_LABELS: Record<HealthKey, string> = { green: "Đúng tiến độ", amber: "Cần chú ý", red: "Chậm tiến độ", none: "Không đánh giá" };

export type Bucket = { key: string; label: string; count: number; totalBudget?: number; totalDisbursed?: number; approvedBudget?: number };
export type UnitHealthBucket = Bucket & Record<HealthKey, number>;

export type ProjectDistribution = {
  subject: "projects";
  totals: { count: number; financeVisibleCount: number; totalBudget: number; totalDisbursed: number; totalSettled: number; overdue: number };
  byUnit: Bucket[]; byLevel: Bucket[]; byField: Bucket[]; byStatus: Bucket[]; byYear: Bucket[];
  byHealth: Array<{ key: HealthKey; label: string; count: number }>;
  byUnitHealth: UnitHealthBucket[];
};

export type ProposalDistribution = {
  subject: "proposals";
  totals: { count: number; pending: number; approved: number; overdue: number; approvedBudget: number };
  byUnit: Bucket[]; byLevel: Bucket[]; byField: Bucket[]; byStatus: Bucket[]; byYear: Bucket[];
};

export type TrendPoint = {
  date: string; live: boolean; total: number; health: Record<HealthKey, number>; status: Record<string, number>;
  averageSpi: number | null; averagePlannedPercent: number | null; averageActualPercent: number | null;
  projectsWithOverdueMilestones: number; lateReports: number; totalBudget: number; totalDisbursed: number;
};
export type Trends = { from: string; to: string; series: TrendPoint[] };

export const PRODUCT_STATUSES = ["PLANNED", "SUBMITTED", "UNDER_REVIEW", "PASSED", "FAILED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = { PLANNED: "Chưa nộp", SUBMITTED: "Đã nộp", UNDER_REVIEW: "Đang nghiệm thu", PASSED: "Đạt", FAILED: "Không đạt" };
export const PRODUCT_FORM_LABELS: Record<number, string> = { 1: "Dạng 1", 2: "Dạng 2", 3: "Dạng 3", 4: "Dạng 4", 5: "Dạng 5", 6: "Dạng 6" };

export type ProductStats = {
  projectProducts: { total: number; byStatus: Record<ProductStatus, number>; byForm: Array<{ form: number; total: number; byStatus: Record<ProductStatus, number> }> };
  proposalDeliverables: { total: number; byType: Array<{ type: string; total: number; byStatus: Record<string, number> }> };
};

export type DrillDownMetric = "projects" | "proposals" | "products" | "deliverables";
/** Bộ lọc riêng của từng loại danh sách (cộng với bộ lọc chung). */
export type DrillDownFilters = DashboardFilters & { status?: string; health?: HealthKey; overdue?: "true" | "false"; form?: string; productStatus?: ProductStatus; type?: string; deliverableStatus?: string };

export type ProjectRow = {
  id: string; code: string | null; title: string; unit: { id: string; name: string }; piName: string | null; status: string; level: string | null; field: string | null;
  health: HealthKey; spi: number | null; plannedPercent: number; actualPercent: number; daysOverdue: number; lateReports: number; overdue: boolean;
  startDate: string | null; endDate: string | null; totalBudget: number | null; totalDisbursed: number | null; link: string;
};
export type ProposalRow = { id: string; code: string | null; title: string; unit: { id: string; name: string }; ownerName: string | null; status: string; level: string | null; field: string | null; submittedAt: string | null; endDate: string | null; overdue: boolean; link: string };
export type ProductRow = { id: string; title: string; productForm: number; status: ProductStatus; position: number; project: { id: string; code: string | null; title: string }; unit: { id: string; name: string }; link: string };
export type DeliverableRow = { id: string; type: string; title: string; status: string; publishedAt: string | null; proposal: { id: string; code: string | null; title: string }; unit: { id: string; name: string }; link: string };

export type DrillDownRowMap = { projects: ProjectRow; proposals: ProposalRow; products: ProductRow; deliverables: DeliverableRow };
export type DrillDownResult<M extends DrillDownMetric> = { metric: M; total: number; page: number; pageSize: number; items: Array<DrillDownRowMap[M]> };

/** Chỉ đưa vào URL các khoá có giá trị; API từ chối khoá lạ nên không thêm gì ngoài bộ lọc đã khai báo. */
export function dashboardQuery(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/dashboard/${path}`, { credentials: "include", signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    throw new Error(typeof body?.message === "string" ? body.message : "Không tải được số liệu thống kê.");
  }
  return (await response.json()) as T;
}

const common = (filters: DashboardFilters) => ({ year: filters.year, unitId: filters.unitId, level: filters.level, field: filters.field });

export function loadProjectDistribution(filters: DashboardFilters, signal?: AbortSignal) {
  return getJson<ProjectDistribution>(`distribution${dashboardQuery({ subject: "projects", ...common(filters) })}`, signal);
}

export function loadProposalDistribution(filters: DashboardFilters, signal?: AbortSignal) {
  return getJson<ProposalDistribution>(`distribution${dashboardQuery({ subject: "proposals", ...common(filters) })}`, signal);
}

/** Hôm nay theo giờ Việt Nam (YYYY-MM-DD) — cùng cách tính "hôm nay" với API. */
export function vietnamToday(now = Date.now()) {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Ngày bắt đầu của khoảng `months` tháng tính lùi từ hôm nay (giờ Việt Nam). */
export function trendFrom(months: number, now = Date.now()) {
  const [year, month, day] = vietnamToday(now).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, lastDay));
  return start.toISOString().slice(0, 10);
}

/** Xu hướng không lọc theo năm (trục thời gian đã là năm). Không gửi `to`: API lấy hôm nay theo giờ Việt Nam. */
export function loadTrends(filters: DashboardFilters, range: { from?: string }, signal?: AbortSignal) {
  return getJson<Trends>(`trends${dashboardQuery({ from: range.from, unitId: filters.unitId, level: filters.level, field: filters.field })}`, signal);
}

/** Cùng quy tắc với API (dashboard-query.ts): loại sản phẩm đầu ra 1–100 ký tự, không ký tự điều khiển. */
export function isFilterableType(value: string) {
  // eslint-disable-next-line no-control-regex -- cố ý so khớp ký tự điều khiển để chặn chúng
  return /^[^\u0000-\u001f\u007f]{1,100}$/u.test(value);
}

export function loadProductStats(filters: DashboardFilters, signal?: AbortSignal) {
  return getJson<ProductStats>(`products${dashboardQuery(common(filters))}`, signal);
}

export function loadDrillDown<M extends DrillDownMetric>(metric: M, filters: DrillDownFilters, page = 1, pageSize = 50, signal?: AbortSignal) {
  return getJson<DrillDownResult<M>>(`drill-down${dashboardQuery({ metric, page, pageSize, ...filters })}`, signal);
}

export function formatMoney(amount: number) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ đ`;
  if (amount >= 1_000_000) return `${Math.round(amount / 1_000_000).toLocaleString("vi-VN")} triệu đ`;
  return `${amount.toLocaleString("vi-VN")} đ`;
}

export function formatDay(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
