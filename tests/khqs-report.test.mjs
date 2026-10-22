import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  allocation,
  buildTables,
  managementFacts,
  managementSuggestion,
  parsePeriod,
  periodText,
  readManualTables,
  readNarrative,
  suggestedResult
} from "../dist/apps/api/khqs-reports/khqs-report.js";
import { buildKhqsWorkbook } from "../dist/apps/api/khqs-reports/khqs-report-excel.js";
import { KhqsReportsService, canEditKhqsReport, canReadKhqsReport } from "../dist/apps/api/khqs-reports/khqs-reports.service.js";

// Báo cáo kết quả công tác KHQS theo kỳ (apps/api/src/khqs-reports): Biểu KQ-1, KQ-2 dựng từ đề tài, KQ-3/4/6 nhập tay.

const D = (iso) => new Date(`${iso}T00:00:00.000Z`);
const MILLION = 1_000_000n;

function project(id, overrides = {}) {
  return {
    id, code: id.toUpperCase(), title: `Đề tài ${id}`, status: "executing", startDate: D("2024-03-01"), endDate: D("2026-03-31"),
    scopeSnapshot: { proposalTypeCode: "ministry-level" }, hostOrganizationUnitId: "unit-1", hostOrganizationUnit: { name: "Khoa Nội" },
    proposal: { proposalTypeCode: "ministry-level" },
    members: [{ name: "PI cũ", participationRole: "TOPIC_PI", status: "ACTIVE", effectiveUntil: null, user: { displayName: "GS. TS. Nguyễn Văn A" } }],
    finance: { totalBudget: 2_500n * MILLION },
    disbursements: [], requests: [], reports: [], acceptances: [], superiorAcceptance: null,
    ...overrides
  };
}

const actor = (id, systemRole, scopeIds = ["unit-1"]) => ({ id, username: id, displayName: id, systemRole, organizationScopes: scopeIds.map((scopeId) => ({ id: scopeId })) });

