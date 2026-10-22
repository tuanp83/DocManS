import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// Giao diện: xuất Excel bảng chi tiết Dashboard và tab Báo cáo công tác KHQS.

const read = (file) => readFileSync(file, "utf8");

test("bảng chi tiết Dashboard có nút Tải Excel gọi /dashboard/drill-down/export với đúng bộ lọc đang xem", () => {
  const panel = read("apps/web/src/components/dashboard/drill-down-panel.tsx");
  assert.match(panel, /downloadFromApi\(drillDownExportPath\(request\.metric, request\.filters\)/);
  assert.match(panel, />\{exporting \? "Đang tạo tệp…" : "Tải Excel"\}</);
  assert.match(read("apps/web/src/lib/dashboard-api.ts"), /`\/dashboard\/drill-down\/export\$\{dashboardQuery\(\{ metric, \.\.\.filters \}\)\}`/);
  assert.match(read("apps/api/src/dashboard/dashboard.controller.ts"), /@Get\("drill-down\/export"\)/);
});

test("tab Báo cáo công tác KHQS chỉ hiện với vai trò được xem (khớp quy tắc API)", () => {
  const page = read("apps/web/src/app/reports/page.tsx");
  assert.match(page, /KHQS_REPORT_ROLES = \["LEADERSHIP_APPROVAL_AUTHORITY", "SCIENCE_DEPUTY_DIRECTOR", "RESEARCH_MANAGEMENT_HEAD", "RESEARCH_BOARD_HEAD"\]/);
  assert.match(page, /\{showKhqs \? \(/);
  const service = read("apps/api/src/khqs-reports/khqs-reports.service.ts");
  assert.match(service, /return isAcademyLeadership\(actor\) \|\| isResearchManagementHead\(actor\) \|\| isResearchBoardHead\(actor\);/);
});

test("trang báo cáo KHQS: hộp xác nhận của hệ thống, Word khổ ngang cho các biểu, Excel lấy bản đã lưu", () => {
  const panel = read("apps/web/src/components/reports/khqs-report-panel.tsx");
  assert.doesNotMatch(panel, /window\.confirm|window\.alert/);
  assert.match(panel, /useConfirm\(\)/);
  assert.match(panel, /orientation: "landscape"/);
  assert.match(panel, /disabled=\{!report \|\| busy !== null \|\| dirty\}/);
  assert.match(read("apps/web/src/lib/word-export.ts"), /orientation = "portrait"/);
});
