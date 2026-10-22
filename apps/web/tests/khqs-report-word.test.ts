import { describe, expect, it } from "vitest";
import { buildKhqsAppendixHtml, buildKhqsReportHtml } from "@/lib/khqs-report-word";
import type { KhqsReport, KhqsReportDraft, KhqsReportRow } from "@/lib/khqs-report-api";

const row = (projectId: string, overrides: Partial<KhqsReportRow> = {}): KhqsReportRow => ({
  projectId, level: "ministry-level", name: `Đề tài ${projectId}. Mã số: ${projectId.toUpperCase()}`, code: projectId.toUpperCase(), hostAndPi: "Khoa Nội; TS. A",
  period: "03/2022 – 02/2024 (gia hạn 02/2025)", result: "Đã hoàn thiện hồ sơ.", suggestedResult: "Đã hoàn thiện hồ sơ.", totalBudget: 2500, allocatedBeforeYear: 2500, allocatedInYear: null, note: "", edited: false,
  ...overrides
});

const report: KhqsReport = {
  year: 2025, period: "H1", periodLabel: "6 tháng đầu năm 2025", nextPeriodLabel: "6 tháng cuối năm 2025", generatedAt: "2025-07-01T00:00:00.000Z",
  canEdit: true, version: 1, updatedAt: null, updatedByName: null, narrative: {}, manual: { kq3: [], kq4: [], kq6: [] }, overrides: {},
  tables: { kq1: [], kq2: [] }, facts: { total: 2 }, suggestions: { management: "Trong 6 tháng đầu năm 2025, Học viện quản lý 2 nhiệm vụ KH&CN." }
};

const draft = (patch: Partial<KhqsReportDraft> = {}): KhqsReportDraft => ({ version: 1, narrative: {}, manual: { kq3: [], kq4: [], kq6: [] }, overrides: {}, ...patch });

describe("Word báo cáo công tác KHQS", () => {
  it("dựng đủ các mục theo mẫu; mục trống thành dòng chấm, mục quản lý dùng đoạn số liệu tự động", () => {
    const html = buildKhqsReportHtml(report, draft({ narrative: { situation: "Dòng 1\nDòng 2", signerName: "Trung tướng Trần Văn B" } }));
    for (const text of ["BỘ QUỐC PHÒNG", "BÁO CÁO", "Kết quả công tác khoa học quân sự 6 tháng đầu năm 2025;", "nhiệm vụ trọng tâm 6 tháng cuối năm 2025", "Kính gửi: Cục Khoa học quân sự.",
      "I. KẾT QUẢ CÔNG TÁC KHQS 6 THÁNG ĐẦU NĂM 2025", "7. Đánh giá chung", "II. MỘT SỐ NHIỆM VỤ TRỌNG TÂM 6 THÁNG CUỐI NĂM 2025", "Nơi nhận:", "GIÁM ĐỐC", "Trung tướng Trần Văn B"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(">Dòng 1</p>");
    expect(html).toContain(">Dòng 2</p>");
    expect(html).toContain("Học viện quản lý 2 nhiệm vụ KH&amp;CN.");
    expect(html).toContain("…………");
  });

  it("escape dữ liệu người dùng nhập", () => {
    const html = buildKhqsReportHtml(report, draft({ narrative: { situation: "<script>alert(1)</script>", recipient: "Cục \"KHQS\" & Bộ" } }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Cục &quot;KHQS&quot; &amp; Bộ");
  });
});

describe("Word các Biểu KQ", () => {
  it("mỗi biểu một trang, tiêu đề cột gộp nhóm Kinh phí, dòng nhóm KQ-2 cộng kinh phí, dòng Cộng", () => {
    const rows = { kq1: [], kq2: [{ key: "ministry", title: "Nhiệm vụ KH&CN cấp Bộ Quốc phòng", rows: [row("m1"), row("m2", { totalBudget: 1500, allocatedBeforeYear: null })] }] };
    const html = buildKhqsAppendixHtml(report, draft({ manual: { kq3: [], kq4: [], kq6: [{ section: "teaching", task: "print", name: "Module hệ tim mạch", unit: "", compiled: "", appraised: "", printed: "printed", printedCopies: 200, compileBudget: null, printBudget: 30, note: "" }] } }), rows);
    for (const code of ["KQ-1", "KQ-2", "KQ-3", "KQ-4", "KQ-6"]) expect(html).toContain(`BIỂU ${code}`);
    expect(html.match(/page-break-before: always/g)).toHaveLength(4);
    expect(html).toContain('<th colspan="3">Kinh phí (Triệu đồng)</th>');
    expect(html).toContain("KP cấp đến năm 2024");
    expect(html).toContain("NHIỆM VỤ KH&amp;CN CẤP BỘ QUỐC PHÒNG");
    expect(html).toContain(">4.000</td>");
    expect(html).toContain("In ấn 01 tài liệu");
    expect(html).toContain(">200</td>");
  });
});