describe("Báo cáo KHQS: dựng dòng biểu từ đề tài", () => {
  it("kỳ báo cáo chỉ nhận năm 4 chữ số và H1 / FY", () => {
    assert.deepEqual(parsePeriod("2025", "H1"), { year: 2025, period: "H1" });
    for (const [year, period] of [["25", "H1"], ["2025", "Q1"], ["abcd", "FY"], ["1999", "FY"]]) assert.throws(() => parsePeriod(year, period), /KHQS_REPORT_PERIOD_INVALID|không hợp lệ|H1/);
  });

  it("thời gian thực hiện ghi ngày kết thúc ban đầu và ngày gia hạn được duyệt cuối cùng", () => {
    const base = { startDate: D("2021-03-01"), endDate: D("2026-02-28") };
    assert.equal(periodText({ ...base, endDate: D("2024-02-29"), requests: [] }), "03/2021 – 02/2024");
    const requests = [
      { requestType: "extension", status: "approved", currentValues: { endDate: "2024-02-29T00:00:00.000Z" }, proposedValues: { requestedEndDate: "2025-02-28" }, decidedAt: new Date("2024-01-10T03:00:00Z") },
      { requestType: "extension", status: "approved", currentValues: { endDate: "2025-02-28T00:00:00.000Z" }, proposedValues: { requestedEndDate: "2026-02-28" }, decidedAt: new Date("2025-01-10T03:00:00Z") },
      { requestType: "extension", status: "rejected", currentValues: {}, proposedValues: { requestedEndDate: "2027-02-28" }, decidedAt: new Date("2025-06-10T03:00:00Z") }
    ];
    assert.equal(periodText({ ...base, requests }), "03/2021 – 02/2024 (gia hạn 02/2026)");
  });

  it("kinh phí cấp đến năm trước / trong kỳ tính theo ngày giải ngân, triệu đồng; 6 tháng đầu năm dừng ở 30/6", () => {
    const disbursements = [
      { disbursedAmount: 700n * MILLION, disbursedDate: D("2024-05-10") },
      { disbursedAmount: 1_500n * MILLION, disbursedDate: D("2025-06-30") },
      { disbursedAmount: 550n * MILLION, disbursedDate: D("2025-07-01") },
      { disbursedAmount: 999n * MILLION, disbursedDate: null }
    ];
    assert.deepEqual(allocation({ disbursements }, 2025, "H1"), { before: 700, inYear: 1500 });
    assert.deepEqual(allocation({ disbursements }, 2025, "FY"), { before: 700, inYear: 2050 });
  });

  it("kết quả gợi ý theo trạng thái, xếp loại nghiệm thu và báo cáo tiến độ gần nhất đã nộp", () => {
    assert.match(suggestedResult(project("p", { status: "accepted", acceptances: [{ round: 1, status: "COMPLETED", resolution: null, evaluationResult: { classification: "PASSED" }, completedAt: new Date() }] })), /Đã nghiệm thu \(Đạt\)\./);
    assert.match(suggestedResult(project("p", { superiorAcceptance: { status: "PASSED", result: "PASSED", resultDecisionNumber: "123/QĐ-BQP" } })), /cấp trên \(Đạt, QĐ 123\/QĐ-BQP\)/);
    const reports = [
      { status: "draft", revision: 3, progressResults: "Bản nháp chưa nộp", issuesRecommendations: null, submittedAt: null },
      { status: "accepted", revision: 2, progressResults: "Đã hoàn thành gói thầu nguyên vật liệu.", issuesRecommendations: "Chậm mua hoá chất.", submittedAt: new Date() }
    ];
    const text = suggestedResult(project("p", { reports }));
    assert.match(text, /^Đang thực hiện\. Đã hoàn thành gói thầu nguyên vật liệu\. Tồn tại, kiến nghị: Chậm mua hoá chất\.$/);
    assert.doesNotMatch(text, /Bản nháp/);
  });

  it("KQ-1 lấy cấp Quốc gia; KQ-2 chia cấp Bộ / Ngành / cơ sở; sửa tay kết quả, ghi chú thay cho gợi ý", () => {
    const projects = [
      project("n1", { scopeSnapshot: { proposalTypeCode: "national-level" } }),
      project("m1"),
      project("b1", { scopeSnapshot: { proposalTypeCode: "branch-level" } }),
      project("a1", { scopeSnapshot: {}, proposal: { proposalTypeCode: "academy-level" }, finance: null })
    ];
    const tables = buildTables(projects, 2025, "H1", { m1: { result: "Đã hoàn thiện hồ sơ xin nghiệm thu cấp BQP.", note: "Đã cấp hết KP từ 2023" } });
    assert.deepEqual(tables.kq1.map((row) => row.projectId), ["n1"]);
    assert.deepEqual(tables.kq2.map((section) => [section.key, section.rows.map((row) => row.projectId)]), [["ministry", ["m1"]], ["branch", ["b1"]], ["grassroots", ["a1"]]]);
    const m1 = tables.kq2[0].rows[0];
    assert.equal(m1.name, "Đề tài m1. Mã số: M1");
    assert.equal(m1.hostAndPi, "Khoa Nội; GS. TS. Nguyễn Văn A");
    assert.equal(m1.result, "Đã hoàn thiện hồ sơ xin nghiệm thu cấp BQP.");
    assert.equal(m1.note, "Đã cấp hết KP từ 2023");
    assert.equal(m1.edited, true);
    assert.equal(m1.totalBudget, 2500);
    const a1 = tables.kq2[2].rows[0];
    assert.equal(a1.totalBudget, null, "đề tài chưa có kinh phí: để trống, không ghi 0");
    assert.equal(a1.allocatedInYear, null);
  });

  it("đoạn gợi ý công tác quản lý nêu số đề tài theo cấp và các việc trong kỳ", () => {
    const projects = [
      project("n1", { scopeSnapshot: { proposalTypeCode: "national-level" }, startDate: D("2025-02-01") }),
      project("m1", { acceptances: [{ round: 1, status: "COMPLETED", resolution: null, evaluationResult: null, completedAt: new Date("2025-05-02T02:00:00Z") }] }),
      project("m2", { requests: [{ requestType: "extension", status: "approved", currentValues: {}, proposedValues: {}, decidedAt: new Date("2025-03-03T02:00:00Z") }] })
    ];
    const facts = managementFacts(projects, 2025, "H1");
    assert.deepEqual({ total: facts.total, national: facts.national, ministry: facts.ministry, started: facts.started, accepted: facts.accepted, extended: facts.extended }, { total: 3, national: 1, ministry: 2, started: 1, accepted: 1, extended: 1 });
    assert.match(managementSuggestion(facts, 2025, "H1"), /^Trong 6 tháng đầu năm 2025, Học viện quản lý 3 nhiệm vụ KH&CN \(1 cấp Quốc gia, 2 cấp Bộ Quốc phòng/);
  });
});

describe("Báo cáo KHQS: kiểm tra dữ liệu nhập tay", () => {
  it("nhận đúng cột của từng biểu, đổi số dạng chữ, bỏ ký tự điều khiển", () => {
    const tables = readManualTables({
      kq3: [{ name: "Nâng cao năng lực giám sát melioidosis\u0007", partner: "Trường ĐH Florida", totalBudget: "13871", hostOther: 13871 }],
      kq4: [{ section: "project", fundSource: "defense", name: "Dự án PTN trọng điểm", completionPercent: "45,5" }],
      kq6: [{ section: "training", task: "compile", name: "Bảo đảm quân y cho các khoa mục bay", compiled: "not_done", compileBudget: 25 }],
      overrides: { "project-1": { result: "Đã nghiệm thu cấp BQP (Đạt)." } }
    });
    assert.equal(tables.kq3[0].name, "Nâng cao năng lực giám sát melioidosis");
    assert.equal(tables.kq3[0].totalBudget, 13871);
    assert.equal(tables.kq3[0].host, "");
    assert.equal(tables.kq3[0].partnerBudget, null);
    assert.equal(tables.kq4[0].completionPercent, 45.5);
    assert.deepEqual(tables.overrides, { "project-1": { result: "Đã nghiệm thu cấp BQP (Đạt)." } });
  });

  it("từ chối cột lạ, lựa chọn ngoài danh sách, số âm, mục văn bản lạ", () => {
    assert.throws(() => readManualTables({ kq3: [{ hacked: "x" }] }), /Cột không có trong biểu/);
    assert.throws(() => readManualTables({ kq4: [{ section: "other" }] }), /danh sách cho phép/);
    assert.throws(() => readManualTables({ kq6: [{ compileBudget: -5 }] }), /Số không hợp lệ/);
    assert.throws(() => readManualTables({ kq3: "x" }), /danh sách dòng/);
    assert.throws(() => readManualTables({ overrides: { p1: { title: "đổi tên" } } }), /Chỉ sửa được/);
    assert.throws(() => readNarrative({ script: "<script>" }), /Mục không có trong mẫu/);
    assert.deepEqual(readNarrative({ situation: "  Trong 6 tháng đầu năm…  ", strengths: "" }), { situation: "Trong 6 tháng đầu năm…" });
  });
});

describe("Báo cáo KHQS: tệp Excel các biểu", () => {
  it("mỗi biểu một sheet, tiêu đề hai tầng, dòng nhóm và dòng Cộng", async () => {
    const tables = buildTables([project("n1", { scopeSnapshot: { proposalTypeCode: "national-level" } }), project("m1"), project("m2", { finance: { totalBudget: 1_500n * MILLION } })], 2025, "H1", {});
    const manual = readManualTables({
      kq3: [{ name: "Hợp tác A", totalBudget: 1274 }],
      kq4: [{ section: "repair", fundSource: "defense", name: "Sửa chữa PTN Sinh hoá", totalInvestment: 300 }],
      kq6: [{ section: "teaching", task: "print", name: "Module hệ tim mạch", printed: "printed", printedCopies: 200, printBudget: 30 }]
    });
    const buffer = await buildKhqsWorkbook({ year: 2025, period: "H1", tables, manual });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["KQ-1", "KQ-2", "KQ-3", "KQ-4", "KQ-6"]);

    const kq1 = workbook.getWorksheet("KQ-1");
    assert.equal(kq1.getCell("A2").value, "KẾT QUẢ THỰC HIỆN CÁC NHIỆM VỤ KH&CN CẤP QUỐC GIA 6 THÁNG ĐẦU NĂM 2025");
    assert.equal(kq1.getCell("F4").value, "Kinh phí (Triệu đồng)");
    assert.equal(kq1.getCell("G5").value, "KP cấp đến năm 2024");
    assert.equal(kq1.getCell("A6").value, "(1)");
    assert.equal(kq1.getCell("B7").value, "Đề tài n1. Mã số: N1");

    const kq2 = workbook.getWorksheet("KQ-2");
    assert.equal(kq2.getCell("A7").value, "I");
    assert.equal(kq2.getCell("B7").value, "NHIỆM VỤ KH&CN CẤP BỘ QUỐC PHÒNG");
    assert.equal(kq2.getCell("F7").value, 4000, "dòng nhóm cộng kinh phí các đề tài trong nhóm");
    const last = kq2.getRow(kq2.rowCount);
    assert.equal(last.getCell(2).value, "Cộng");
    assert.equal(last.getCell(6).value, 4000);

    const kq6 = workbook.getWorksheet("KQ-6");
    const values = [];
    kq6.eachRow((row) => values.push(row.values.slice(1).map((value) => value ?? "")));
    assert.ok(values.some((row) => row[1] === "In ấn 01 tài liệu"));
    assert.ok(values.some((row) => row[1] === "Module hệ tim mạch" && row[7] === 200 && row[10] === 30));
  });
});

