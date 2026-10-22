import { describe, expect, it } from "vitest";
import { buildDecisionHtml, decisionNumberLine, signerLine } from "@/lib/decision-document";
import { approvalDecisionDocument, councilDecisionDocument, productPanelDecisionDocument } from "@/lib/decision-templates";

// Quyết định theo mẫu QĐ 4626/QĐ-HVQY (thành lập Tổ thẩm định, đánh giá sản phẩm KH&CN).

const project = { code: "ĐTCS.27.2026", title: "Nghiên cứu thiết kế phần mềm hỗ trợ quản lý và điều phối trong ứng phó với thảm họa của các phân đội y tế cơ động", piName: "Đại tá, TS. Nguyễn Tiến Dũng", unitName: "Bệnh viện Bỏng Quốc gia Lê Hữu Trác" };

describe("thể thức quyết định", () => {
  it("dòng người ký: cấp bậc và họ tên, bỏ học hàm học vị", () => {
    expect(signerLine("Trung tướng, GS. TS. Trần Viết Tiến")).toBe("Trung tướng Trần Viết Tiến");
    expect(signerLine("Thiếu tướng Nguyễn Văn A")).toBe("Thiếu tướng Nguyễn Văn A");
    expect(signerLine("PGS. TS. Lê B")).toBe("Lê B");
    expect(signerLine(null)).toBe("");
  });

  it("số quyết định: giữ ký hiệu đã có, thêm /QĐ-HVQY khi chỉ có số, để trống khi chưa cấp", () => {
    expect(decisionNumberLine("4626")).toBe("Số: 4626 /QĐ-HVQY");
    expect(decisionNumberLine("123/QĐ-HVQY")).toBe("Số: 123/QĐ-HVQY");
    expect(decisionNumberLine("")).toMatch(/^Số:(&nbsp;)+\/QĐ-HVQY$/);
  });

  it("Tổ thẩm định: trích yếu, căn cứ, Điều 1–4, nơi nhận và hai phụ lục như mẫu", () => {
    const html = buildDecisionHtml(productPanelDecisionDocument({
      project,
      products: [{ title: "Phần mềm hỗ trợ điều phối", productForm: 2, requirements: "Chạy trên máy chủ nội bộ" }],
      members: [{ fullName: "Nguyễn Văn C", academicTitle: "TS.", unit: "Khoa CNTT", role: "MEMBER" }, { fullName: "Trần Văn D", academicTitle: "PGS. TS.", unit: "Phòng KHQS", role: "LEADER" }],
      reviewDate: "2026-09-20",
      location: "Phòng họp số 1"
    }));
    for (const text of [
      "BỘ QUỐC PHÒNG", "HỌC VIỆN QUÂN Y", "CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM", "Độc lập - Tự do - Hạnh phúc", "QUYẾT ĐỊNH", "GIÁM ĐỐC HỌC VIỆN QUÂN Y",
      "Về việc thành lập Tổ thẩm định, đánh giá sản phẩm KH&amp;CN của đề tài: “Nghiên cứu thiết kế phần mềm",
      "Mã số: ĐTCS.27.2026",
      "Căn cứ Thông tư số 14/2022/TT-BQP ngày 01/02/2022 của Bộ Quốc phòng Ban hành Điều lệ Công tác khoa học và công nghệ Quân đội nhân dân Việt Nam;",
      "Căn cứ Quy chế quản lý hoạt động khoa học và công nghệ số 5379/QC-HVQY ngày 23/12/2023 của Học viện Quân y;",
      "Căn cứ Hợp đồng số", "Theo đề nghị của Trưởng phòng Khoa học Quân sự.", "QUYẾT ĐỊNH:",
      "<b>Điều 1.</b> Thành lập Tổ thẩm định", "Chủ nhiệm đề tài: Đại tá, TS. Nguyễn Tiến Dũng; Đơn vị: Bệnh viện Bỏng Quốc gia Lê Hữu Trác/Học viện Quân y", "(Danh sách Phụ lục I kèm theo)",
      "<b>Điều 2.</b> Tổ có nhiệm vụ", "(Danh mục sản phẩm Phụ lục II kèm theo)", "Tổ tự giải thể sau khi hoàn thành nhiệm vụ.", "Đồng chí Tổ trưởng chịu trách nhiệm trước Giám đốc Học viện",
      "<b>Điều 3.</b> Phòng Khoa học Quân sự, Chủ nhiệm đề tài có trách nhiệm chuẩn bị đầy đủ hồ sơ",
      "<b>Điều 4.</b> Quyết định này có hiệu lực kể từ ngày ký.",
      "- Đ/c Giám đốc, Chính ủy HV;", "- Thành viên Tổ Thẩm định;", "- J6, Chủ nhiệm đề tài;", "- Lưu: VT, QLKHQS/J6.",
      "Phụ lục I", "DANH SÁCH TỔ THẨM ĐỊNH, ĐÁNH GIÁ SẢN PHẨM KH&amp;CN", "Phụ lục II", "Phần mềm hỗ trợ điều phối", "Dạng 2", "ngày 20/9/2026 tại Phòng họp số 1"
    ]) expect(html).toContain(text);
    expect(html.indexOf("Trần Văn D")).toBeLessThan(html.indexOf("Nguyễn Văn C"));
    expect(html).toContain(">Tổ trưởng<");
    expect(html.match(/page-break-before: always/g)).toHaveLength(2);
    expect(html).not.toContain("Đã ký và đóng dấu");
    expect(html).not.toContain("57/2021");
  });

  it("Hội đồng tư vấn: số, ngày, người ký thật; danh sách sang Phụ lục I", () => {
    const html = buildDecisionHtml(councilDecisionDocument({
      code: "HVQY-2027-01", title: "Đề tài <A> & B", ownerDisplayName: "Thượng tá, PGS. TS. Đỗ Minh Trung", hostOrganizationUnitName: "Khoa Nội",
      councilMetadata: { decisionNumber: "15/QĐ-HVQY", decidedAt: "2026-09-09T03:00:00.000Z", decidedByName: "Trung tướng, GS. TS. Trần Viết Tiến", decidedByRole: "LEADERSHIP_APPROVAL_AUTHORITY", members: [{ displayName: "Lê E", academicTitle: "GS. TS.", unit: "Khoa Nội", roleLabel: "Chủ tịch" }] }
    }));
    expect(html).toContain("Số: 15/QĐ-HVQY");
    expect(html).toContain("Hà Nội, ngày 09 tháng 9 năm 2026");
    expect(html).toContain("“Đề tài &lt;A&gt; &amp; B”");
    expect(html).not.toContain("<A>");
    expect(html).toContain("Trung tướng Trần Viết Tiến");
    expect(html).toContain("Đồng chí Chủ tịch Hội đồng chịu trách nhiệm");
    expect(html).toContain("DANH SÁCH HỘI ĐỒNG TƯ VẤN TUYỂN CHỌN, ĐÁNH GIÁ XÉT DUYỆT THUYẾT MINH ĐỀ TÀI");
    expect(html).toContain("(Kèm theo Quyết định số 15/QĐ-HVQY ngày 09/9/2026 của Giám đốc Học viện Quân y)");
    const deputy = buildDecisionHtml(councilDecisionDocument({ title: "X", councilMetadata: { decidedByRole: "SCIENCE_DEPUTY_DIRECTOR" } }));
    expect(deputy).toContain(">KT. GIÁM ĐỐC<");
    expect(deputy).toContain(">PHÓ GIÁM ĐỐC<");
  });

  it("phê duyệt đề tài: kinh phí bằng số và bằng chữ; chưa phê duyệt thì để trống số, ngày, người ký", () => {
    const html = buildDecisionHtml(approvalDecisionDocument({ code: "HVQY-1", title: "Đề tài 1", ownerDisplayName: "TS. A", hostOrganizationUnitName: "Khoa Nội", budgetMetadata: { amount: 480_000_000 }, startDate: "2026-01-01", endDate: "2027-12-31" }));
    expect(html).toContain("480.000.000 đồng");
    expect(html).toContain("Bằng chữ:");
    expect(html).toContain("Thời gian thực hiện: từ 01/1/2026 đến 31/12/2027");
    expect(html).toMatch(/Số:(&nbsp;)+\/QĐ-HVQY/);
    expect(html).toMatch(/Hà Nội, ngày(&nbsp;)+ tháng/);
    expect(html).toContain("- Phòng Tài chính;");
  });
});
