import { BadRequestException } from "@nestjs/common";

/**
 * Kiểm tra tham số truy vấn của dashboard theo danh sách trắng. Khoá lạ, giá trị lặp (mảng) hoặc sai định dạng
 * đều bị từ chối (400) thay vì bị bỏ qua: bộ lọc gõ sai không được âm thầm trả về toàn bộ dữ liệu.
 */

export const DRILL_DOWN_METRICS = ["projects", "proposals", "products", "deliverables"] as const;
export type DrillDownMetric = (typeof DRILL_DOWN_METRICS)[number];

export const DISTRIBUTION_SUBJECTS = ["projects", "proposals"] as const;
export type DistributionSubject = (typeof DISTRIBUTION_SUBJECTS)[number];

export const HEALTH_FILTERS = ["green", "amber", "red", "none"] as const;
export const PRODUCT_STATUSES = ["PLANNED", "SUBMITTED", "UNDER_REVIEW", "PASSED", "FAILED"] as const;
export const PRODUCT_FORMS = [1, 2, 3, 4, 5, 6] as const;
/** Tính chất đề tài (ResearchProposal.militaryScope); "none" = chưa phân loại. */
export const SCOPE_FILTERS = ["military", "civilian", "none"] as const;
/** Chuyên viên phụ trách: id người dùng, hoặc "none" = chưa có người phụ trách. */
export const NO_OFFICER = "none";

export type DashboardFilters = {
  unitId?: string;
  level?: string;
  field?: string;
  year?: number;
  status?: string;
  health?: (typeof HEALTH_FILTERS)[number];
  overdue?: boolean;
  scope?: (typeof SCOPE_FILTERS)[number];
  officerId?: string;
  form?: number;
  productStatus?: (typeof PRODUCT_STATUSES)[number];
  type?: string;
  deliverableStatus?: string;
};

export type DashboardQuery = DashboardFilters & {
  metric?: DrillDownMetric;
  subject?: DistributionSubject;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

type Key = keyof DashboardQuery;

// Cùng tập ký tự với mã danh mục khi nhập hồ sơ (readCode: tối đa 80 ký tự).
const CODE = /^[A-Za-z0-9_.-]{1,80}$/;
const STATUS = /^[a-z_]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Loại tài liệu đầu ra có dấu tiếng Việt và khoảng trắng; chặn ký tự điều khiển.
// eslint-disable-next-line no-control-regex -- cố ý so khớp ký tự điều khiển để chặn chúng
const FREE_TEXT = /^[^\u0000-\u001f\u007f]{1,100}$/u;

function invalid(key: string, message: string): never {
  throw new BadRequestException({ code: "DASHBOARD_QUERY_INVALID", field: key, message });
}

function integer(key: string, raw: string, min: number, max: number) {
  if (!/^\d{1,6}$/.test(raw)) invalid(key, `${key} phải là số nguyên.`);
  const value = Number(raw);
  if (value < min || value > max) invalid(key, `${key} phải trong khoảng ${min}–${max}.`);
  return value;
}

function oneOf<T extends string>(key: string, raw: string, values: readonly T[]): T {
  if (!(values as readonly string[]).includes(raw)) invalid(key, `${key} không hợp lệ.`);
  return raw as T;
}

function calendarDate(key: string, raw: string) {
  if (!DATE.test(raw)) invalid(key, `${key} phải có dạng YYYY-MM-DD.`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) invalid(key, `${key} không phải ngày hợp lệ.`);
  return raw;
}

const PARSERS: Record<Key, (raw: string) => unknown> = {
  unitId: (raw) => (CODE.test(raw) ? raw : invalid("unitId", "Mã đơn vị không hợp lệ.")),
  level: (raw) => (CODE.test(raw) ? raw : invalid("level", "Cấp đề tài không hợp lệ.")),
  field: (raw) => (CODE.test(raw) ? raw : invalid("field", "Mã lĩnh vực không hợp lệ.")),
  year: (raw) => integer("year", raw, 2000, 2100),
  status: (raw) => (STATUS.test(raw) ? raw : invalid("status", "Trạng thái không hợp lệ.")),
  health: (raw) => oneOf("health", raw, HEALTH_FILTERS),
  overdue: (raw) => (raw === "true" ? true : raw === "false" ? false : invalid("overdue", "overdue chỉ nhận true hoặc false.")),
  scope: (raw) => oneOf("scope", raw, SCOPE_FILTERS),
  officerId: (raw) => (CODE.test(raw) ? raw : invalid("officerId", "Mã chuyên viên không hợp lệ.")),
  form: (raw) => integer("form", raw, 1, 6),
  productStatus: (raw) => oneOf("productStatus", raw, PRODUCT_STATUSES),
  type: (raw) => (FREE_TEXT.test(raw) ? raw : invalid("type", "Loại sản phẩm không hợp lệ.")),
  deliverableStatus: (raw) => (STATUS.test(raw) ? raw : invalid("deliverableStatus", "Trạng thái không hợp lệ.")),
  metric: (raw) => oneOf("metric", raw, DRILL_DOWN_METRICS),
  subject: (raw) => oneOf("subject", raw, DISTRIBUTION_SUBJECTS),
  from: (raw) => calendarDate("from", raw),
  to: (raw) => calendarDate("to", raw),
  page: (raw) => integer("page", raw, 1, 100000),
  pageSize: (raw) => integer("pageSize", raw, 1, 200)
};

export function parseDashboardQuery(query: unknown, allowed: readonly Key[]): DashboardQuery {
  const result: Record<string, unknown> = {};
  if (query === undefined || query === null) return result;
  if (typeof query !== "object" || Array.isArray(query)) invalid("query", "Tham số không hợp lệ.");
  for (const [key, raw] of Object.entries(query as Record<string, unknown>)) {
    if (!(allowed as readonly string[]).includes(key)) invalid(key, `Tham số "${key.slice(0, 40)}" không được hỗ trợ ở đây.`);
    if (typeof raw !== "string") invalid(key, `${key} chỉ được truyền một lần.`);
    if (raw === "") continue;
    result[key] = PARSERS[key as Key](raw);
  }
  return result as DashboardQuery;
}

/** Bộ lọc dùng được cho từng loại danh sách chi tiết (drill-down). */
export const DRILL_DOWN_FILTERS: Record<DrillDownMetric, readonly Key[]> = {
  projects: ["unitId", "level", "field", "year", "status", "health", "overdue", "scope", "officerId"],
  proposals: ["unitId", "level", "field", "year", "status", "overdue", "scope", "officerId"],
  products: ["unitId", "level", "field", "year", "scope", "form", "productStatus"],
  deliverables: ["unitId", "level", "field", "year", "scope", "type", "deliverableStatus"]
};

export const COMMON_FILTERS: readonly Key[] = ["unitId", "level", "field", "year", "scope"];