/** Prisma giả tối thiểu: approvedProject.findMany trả đề tài mẫu và ghi lại điều kiện lọc; một bảng báo cáo theo kỳ. */
function fakePrisma(projects) {
  const reports = [];
  const audits = [];
  const calls = [];
  const users = { boardhead: { displayName: "Trưởng ban" }, head: { displayName: "Trưởng phòng" } };
  const withUser = (row) => (row ? { ...row, updatedBy: row.updatedById ? users[row.updatedById] ?? null : null } : null);
  return {
    reports, audits, calls,
    approvedProject: { findMany: async (args) => { calls.push(args); return projects; } },
    khqsPeriodicReport: {
      findUnique: async ({ where }) => withUser(reports.find((row) => row.year === where.year_period.year && row.period === where.year_period.period) ?? null),
      create: async ({ data }) => { const row = { id: `r${reports.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data }; reports.push(row); return row; },
      updateMany: async ({ where, data }) => {
        const row = reports.find((item) => item.id === where.id && item.version === where.version);
        if (!row) return { count: 0 };
        Object.assign(row, { ...data, version: row.version + data.version.increment, updatedAt: new Date() });
        return { count: 1 };
      }
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return { id: `a${audits.length}`, ...data, timestamp: new Date() }; } }
  };
}

async function service(projects = [project("m1")]) {
  const { AuditLogService } = await import("../dist/apps/api/auth/audit-log.service.js");
  const prisma = fakePrisma(projects);
  return { prisma, service: new KhqsReportsService(prisma, new AuditLogService(prisma)) };
}

describe("Báo cáo KHQS: phân quyền, lưu, xuất", () => {
  it("chỉ Ban giám đốc, Trưởng phòng KHQS, Trưởng ban QLKH được xem; chỉ Trưởng phòng, Trưởng ban được sửa", async () => {
    assert.equal(canReadKhqsReport(actor("d", "LEADERSHIP_APPROVAL_AUTHORITY")), true);
    assert.equal(canReadKhqsReport(actor("s", "SCIENCE_DEPUTY_DIRECTOR")), true);
    assert.equal(canEditKhqsReport(actor("s", "SCIENCE_DEPUTY_DIRECTOR")), false);
    assert.equal(canEditKhqsReport(actor("head", "RESEARCH_MANAGEMENT_HEAD")), true);
    const { service: reports } = await service();
    for (const role of ["RESEARCH_MANAGEMENT_STAFF", "RESEARCH_MANAGEMENT_DEPUTY_HEAD", "RESEARCH_OVERSIGHT_AUTHORITY", "RESEARCHER_INTERNAL_USER", "SYSTEM_ADMIN"]) {
      await assert.rejects(reports.get(actor("x", role), "2025", "H1"), /Chỉ Ban giám đốc/, role);
    }
    await assert.rejects(reports.get(undefined, "2025", "H1"), /Chỉ Ban giám đốc/);
    await assert.rejects(reports.save(actor("s", "SCIENCE_DEPUTY_DIRECTOR"), "2025", "H1", { version: 0 }), /Chỉ Trưởng phòng KHQS và Trưởng ban QLKH được sửa/);
  });

  it("truy vấn lọc theo kỳ trong cơ sở dữ liệu, chỉ chọn trường cần; Trưởng phòng bị giới hạn theo phạm vi đơn vị", async () => {
    const { prisma, service: reports } = await service();
    await reports.get(actor("head", "RESEARCH_MANAGEMENT_HEAD", ["unit-1", "unit-2"]), "2025", "H1");
    const [args] = prisma.calls;
    assert.deepEqual(args.where.hostOrganizationUnitId, { in: ["unit-1", "unit-2"] });
    assert.deepEqual(args.where.AND[0], { OR: [{ startDate: null }, { startDate: { lte: D("2025-06-30") } }] });
    assert.ok(args.select && !args.include, "chọn trường, không nạp cả bản ghi");
    assert.deepEqual(args.select.reports.take, 1);
    assert.deepEqual(args.select.disbursements.where, { disbursedDate: { not: null, lte: D("2025-06-30") } });
    await reports.get(actor("d", "LEADERSHIP_APPROVAL_AUTHORITY", []), "2025", "FY");
    assert.equal(prisma.calls[1].where.hostOrganizationUnitId, undefined, "Ban giám đốc xem toàn Học viện");
  });

  it("lưu theo phiên bản: bản mở cũ bị từ chối (409), lưu xong trả về báo cáo đã cập nhật và ghi nhật ký", async () => {
    const { prisma, service: reports } = await service();
    const head = actor("head", "RESEARCH_MANAGEMENT_HEAD");
    const first = await reports.save(head, "2025", "H1", { version: 0, narrative: { situation: "Tình hình ổn định." }, manual: { kq3: [{ name: "Hợp tác A" }] }, overrides: { m1: { note: "Đã cấp hết KP" } } });
    assert.equal(first.version, 1);
    assert.equal(first.narrative.situation, "Tình hình ổn định.");
    assert.equal(first.manual.kq3[0].name, "Hợp tác A");
    assert.equal(first.tables.kq2[0].rows[0].note, "Đã cấp hết KP");
    assert.equal(first.updatedByName, "Trưởng phòng");
    await assert.rejects(reports.save(head, "2025", "H1", { version: 0, narrative: {} }), (error) => error.status === 409 || /vừa được người khác lưu/.test(error.message));
    const second = await reports.save(actor("boardhead", "RESEARCH_BOARD_HEAD"), "2025", "H1", { version: 1, narrative: { situation: "Bản sửa." } });
    assert.equal(second.version, 2);
    assert.equal(second.manual.kq3.length, 0, "lưu cả kỳ một lần: biểu không gửi lên là biểu trống");
    assert.equal(prisma.reports.length, 1);
    assert.deepEqual(prisma.audits.map((row) => row.action), ["khqs-report-save", "khqs-report-save"]);
    await assert.rejects(reports.save(head, "2025", "H1", { version: 2, manual: { kq4: [{ section: "x" }] } }), /danh sách cho phép/);
  });

  it("xuất Excel ghi nhật ký và đặt tên tệp theo kỳ", async () => {
    const { prisma, service: reports } = await service();
    const { buffer, fileName } = await reports.exportExcel(actor("d", "LEADERSHIP_APPROVAL_AUTHORITY", []), "2025", "FY");
    assert.equal(fileName, "Bao_cao_KHQS_nam_2025.xlsx");
    assert.ok(buffer.length > 1000);
    assert.equal(prisma.audits.at(-1).action, "khqs-report-export");
  });
});
