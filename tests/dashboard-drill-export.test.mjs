import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { DashboardExportService } from "../dist/apps/api/dashboard/dashboard-export.service.js";
import { DashboardAnalyticsService } from "../dist/apps/api/dashboard/dashboard-analytics.service.js";

// Xuất Excel danh sách chi tiết (drill-down) của Dashboard: GET /dashboard/drill-down/export.

const staff = { id: "staff", username: "staff", systemRole: "RESEARCH_MANAGEMENT_STAFF", organizationScopes: [{ id: "unit-1" }] };

function exporter(rows, metric = "projects") {
  const audits = [];
  const calls = [];
  const analytics = { drillDownRows: async (actor, query) => { calls.push({ actor, query }); return { metric, filters: { health: "red" }, rows, page: 1, pageSize: 50 }; } };
  const auditLog = { record: async (input) => { audits.push(input); } };
  return { audits, calls, service: new DashboardExportService({}, auditLog, analytics) };
}

async function read(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows = [];
  sheet.eachRow((row) => rows.push(row.values.slice(1)));
  return { sheet, rows };
}

describe("Xuất Excel danh sách chi tiết Dashboard", () => {
  it("xuất mọi dòng với cột như bảng trên màn hình, nhãn tiếng Việt, ô kinh phí trống khi không được xem", async () => {
    const rows = [
      { id: "p1", code: "HVQY-01", title: "Đề tài 1", level: "ministry-level", unit: { name: "Khoa Nội" }, piName: "TS. A", officerName: "CV B", militaryScope: "military", status: "executing", health: "red", plannedPercent: 60, actualPercent: 30, spi: 0.5, daysOverdue: 40, lateReports: 1, startDate: "2025-01-01", endDate: "2025-12-31", overdue: true, totalBudget: 480_000_000, totalDisbursed: 192_000_000 },
      { id: "p2", code: null, title: "Đề tài 2", level: null, unit: { name: "Khoa Ngoại" }, piName: null, officerName: null, militaryScope: null, status: "accepted", health: "none", plannedPercent: 0, actualPercent: 0, spi: null, daysOverdue: 0, lateReports: 0, startDate: null, endDate: null, overdue: false, totalBudget: null, totalDisbursed: null }
    ];
    const { service, audits, calls } = exporter(rows);
    const { buffer, fileName } = await service.exportDrillDownToExcel(staff, { metric: "projects", health: "red" });
    assert.equal(fileName, "Chi_tiet_De_tai.xlsx");
    assert.deepEqual(calls[0].query, { metric: "projects", health: "red" });
    const { sheet, rows: cells } = await read(buffer);
    assert.equal(sheet.name, "De_tai");
    assert.deepEqual(cells[0].slice(0, 4), ["STT", "Mã số", "Tên đề tài", "Cấp"]);
    assert.equal(cells.length, 3);
    const first = cells[1];
    assert.equal(first[0], 1);
    assert.equal(first[3], "Cấp Bộ Quốc phòng");
    assert.equal(first[8], "Đang thực hiện");
    assert.equal(first[9], "Chậm tiến độ");
    assert.equal(first[17], "Quá hạn");
    assert.equal(first[18], 480_000_000);
    const second = cells[2];
    assert.equal(second[9], "Không đánh giá");
    assert.equal(second[10] ?? null, null, "đề tài không đánh giá sức khoẻ: không ghi tiến độ 0%");
    assert.equal(second[18] ?? null, null);
    assert.equal(audits[0].action, "export-drill-down");
    assert.deepEqual(audits[0].afterFacts, { format: "xlsx", metric: "projects", rowCount: 2, filters: { health: "red" } });
  });

  it("danh sách sản phẩm đầu ra có sheet và cột riêng", async () => {
    const { service } = exporter([{ id: "d1", title: "Bài báo ISI", type: "Bài báo", proposal: { code: "HS-1", title: "Hồ sơ 1" }, unit: { name: "Khoa Nội" }, status: "published", publishedAt: "2025-05-02T00:00:00.000Z" }], "deliverables");
    const { sheet, rows } = await read((await service.exportDrillDownToExcel(staff, { metric: "deliverables" })).buffer);
    assert.equal(sheet.name, "San_pham_dau_ra");
    assert.equal(rows[1][3], "HS-1 · Hồ sơ 1");
  });

  it("tham số phân trang không dùng cho tệp xuất; người dùng không xác định bị từ chối", async () => {
    const analytics = new DashboardAnalyticsService(null, null, null);
    await assert.rejects(analytics.drillDownRows(staff, { metric: "projects", page: "2" }), /không được hỗ trợ/);
    await assert.rejects(analytics.drillDownRows(undefined, { metric: "projects" }), /Không có quyền/);
    await assert.rejects(analytics.drillDownRows(staff, { metric: "other" }), /metric phải là/);
  });
});
