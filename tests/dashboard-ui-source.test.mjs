import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

// Dashboard đợt 2 (docs/design/dashboard-thong-ke-dot-2.md): giao diện chỉ hiển thị số liệu API đã lọc theo quyền.

const read = (path) => readFileSync(path, "utf8");
const DIR = "apps/web/src/components/dashboard";
const files = ["dashboard-analytics.tsx", "drill-down-panel.tsx", "project-gantt.tsx", "unit-health-heatmap.tsx", "viz.tsx"].map((name) => `${DIR}/${name}`);

test("trang dashboard dùng bộ thống kê mới; biểu đồ cũ theo /stats đã bỏ", () => {
  const page = read("apps/web/src/app/dashboard/page.tsx");
  assert.match(page, /<DashboardAnalytics \/>/);
  assert.equal(existsSync(`${DIR}/dashboard-charts.tsx`), false);
  assert.equal(/dashboard\/stats/.test(page), false);
});

test("API client chỉ gọi 4 API thống kê và chỉ gửi khoá bộ lọc đã khai báo", () => {
  const api = read("apps/web/src/lib/dashboard-api.ts");
  const paths = [...api.matchAll(/getJson<.*?>\(`([a-z-]+)\$\{/g)].map((match) => match[1]).sort();
  assert.deepEqual(paths, ["distribution", "distribution", "drill-down", "products", "trends"]);
  assert.match(api, /DASHBOARD_FILTER_KEYS = \["year", "unitId", "level", "field"\] as const/);
  assert.match(api, /credentials: "include"/);
  // Bỏ giá trị rỗng để API không nhận khoá thừa.
  assert.match(api, /if \(value === undefined \|\| value === null \|\| value === ""\) continue;/);
});

test("không quyết định hiển thị theo vai trò ở trình duyệt; không chèn HTML thô", () => {
  for (const file of files) {
    const source = read(file);
    assert.equal(/systemRole|isLeadership|organizationScopes/.test(source), false, file);
    assert.equal(/dangerouslySetInnerHTML|innerHTML/.test(source), false, file);
  }
});

test("bấm số liệu mở danh sách chi tiết từ API drill-down; mỗi biểu đồ có bảng số liệu", () => {
  const analytics = read(`${DIR}/dashboard-analytics.tsx`);
  const panel = read(`${DIR}/drill-down-panel.tsx`);
  assert.match(panel, /loadDrillDown\(request\.metric, request\.filters, page, PAGE_SIZE/);
  assert.match(panel, /role="dialog" aria-modal="true"/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /<ProjectGantt rows=/);
  const cards = analytics.match(/<ChartCard\b/g)?.length ?? 0;
  const tables = analytics.match(/table=\{<BucketTable /g)?.length ?? 0;
  assert.ok(cards >= 10);
  assert.equal(cards, tables, "mỗi ChartCard có bảng tương đương");
  for (const metric of ["projects", "proposals", "products", "deliverables"]) assert.ok(analytics.includes(`openDrill("${metric}"`), metric);
});

test("màu biểu đồ lấy từ token (bảng màu đã kiểm tra), không mã màu rải rác", () => {
  const css = read("apps/web/src/app/globals.css");
  for (const token of ["--series-1: #2a78d6", "--series-2: #eb6834", "--series-3: #1baf7a", "--series-4: #eda100", "--series-5: #e87ba4", "--status-good: #0ca30c", "--status-critical: #d03b3b"]) assert.ok(css.includes(token), token);
  for (const file of [`${DIR}/dashboard-analytics.tsx`, `${DIR}/viz.tsx`, `${DIR}/project-gantt.tsx`]) {
    const hex = read(file).match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    assert.deepEqual(hex, [], file);
  }
});
