"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useState } from "react";
import { Award, Printer, FileDown } from "lucide-react";
import { OfficialCouncilDecisionModal } from "@/components/research-proposals/official-council-decision-modal";
import type { CouncilMetadata, ResearchProposal } from "@/lib/research-proposals-api";
import { exportCouncilDecisionWord } from "@/lib/word-export";
import { formatDate } from "./evaluation-format";
import { CouncilMinutesForm, type MinutesOutcome } from "./council-minutes-form";

/** Trường hợp A: Hội đồng đã được lãnh đạo phê chuẩn; xem quyết định, thành viên và ghi biên bản họp. */
export function CouncilApprovedView({
  proposalId,
  proposal,
  council,
  contextVersion,
  onMinutesRecorded
}: {
  proposalId: string;
  proposal: ResearchProposal | null;
  council: CouncilMetadata | null | undefined;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  onMinutesRecorded: (outcome: MinutesOutcome) => Promise<void>;
}) {
  const [isCouncilDecisionModalOpen, setIsCouncilDecisionModalOpen] = useState(false);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", fontWeight: 700, fontSize: "15px" }}>
                  <Award size={18} />
                  Quyết định thành lập Hội đồng: {council?.decisionNumber || "ĐÃ BAN HÀNH"}
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#15803d" }}>
                  Ký ban hành ngày: <strong>{council?.decidedAt ? formatDate(council.decidedAt) : "—"}</strong> bởi{" "}
                  <strong>{council?.decidedByName || "Giám đốc Học viện"}</strong>.
                  {council?.approvalNote ? ` — Ý kiến chỉ đạo: "${council.approvalNote}"` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => proposal && exportCouncilDecisionWord(proposal)}
                  title="Tải văn bản Quyết định thành lập Hội đồng (.docx)"
                >
                  <FileDown size={15} /> Lưu Quyết định HĐ (Word)
                </button>
                <button
                  type="button"
                  className="button primary"
                  style={{ background: "#15803d", borderColor: "#15803d", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => setIsCouncilDecisionModalOpen(true)}
                >
                  <Printer size={15} /> Xem & In Quyết định thành lập HĐ
                </button>
              </div>
            </div>

            {/* Bảng thành viên Hội đồng chính thức */}
            <div>
              <span style={{ fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "8px", color: "#1e293b" }}>
                Danh sách thành viên Hội đồng chính thức:
              </span>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", width: "150px" }}>Trách nhiệm</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Họ và tên</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Học hàm, học vị</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Đơn vị công tác</th>
                  </tr>
                </thead>
                <tbody>
                  {council?.members?.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: m.role === "chair" ? "#15803d" : "#334155" }}>
                        {m.roleLabel}
                      </td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{m.displayName}</td>
                      <td style={{ padding: "8px 10px", color: "#64748b" }}>{m.academicTitle || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#64748b" }}>{m.unit || m.organization || "Học viện Quân y"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

        <CouncilMinutesForm proposalId={proposalId} proposal={proposal} council={council} contextVersion={contextVersion} onRecorded={onMinutesRecorded} />
      </div>

      {/* Modal văn bản Quyết định thành lập Hội đồng */}
      {proposal && (
        <OfficialCouncilDecisionModal isOpen={isCouncilDecisionModalOpen} onClose={() => setIsCouncilDecisionModalOpen(false)} proposal={proposal} />
      )}
    </>
  );
}
