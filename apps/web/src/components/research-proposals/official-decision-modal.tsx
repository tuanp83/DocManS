"use client";

import { useEffect } from "react";
import { Printer, X, FileText, FileDown } from "lucide-react";
import { formatVndNumber, numberToVietnameseWords } from "@/lib/vietnamese-currency";
import {
  getProposalLevelLabel,
  getProposalMilitaryScope,
  getProposalMilitaryScopeLabel
} from "@/lib/proposal-classification";
import { exportProposalApprovalDecisionWord } from "@/lib/word-export";

export interface OfficialDecisionModalProps {
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
    budgetMetadata?: {
      amount?: number | string | null;
      currency?: string | null;
      note?: string | null;
    } | null;
    decisions?: Array<{
      id: string;
      decision: string;
      decisionLabel: string;
      decidedAt: string;
      decidedByDisplayName?: string | null;
      note?: string | null;
    }> | null;
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

function calculateDurationMonths(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 12;
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 12;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, Math.round(diffDays / 30));
  } catch {
    return 12;
  }
}

export function OfficialDecisionModal({ isOpen, onClose, proposal }: OfficialDecisionModalProps) {
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

  const amount = Number(proposal.budgetMetadata?.amount ?? 0);
  const amountWords = numberToVietnameseWords(amount);
  const levelLabel = getProposalLevelLabel(proposal.proposalTypeCode);
  const scope = getProposalMilitaryScope(proposal);
  const scopeLabel = getProposalMilitaryScopeLabel(scope);
  const durationMonths = calculateDurationMonths(proposal.startDate, proposal.endDate);

  const approvedDecision = proposal.decisions?.find((d) => d.decision === "approve") || proposal.decisions?.[0];
  const decisionDate = approvedDecision?.decidedAt ? new Date(approvedDecision.decidedAt) : new Date();
  const signatoryName = approvedDecision?.decidedByDisplayName || "GS. TS. Trần Viết Tiến";
  const proposalCode = proposal.code || "HVQY-2026/ĐTTN";
  const decisionNumber = `QĐ-${proposalCode.replace(/[^a-zA-Z0-9]/g, "")}/HVQY`;

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
        className="official-decision-modal-container"
        style={{
          background: "var(--surface, #ffffff)",
          color: "var(--text-primary, #0f172a)",
          width: "100%",
          maxWidth: "880px",
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
              <FileText size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                Văn bản Quyết định Phê duyệt Đề tài
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
              onClick={() => exportProposalApprovalDecisionWord(proposal)}
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

        {/* Nội dung văn bản quyết định (khổ giấy chuẩn hành chính A4) */}
        <div
          className="decision-print-paper"
          style={{
            padding: "40px 48px",
            overflowY: "auto",
            flex: 1,
            fontSize: "14px",
            lineHeight: 1.6,
            fontFamily: "'Times New Roman', Times, serif",
            color: "#111827",
            background: "#ffffff"
          }}
        >
          {/* Header 2 cột theo thể thức văn bản quân đội */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "24px"
            }}
          >
            <div style={{ textAlign: "center", width: "42%" }}>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>BỘ QUỐC PHÒNG</p>
              <p style={{ margin: "2px 0 0 0", fontSize: "13px", fontWeight: 700 }}>
                HỌC VIỆN QUÂN Y
              </p>
              <div
                style={{
                  width: "100px",
                  height: "1px",
                  background: "#000",
                  margin: "4px auto 6px"
                }}
              />
              <p style={{ margin: 0, fontSize: "12px", fontStyle: "italic" }}>
                Số: {decisionNumber}
              </p>
            </div>

            <div style={{ textAlign: "center", width: "55%" }}>
              <p style={{ margin: 0, fontSize: "13px", fontWeight: 700 }}>
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
              Về việc phê duyệt đề tài nghiên cứu khoa học và phát triển công nghệ
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
              Căn cứ Biên bản đánh giá, nghiệm thu hồ sơ thuyết minh của Hội đồng tư vấn tuyển chọn
              nhiệm vụ KH&CN;
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
              <strong>Điều 1.</strong> Phê duyệt đề tài nghiên cứu khoa học và phát triển công nghệ với
              các nội dung chủ yếu sau:
            </p>
            <div style={{ paddingLeft: "24px" }}>
              <p style={{ margin: "3px 0" }}>
                1. <strong>Tên đề tài:</strong> {proposal.title}
              </p>
              <p style={{ margin: "3px 0" }}>
                2. <strong>Mã số đề tài:</strong> {proposal.code || "Chưa cấp mã chính thức"}
              </p>
              <p style={{ margin: "3px 0" }}>
                3. <strong>Cấp quản lý đề tài:</strong> {levelLabel}
              </p>
              <p style={{ margin: "3px 0" }}>
                4. <strong>Tính chất nhiệm vụ:</strong> {scopeLabel}
              </p>
              <p style={{ margin: "3px 0" }}>
                5. <strong>Chủ nhiệm đề tài (PI):</strong> {proposal.ownerDisplayName || "—"}
              </p>
              <p style={{ margin: "3px 0" }}>
                6. <strong>Cơ quan, đơn vị chủ trì:</strong>{" "}
                {proposal.hostOrganizationUnitName || proposal.hostOrganizationUnitId || "Học viện Quân y"}
              </p>
              <p style={{ margin: "3px 0" }}>
                7. <strong>Thời gian thực hiện:</strong> {durationMonths} tháng (Từ{" "}
                {formatDateShort(proposal.startDate)} đến {formatDateShort(proposal.endDate)})
              </p>
            </div>
          </div>

          {/* Điều 2 */}
          <div style={{ marginBottom: "14px", textAlign: "justify" }}>
            <p style={{ margin: "0 0 6px 0" }}>
              <strong>Điều 2.</strong> Phê duyệt dự toán kinh phí thực hiện đề tài:
            </p>
            <div style={{ paddingLeft: "24px" }}>
              <p style={{ margin: "3px 0" }}>
                - <strong>Tổng kinh phí:</strong>{" "}
                <span style={{ fontWeight: 700 }}>{formatVndNumber(amount)} đồng</span> (Bằng chữ:{" "}
                <em>{amountWords || "Không đồng"}</em>).
              </p>
              <p style={{ margin: "3px 0" }}>
                - <strong>Nguồn kinh phí:</strong>{" "}
                {proposal.budgetMetadata?.note || "Ngân sách sự nghiệp Khoa học và Công nghệ"}
              </p>
              <p style={{ margin: "3px 0", fontStyle: "italic", fontSize: "13px" }}>
                Kinh phí đề tài được cấp phát, quản lý, thanh quyết toán theo đúng các quy định, định
                mức tài chính hiện hành của Nhà nước và Bộ Quốc phòng.
              </p>
            </div>
          </div>

          {/* Điều 3 */}
          <div style={{ marginBottom: "28px", textAlign: "justify" }}>
            <p style={{ margin: "0 0 6px 0" }}>
              <strong>Điều 3. Trách nhiệm thi hành:</strong>
            </p>
            <div style={{ paddingLeft: "24px" }}>
              <p style={{ margin: "3px 0" }}>
                1. Chủ nhiệm đề tài và đơn vị chủ trì có trách nhiệm tổ chức triển khai thực hiện đúng
                mục tiêu, nội dung thuyết minh đã được phê duyệt; bảo đảm tiến độ, an toàn, chất lượng
                và hiệu quả ứng dụng thực tiễn.
              </p>
              <p style={{ margin: "3px 0" }}>
                2. Phòng Khoa học quân sự có trách nhiệm theo dõi, kiểm tra, đôn đốc tiến độ thực hiện
                và tổ chức đánh giá định kỳ theo quy chế. Ban Tài chính hướng dẫn thủ tục mở tài khoản,
                cấp phát và thanh quyết toán kinh phí theo quy định.
              </p>
              <p style={{ margin: "3px 0" }}>
                3. Đồng chí Trưởng phòng Khoa học quân sự, Trưởng ban Tài chính, Thủ trưởng các cơ
                quan, đơn vị có liên quan và Chủ nhiệm đề tài chịu trách nhiệm thi hành Quyết định này./.
              </p>
            </div>
          </div>

          {/* Nơi nhận & Ký tên */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginTop: "20px",
              pageBreakInside: "avoid"
            }}
          >
            <div style={{ width: "42%", fontSize: "12px", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 4px 0", fontWeight: 700, fontStyle: "italic" }}>Nơi nhận:</p>
              <p style={{ margin: "1px 0" }}>- Ban Giám đốc Học viện (để b/c);</p>
              <p style={{ margin: "1px 0" }}>- Phòng Khoa học quân sự (để t/h);</p>
              <p style={{ margin: "1px 0" }}>- Ban Tài chính (để p/h);</p>
              <p style={{ margin: "1px 0" }}>- Đơn vị chủ trì;</p>
              <p style={{ margin: "1px 0" }}>- Chủ nhiệm đề tài;</p>
              <p style={{ margin: "1px 0" }}>- Lưu: VT, KHQS.</p>
            </div>

            <div style={{ width: "50%", textAlign: "center" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "14px" }}>GIÁM ĐỐC</p>
              <p style={{ margin: "4px 0 65px 0", fontStyle: "italic", fontSize: "12px" }}>
                (Đã ký và đóng dấu)
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "14px" }}>{signatoryName}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
