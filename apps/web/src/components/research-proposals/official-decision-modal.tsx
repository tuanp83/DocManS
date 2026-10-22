"use client";

import { useRef } from "react";
import { useModalBehavior } from "@/components/ui/modal-dialog";
import { Printer, X, FileText, FileDown } from "lucide-react";
import { buildDecisionHtml } from "@/lib/decision-document";
import { approvalDecisionDocument } from "@/lib/decision-templates";
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
      decisionNumber?: string | null;
      note?: string | null;
    }> | null;
  };
}

export function OfficialDecisionModal({ isOpen, onClose, proposal }: OfficialDecisionModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(panelRef, onClose, isOpen);

  if (!isOpen) return null;

  // Giá trị lưu là "approved"; chỉ quyết định phê duyệt mới có số, ngày và người ký trên văn bản này.
  const approvedDecision = proposal.decisions?.find((d) => d.decision === "approved");
  const html = buildDecisionHtml(approvalDecisionDocument({ ...proposal, signerName: approvedDecision?.decidedByDisplayName ?? null }));

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quyết định phê duyệt đề tài"
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
              title="Tải văn bản Quyết định dưới dạng file Microsoft Word (.docx)"
            >
              <FileDown size={15} />
              Lưu file Word (.docx)
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

        {/* Cùng một văn bản với bản Word (lib/decision-document.ts): nội dung người dùng đã được escape. */}
        <div
          className="decision-print-paper decision-document"
          style={{
            padding: "40px 48px",
            overflowY: "auto",
            flex: 1,
            fontSize: "14pt",
            lineHeight: 1.4,
            fontFamily: "'Times New Roman', Times, serif",
            color: "#000000",
            background: "#ffffff"
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
