"use client";

import { useEffect } from "react";
import { Printer, X, Users, Award, FileDown } from "lucide-react";
import type { CouncilMetadata } from "@/lib/research-proposals-api";
import {
  getProposalLevelLabel,
  getProposalMilitaryScope,
  getProposalMilitaryScopeLabel
} from "@/lib/proposal-classification";
import { exportCouncilDecisionWord } from "@/lib/word-export";

export interface OfficialCouncilDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: {
    id: string;
    code?: string | null;
    title: string;
    proposalTypeCode?: string | null;
    researchFieldCode?: string | null;
    militaryScope?: string | null;
    ownerDisplayName?: string | null;
    hostOrganizationUnitName?: string | null;
    hostOrganizationUnitId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    councilMetadata?: CouncilMetadata | null;
  };
}

function formatDateShort(dateString?: string | null) {
  if (!dateString) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN").format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export function OfficialCouncilDecisionModal({ isOpen, onClose, proposal }: OfficialCouncilDecisionModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const levelLabel = getProposalLevelLabel(proposal.proposalTypeCode);
  const scope = getProposalMilitaryScope(proposal);
  const scopeLabel = getProposalMilitaryScopeLabel(scope);

  const council = proposal.councilMetadata;
  const decisionDate = council?.decidedAt ? new Date(council.decidedAt) : new Date();
  const signatoryName = council?.decidedByName || "GS. TS. Trần Viết Tiến";
  const proposalCode = proposal.code || "HVQY-2026/ĐTTN";
  const decisionNumber = council?.decisionNumber || `QĐ-TLHĐ-${proposalCode.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;
  const members = council?.members || [];

  function handlePrint() {
    window.print();
  }

  return (
    <div
      className="official-decision-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="official-decision-card"
        style={{
          background: "#ffffff",
          color: "#1e293b",
          width: "100%",
          maxWidth: "860px",
          maxHeight: "92vh",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
      >
        {/* Header công cụ */}
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-muted, #f8fafc)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "var(--institutional-green, #15803d)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Users size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                Quyết định Thành lập Hội đồng Đánh giá
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Thể thức văn bản quản lý khoa học quân sự chính thức — Học viện Quân y
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => exportCouncilDecisionWord(proposal)}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
              title="Tải văn bản Quyết định dưới dạng file Microsoft Word (.doc)"
            >
              <FileDown size={15} />
              Lưu file Word (.doc)
            </button>
            <button
              type="button"
              className="button primary"
              onClick={handlePrint}
              style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
            >
              <Printer size={15} />
              In quyết định / Lưu PDF
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              style={{ padding: "6px", borderRadius: "6px" }}
              aria-label="Đóng"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Nội dung văn bản in (Chuẩn thể thức Nghị định 30 & BQP) */}
        <div
          className="decision-print-content"
          style={{
            padding: "40px 48px",
            overflowY: "auto",
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: "14pt",
            lineHeight: "1.45",
            color: "#000000",
            background: "#ffffff"
          }}
        >
          {/* Header Quốc hiệu - Cơ quan ban hành */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              marginBottom: "20px",
              textAlign: "center"
            }}
          >
            {/* Cột trái */}
            <div style={{ paddingRight: "10px" }}>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 700 }}>
                BỘ QUỐC PHÒNG
              </p>
              <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: 700 }}>
                HỌC VIỆN QUÂN Y
              </p>
              <div
                style={{
                  width: "90px",
                  height: "1px",
                  background: "#000",
                  margin: "4px auto 6px"
                }}
              />
              <p style={{ margin: 0, fontSize: "12px" }}>
                Số: {decisionNumber}
              </p>
            </div>

            {/* Cột phải */}
            <div style={{ paddingLeft: "10px" }}>
              <p style={{ margin: 0, fontSize: "12px", fontWeight: 700 }}>
                CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
              </p>
              <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: 700 }}>
                Độc lập - Tự do - Hạnh phúc
              </p>
              <div
                style={{
                  width: "140px",
                  height: "1px",
                  background: "#000",
                  margin: "4px auto 6px"
                }}
              />
              <p style={{ margin: 0, fontSize: "13px", fontStyle: "italic" }}>
                Hà Nội, ngày {decisionDate.getDate()} tháng {decisionDate.getMonth() + 1} năm{" "}
                {decisionDate.getFullYear()}
              </p>
            </div>
          </div>

          {/* Tiêu đề Quyết định */}
          <div style={{ textAlign: "center", margin: "28px 0 20px" }}>
            <h1
              style={{
                fontSize: "17px",
                fontWeight: 800,
                margin: "0 0 6px 0",
                letterSpacing: "0.5px"
              }}
            >
              QUYẾT ĐỊNH
            </h1>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 700,
                margin: "0 0 10px 0"
              }}
            >
              Về việc thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài KH&CN
            </p>
            <div
              style={{
                width: "80px",
                height: "1px",
                background: "#000",
                margin: "0 auto 16px"
              }}
            />
            <h2
              style={{
                fontSize: "15px",
                fontWeight: 800,
                margin: 0
              }}
            >
              GIÁM ĐỐC HỌC VIỆN QUÂN Y
            </h2>
          </div>

          {/* Căn cứ pháp lý */}
          <div style={{ marginBottom: "20px", textAlign: "justify", textIndent: "28px" }}>
            <p style={{ margin: "0 0 6px 0", fontStyle: "italic" }}>
              Căn cứ Điều lệ công tác Khoa học quân sự trong Quân đội nhân dân Việt Nam ban hành kèm
              theo Thông tư số 57/2021/TT-BQP ngày 10 tháng 6 năm 2021 của Bộ trưởng Bộ Quốc phòng;
            </p>
            <p style={{ margin: "0 0 6px 0", fontStyle: "italic" }}>
              Căn cứ Quy chế quản lý các nhiệm vụ khoa học, công nghệ và đổi mới sáng tạo của Học viện
              Quân y;
            </p>
            <p style={{ margin: "0 0 6px 0", fontStyle: "italic" }}>
              Căn cứ hồ sơ thuyết minh đề tài nghiên cứu khoa học: <strong>&ldquo;{proposal.title}&rdquo;</strong> do{" "}
              {proposal.ownerDisplayName || "Chủ nhiệm đề tài"} làm Chủ nhiệm;
            </p>
            <p style={{ margin: 0, fontStyle: "italic" }}>
              Theo đề nghị của đồng chí Trưởng phòng Khoa học quân sự,
            </p>
          </div>

          {/* Quyết định */}
          <div style={{ textAlign: "center", margin: "16px 0", fontWeight: 700, fontSize: "15px" }}>
            QUYẾT ĐỊNH:
          </div>

          {/* Điều 1 */}
          <div style={{ marginBottom: "14px", textAlign: "justify" }}>
            <p style={{ margin: "0 0 6px 0" }}>
              <strong>Điều 1.</strong> Thành lập Hội đồng tư vấn tuyển chọn, đánh giá xét duyệt thuyết minh đề tài nghiên cứu khoa học và phát triển công nghệ:
            </p>
            <div style={{ paddingLeft: "20px", marginBottom: "10px" }}>
              <p style={{ margin: "3px 0" }}>
                - <strong>Tên đề tài:</strong> {proposal.title}
              </p>
              <p style={{ margin: "3px 0" }}>
                - <strong>Mã số:</strong> {proposal.code || "Chưa cấp mã chính thức"}
              </p>
              <p style={{ margin: "3px 0" }}>
                - <strong>Cấp quản lý:</strong> {levelLabel} · Phạm vi: {scopeLabel}
              </p>
              <p style={{ margin: "3px 0" }}>
                - <strong>Chủ nhiệm đề tài:</strong> {proposal.ownerDisplayName || "—"}
              </p>
              <p style={{ margin: "3px 0" }}>
                - <strong>Đơn vị chủ trì:</strong> {proposal.hostOrganizationUnitName || "Học viện Quân y"}
              </p>
            </div>
            <p style={{ margin: "6px 0" }}>
              Hội đồng gồm các đồng chí có tên trong danh sách sau đây:
            </p>

            {/* Bảng danh sách thành viên Hội đồng */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                margin: "12px 0 16px",
                fontSize: "12pt"
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "center", width: "40px" }}>STT</th>
                  <th style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "left" }}>Họ và tên</th>
                  <th style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "left" }}>Học hàm, học vị</th>
                  <th style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "left" }}>Chức vụ, đơn vị công tác</th>
                  <th style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "left", width: "160px" }}>Trách nhiệm trong HĐ</th>
                </tr>
              </thead>
              <tbody>
                {members.length > 0 ? (
                  members.map((m, idx) => (
                    <tr key={idx}>
                      <td style={{ border: "1px solid #000", padding: "6px 8px", textAlign: "center" }}>{idx + 1}</td>
                      <td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: 700 }}>{m.displayName}</td>
                      <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{m.academicTitle || "—"}</td>
                      <td style={{ border: "1px solid #000", padding: "6px 8px" }}>{m.unit || m.organization || "Học viện Quân y"}</td>
                      <td style={{ border: "1px solid #000", padding: "6px 8px", fontWeight: 700 }}>{m.roleLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ border: "1px solid #000", padding: "10px", textAlign: "center", fontStyle: "italic" }}>
                      Chưa có danh sách thành viên Hội đồng chính thức
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Điều 2 */}
          <div style={{ marginBottom: "14px", textAlign: "justify" }}>
            <p style={{ margin: "0 0 6px 0" }}>
              <strong>Điều 2.</strong> Trách nhiệm và quyền hạn của Hội đồng:
            </p>
            <div style={{ paddingLeft: "20px" }}>
              <p style={{ margin: "4px 0" }}>
                1. Đánh giá tính cấp thiết, tính mới, giá trị khoa học và khả năng ứng dụng thực tiễn trong công tác y học quân sự và dã chiến của đề tài.
              </p>
              <p style={{ margin: "4px 0" }}>
                2. Thẩm định năng lực chuyên môn của nhóm nghiên cứu; xem xét dự toán kinh phí và các điều kiện đảm bảo thực hiện đề tài theo định mức hiện hành của Bộ Quốc phòng.
              </p>
              <p style={{ margin: "4px 0" }}>
                3. Hội đồng làm việc theo nguyên tắc tập trung dân chủ, thảo luận công khai và bỏ phiếu đánh giá độc lập theo đúng quy định tại Thông tư 57/2021/TT-BQP.
              </p>
              <p style={{ margin: "4px 0" }}>
                4. Kế hoạch làm việc: Phiên họp dự kiến tổ chức vào ngày <strong>{council?.meetingDate ? formatDateShort(council.meetingDate) : "theo kế hoạch của Phòng KHQS"}</strong> tại <strong>{council?.meetingLocation || "Phòng họp Trung tâm Học viện Quân y"}</strong>.
              </p>
              <p style={{ margin: "4px 0", fontStyle: "italic" }}>
                5. Hội đồng tự giải thể sau khi hoàn thành nhiệm vụ và bàn giao đầy đủ biên bản, hồ sơ đánh giá cho Phòng Khoa học quân sự.
              </p>
            </div>
          </div>

          {/* Điều 3 */}
          <div style={{ marginBottom: "28px", textAlign: "justify" }}>
            <p style={{ margin: "0 0 6px 0" }}>
              <strong>Điều 3.</strong> Đồng chí Trưởng phòng Khoa học quân sự, Thủ trưởng cơ quan chủ trì đề tài và các đồng chí có tên tại Điều 1 chịu trách nhiệm thi hành Quyết định này./.
            </p>
          </div>

          {/* Phần ký tên */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              marginTop: "20px"
            }}
          >
            {/* Nơi nhận */}
            <div style={{ fontSize: "11pt", lineHeight: "1.3" }}>
              <p style={{ margin: "0 0 2px 0", fontWeight: 700, fontStyle: "italic" }}>
                Nơi nhận:
              </p>
              <p style={{ margin: "1px 0" }}>- Như Điều 3;</p>
              <p style={{ margin: "1px 0" }}>- Ban Giám đốc Học viện (để b/c);</p>
              <p style={{ margin: "1px 0" }}>- Phòng KHQS, Phòng Hậu cần - KT, Ban Tài chính;</p>
              <p style={{ margin: "1px 0" }}>- Lưu: VT, KHQS (03b).</p>
            </div>

            {/* Chức vụ và chữ ký */}
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  margin: "0 0 4px 0",
                  fontWeight: 700,
                  fontSize: "13pt",
                  textTransform: "uppercase"
                }}
              >
                GIÁM ĐỐC
              </p>
              <p style={{ margin: 0, fontSize: "11pt", fontStyle: "italic" }}>
                (Đã ký và đóng dấu)
              </p>
              <div style={{ height: "65px" }} />
              <p
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: "13pt"
                }}
              >
                {signatoryName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
