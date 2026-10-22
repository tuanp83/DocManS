import { describe, expect, it } from "vitest";
import { buildDecisionHtml, decisionNumberLine, officialNameFromDisplay, officialTitles, signerLine } from "@/lib/decision-document";
import { approvalDecisionDocument, councilDecisionDocument, productPanelDecisionDocument } from "@/lib/decision-templates";

// Quyết định theo mẫu QĐ 1273/QĐ-HVQY (Hội đồng xét duyệt thuyết minh) và 4626/QĐ-HVQY (Tổ thẩm định sản phẩm).

const project = { code: "ĐTCS.27.2026", title: "Nghiên cứu thiết kế phần mềm hỗ trợ quản lý và điều phối trong ứng phó với thảm họa của các phân đội y tế cơ động", piName: "Đại tá, TS. Nguyễn Tiến Dũng", unitName: "Bệnh viện Bỏng Quốc gia Lê Hữu Trác" };

describe("thể thức quyết định", () => {
  it("tên trong thân văn bản: cấp bậc, học hàm học vị viết \"PGS, TS\", họ tên", () => {
    expect(officialTitles("PGS. TS.")).toBe("PGS, TS");
    expect(officialNameFromDisplay("Thượng tá, TS. Phạm Anh Tuấn")).toBe("Thượng tá, TS Phạm Anh Tuấn");
    expect(officialNameFromDisplay("Thiếu tướng, PGS. TS. Vũ Nhất Định")).toBe("Thiếu tướng, PGS, TS Vũ Nhất Định");
    expect(officialNameFromDisplay("PGS. TS. Lê Đức Hậu")).toBe("PGS, TS Lê Đức Hậu");
    expect(officialNameFromDisplay("PGS, TS Lê Đức Hậu")).toBe("PGS, TS Lê Đức Hậu");
  });

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
      "Căn cứ Thông tư 14/2022/TT-BQP ngày 01/02/2022 của Bộ Quốc phòng ban hành Điều lệ công tác khoa học và công nghệ Quân đội nhân dân Việt Nam;",
      "Căn cứ Quy chế Quản lý hoạt động khoa học và công nghệ số 5379/QC-HVQY ngày 23/12/2023 của Học viện Quân y;",
      "Căn cứ Hợp đồng số", "Theo đề nghị của Trưởng phòng Khoa học Quân sự.", "QUYẾT ĐỊNH:",
      "<b>Điều 1.</b> Thành lập Tổ thẩm định", "Chủ nhiệm đề tài: Đại tá, TS Nguyễn Tiến Dũng; Đơn vị: Bệnh viện Bỏng Quốc gia Lê Hữu Trác, Học viện Quân y", "(Danh sách Phụ lục I kèm theo)",
      "<b>Điều 2.</b> Tổ có nhiệm vụ", "(Danh mục sản phẩm Phụ lục II kèm theo)", "Tổ tự giải thể sau khi hoàn thành nhiệm vụ.", "Đồng chí Tổ trưởng chịu trách nhiệm trước Giám đốc Học viện",
      "<b>Điều 3.</b> Phòng Khoa học Quân sự, Chủ nhiệm đề tài có trách nhiệm chuẩn bị đầy đủ hồ sơ",
      "<b>Điều 4.</b> Quyết định này có hiệu lực kể từ ngày ký.",
      "- Như Điều 1;", "- TT Tiến, TT Thuận, TT Định;", "- Chủ nhiệm đề tài;", "- Lưu: VT, QLKHQS/J6.",
      "Phụ lục I", "DANH SÁCH TỔ THẨM ĐỊNH, ĐÁNH GIÁ SẢN PHẨM KH&amp;CN", "Phụ lục II", "Phần mềm hỗ trợ điều phối", "Dạng 2", "ngày 20/9/2026 tại Phòng họp số 1"
    ]) expect(html).toContain(text);
    expect(html.indexOf("Trần Văn D")).toBeLessThan(html.indexOf("Nguyễn Văn C"));
    expect(html).toContain(">Tổ trưởng<");
    expect(html.match(/page-break-before: always/g)).toHaveLength(2);
    expect(html).not.toContain("Đã ký và đóng dấu");
    expect(html).not.toContain("57/2021");
  });

  it("Hội đồng xét duyệt (mẫu 1273): trích yếu theo cấp và năm, thành viên ghi trong Điều 1, ba điều, nơi nhận mới", () => {
    const html = buildDecisionHtml(councilDecisionDocument({
      code: "HVQY-2026-01", title: "Nghiên cứu <A> & B", ownerDisplayName: "Thượng tá, TS. Phạm Anh Tuấn", hostOrganizationUnitName: "Khoa Toán – Tin học", proposalTypeCode: "academy-level", startDate: "2026-01-01",
      councilMetadata: {
        decisionNumber: "1273/QĐ-HVQY", decidedAt: "2026-04-09T03:00:00.000Z", decidedByName: "Trung tướng, GS. TS. Trần Viết Tiến", decidedByRole: "LEADERSHIP_APPROVAL_AUTHORITY",
        members: [
          { role: "secretary", roleLabel: "Thư ký", displayName: "Nguyễn Minh Phương", academicTitle: "PGS. TS.", militaryRank: "Đại tá", position: "Trưởng phòng Khoa học Quân sự", unit: "Phòng Khoa học Quân sự", profileType: "INTERNAL" },
          { role: "reviewer_1", roleLabel: "Phản biện 1", displayName: "Lê Đức Hậu", academicTitle: "PGS. TS.", position: "Trưởng phòng Thí nghiệm Tin sinh", unit: "Trường Công nghệ Thông tin, Đại học Bách khoa Hà Nội", profileType: "EXTERNAL" },
          { role: "chair", roleLabel: "Chủ tịch", displayName: "Vũ Nhất Định", academicTitle: "PGS. TS.", militaryRank: "Thiếu tướng", position: "Phó Giám đốc Học viện Quân y", unit: "Ban Giám đốc", profileType: "INTERNAL" },
          { role: "member", roleLabel: "Ủy viên", displayName: "Hoàng Anh Tuấn", academicTitle: "ThS.", militaryRank: "Thượng tá", unit: "Ban Công nghệ thông tin", profileType: "INTERNAL" }
        ]
      }
    }));
    for (const text of [
      "Số: 1273/QĐ-HVQY", "Hà Nội, ngày 09 tháng 4 năm 2026",
      "Về việc thành lập Hội đồng xét duyệt thuyết minh nhiệm vụ<br/>khoa học và công nghệ cấp Học viện năm 2026",
      "Căn cứ Luật Khoa học, công nghệ và Đổi mới sáng tạo số 93/2025/QH15 ngày 27/6/2025;",
      "Căn cứ Thông tư 05/2024/TT-BQP Quy định tuyển chọn, giao trực tiếp đơn vị, cá nhân thực hiện nhiệm vụ khoa học và công nghệ cấp Bộ Quốc phòng;",
      "<b>Điều 1.</b> Thành lập Hội đồng xét duyệt thuyết minh nhiệm vụ Khoa học và công nghệ cấp Học viện thực hiện năm 2026:",
      "<b>Tên đề tài:</b> Nghiên cứu &lt;A&gt; &amp; B.", "<b>Chủ nhiệm đề tài:</b> Thượng tá, TS Phạm Anh Tuấn.", "<b>Đơn vị:</b> Khoa Toán – Tin học, Học viện Quân y.",
      "Học viện Quân y mời và giao nhiệm vụ cho các đồng chí sau tham gia Hội đồng:",
      "1. Thiếu tướng, PGS, TS Vũ Nhất Định, Phó Giám đốc Học viện Quân y: Chủ tịch Hội đồng.",
      "2. PGS, TS Lê Đức Hậu, Trưởng phòng Thí nghiệm Tin sinh, Trường Công nghệ Thông tin, Đại học Bách khoa Hà Nội: Ủy viên phản biện 1.",
      "3. Thượng tá, ThS Hoàng Anh Tuấn, Ban Công nghệ thông tin, Học viện Quân y: Ủy viên.",
      "4. Đại tá, PGS, TS Nguyễn Minh Phương, Trưởng phòng Khoa học Quân sự, Học viện Quân y: Ủy viên, Thư ký khoa học.",
      "Đồng chí Chủ tịch Hội đồng được phép ký những văn bản do Hội đồng ban hành",
      "Hội đồng tự giải thể sau khi hoàn thành nhiệm vụ.",
      "<b>Điều 3.</b> Trưởng phòng Khoa học Quân sự, các cơ quan đơn vị liên quan, Chủ nhiệm đề tài và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành quyết định này./.",
      "- Như Điều 1;", "- TT Tiến, TT Thuận, TT Định;", "- Chủ nhiệm đề tài;", "- Lưu: VT, QLKHQS/J6.", "Trung tướng Trần Viết Tiến"
    ]) expect(html).toContain(text);
    expect(html).not.toContain("<A>");
    expect(html).not.toContain("Điều 4.");
    expect(html).not.toContain("page-break-before");
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
