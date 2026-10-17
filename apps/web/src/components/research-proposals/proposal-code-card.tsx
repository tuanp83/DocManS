"use client";

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { blockedProposalAction, canPerformProposalAction, updateProposalCode, type ProposalCapabilityState, type ResearchProposal } from "@/lib/research-proposals-api";

/**
 * Mã số đề tài: hệ thống cấp khi nộp lần đầu (<năm>-<mã đơn vị>-<số thứ tự>). Chuyên viên phụ trách hoặc Trưởng ban
 * sửa được, kèm lý do, cho tới trước khi lãnh đạo quyết định (sau đó mã đã in trên quyết định phê duyệt).
 */
export function ProposalCodeCard({ proposal, capabilityState, onSaved }: { proposal: ResearchProposal; capabilityState: ProposalCapabilityState; onSaved: (message: string) => Promise<void> }) {
  const canUpdate = canPerformProposalAction(capabilityState, "proposal.code.update");
  const [code, setCode] = useState(proposal.code ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proposal.viewerAuthorization) return;
    setSaving(true);
    setError(null);
    try {
      await updateProposalCode(proposal.id, code.trim(), reason.trim(), proposal.viewerAuthorization.contextVersion);
      setReason("");
      await onSaved(`Đã đổi mã số đề tài thành ${code.trim()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không đổi được mã số đề tài.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="Mã số đề tài" subtitle="Cấp tự động khi nộp lần đầu; sửa được trước khi lãnh đạo quyết định">
      <p className="record-title">{proposal.code || "Chưa cấp mã"}</p>
      {canUpdate ? (
        <form className="admin-form compact-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>Mã số mới</span>
            <input value={code} maxLength={50} required onChange={(event) => setCode(event.target.value)} />
          </label>
          <label className="field">
            <span>Lý do sửa</span>
            <textarea rows={2} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button primary" type="submit" disabled={saving || !code.trim() || !reason.trim() || code.trim() === proposal.code}>
            <Save size={16} aria-hidden="true" />
            {saving ? "Đang lưu" : "Lưu mã số"}
          </button>
        </form>
      ) : (
        <p className="record-meta">{blockedProposalAction(capabilityState, "proposal.code.update")?.reason ?? "Mã số do chuyên viên phụ trách hồ sơ quản lý."}</p>
      )}
    </SectionCard>
  );
}
