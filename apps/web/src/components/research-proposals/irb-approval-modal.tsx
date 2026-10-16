"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useModalBehavior } from "@/components/ui/modal-dialog";
import { AlertCircle, CheckCircle2, FileText, HeartPulse, Send, ShieldCheck, Trash2, Users, X } from "lucide-react";
import {
  approveIrbCouncil,
  fetchIRBInfo,
  IRB_COMPOSITION,
  IRB_RISK_LABELS,
  IRB_ROLE_LABELS,
  loadCouncilCandidates,
  proposeIrbCouncil,
  rejectIrbCouncil,
  returnIrbConclusion,
  submitIrbConclusion,
  updateIRBStatus,
  type CouncilCandidate,
  type IRBInfo,
  type IRBMember,
  type IrbRole
} from "@/lib/proposal-evaluations-api";
import { exportIrbCertificateWord, type ProposalExportData } from "@/lib/word-export";
import { RoutingStatus } from "@/components/approvals/routing-status";
import "@/styles/council-modals.css";
import { useAskReason } from "@/components/ui/confirm-dialog";

const ROLES: IrbRole[] = ["chair", "secretary", "reviewer", "member"];
const COUNCIL_STATUS_LABELS: Record<string, string> = {
  draft: "Đang soạn",
  submitted: "Đang trình",
  returned: "Bị Phòng KHQS trả lại",
  rejected: "Ban giám đốc trả lại",
  approved: "Đã ký thành lập"
};
const CONCLUSION_STATUS_LABELS: Record<string, string> = {
  draft: "Thư ký đang soạn",
  finalized: "Thư ký đã chốt, chờ chuyên viên trình",
  submitted: "Đang trình Ban giám đốc",
  returned: "Bị trả lại, thư ký sửa",
  signed: "Đã ký cấp giấy"
};
const MEMBER_STATUS_COLORS: Record<string, string> = { invited: "#b45309", accepted: "#15803d", declined: "#b91c1c", active: "#166534" };

const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");
const vnDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

/** Đếm theo vai trò, so với quy định (hiện cạnh danh sách để chuyên viên biết còn thiếu gì). */
export function irbCompositionSummary(members: Array<{ role: IrbRole }>) {
  return ROLES.map((role) => {
    const count = members.filter((member) => member.role === role).length;
    const { min, max } = IRB_COMPOSITION[role];
    return { role, count, ok: count >= min && count <= max, text: `${IRB_ROLE_LABELS[role]} ${count}/${min === max ? min : `${min}–${max}`}` };
  });
}

/**
 * Quản lý Hội đồng Đạo đức (IRB) cho chuyên viên phụ trách / Trưởng phòng và Ban giám đốc. Nút hiện theo `viewer` do
 * máy chủ trả về; máy chủ kiểm tra lại mọi quyền. Thành viên hội đồng nhận lời mời, nhận xét và lập kết luận ở trang
 * hồ sơ (IrbMemberPanel).
 */
export function IRBApprovalModal({
  isOpen,
  onClose,
  proposal,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  proposal: { id: string; code?: string; title: string; ownerDisplayName?: string; hostOrganizationUnit?: string; hostOrganizationUnitName?: string };
  onSuccess?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(panelRef, onClose, isOpen);
  const askReason = useAskReason();
  const [info, setInfo] = useState<IRBInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [members, setMembers] = useState<IRBMember[]>([]);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [candidates, setCandidates] = useState<CouncilCandidate[]>([]);
  const [pickId, setPickId] = useState("");
  const [pickRole, setPickRole] = useState<IrbRole>("member");
  const [decisionNumber, setDecisionNumber] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [decisionDate, setDecisionDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [refreshKey, setRefreshKey] = useState("");

  async function load() {
    try {
      const data = await fetchIRBInfo(proposal.id);
      setInfo(data);
      setLoadError("");
      setMembers(data.irb.council?.members ?? []);
      setMeetingDate(toDateInput(data.irb.council?.meetingDate));
      setMeetingLocation(data.irb.council?.meetingLocation ?? "");
      setRefreshKey(JSON.stringify([data.irb.council?.status, data.irb.conclusion?.status, !!data.irb.certificate]));
      if (data.viewer.isCoordinator && !candidates.length) {
        loadCouncilCandidates(proposal.id).then((result) => setCandidates(result.candidates.filter((item) => item.userId && !item.isConflicted))).catch(() => undefined);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không tải được thông tin Hội đồng IRB.");
    }
  }

  useEffect(() => {
    if (isOpen) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tải lại khi mở modal hoặc đổi hồ sơ
  }, [isOpen, proposal.id]);

  const statusOf = useMemo(() => {
    const rows = info?.memberStatuses ?? [];
    return (member: IRBMember) => rows.find((row) => row.userId === member.userId && row.role === member.role) ?? null;
  }, [info]);

  if (!isOpen) return null;

  const irb = info?.irb;
  const viewer = info?.viewer;
  const councilStatus = irb?.council?.status ?? "draft";
  const editable = !!viewer?.isCoordinator && ["draft", "returned", "rejected"].includes(councilStatus) && !irb?.certificate;
  const conclusion = irb?.conclusion ?? null;
  const certificate = irb?.certificate ?? null;
  const summary = irbCompositionSummary(members);

  async function run(action: () => Promise<{ contextVersion?: unknown } | unknown>, success: string) {
    setSaving(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: success });
      await load();
      onSuccess?.();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Thao tác không thành công." });
    } finally {
      setSaving(false);
    }
  }

  function addMember() {
    const candidate = candidates.find((item) => item.userId === pickId);
    if (!candidate?.userId) return;
    if (members.some((member) => member.userId === candidate.userId)) {
      setMessage({ type: "error", text: `${candidate.fullName} đã có trong danh sách.` });
      return;
    }
    setMembers([...members, { userId: candidate.userId, displayName: candidate.fullName, role: pickRole, academicTitle: candidate.academicTitle, unit: candidate.unit }]);
    setPickId("");
  }

  const propose = (action: "save" | "invite" | "submit") =>
    run(
      () => proposeIrbCouncil(proposal.id, { action, members, meetingDate, meetingLocation, contextVersion: info?.contextVersion }),
      action === "save" ? "Đã lưu nháp danh sách." : action === "invite" ? "Đã gửi lời mời cho thành viên mới." : "Đã trình Trưởng ban QLKH rà soát."
    );


  function handleExportWord() {
    if (!certificate) return;
    const exportData: ProposalExportData = {
      code: proposal.code || "HVQY-NCKH",
      title: proposal.title,
      ownerDisplayName: proposal.ownerDisplayName || "Chủ nhiệm đề tài",
      hostOrganizationUnit: proposal.hostOrganizationUnit || proposal.hostOrganizationUnitName || "Học viện Quân y"
    };
    const chair = members.find((member) => member.role === "chair");
    exportIrbCertificateWord(exportData, {
      certificateNumber: certificate.certificateNumber ?? undefined,
      approvalDate: vnDate(certificate.decisionDate),
      validUntil: vnDate(certificate.validUntil),
      riskLevel: (certificate.riskLevel as "MINIMAL" | "LOW" | "HIGH") ?? "LOW",
      councilPresident: chair?.displayName ?? "",
      ethicsNotes: certificate.ethicsNotes
    });
  }

  const section = { border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", marginBottom: "16px" } as const;
  const heading = { margin: "0 0 12px 0", fontSize: "15px", color: "inherit", display: "flex", alignItems: "center", gap: "6px" } as const;
  const chip = (text: string, color: string) => <span style={{ fontSize: "12px", color, border: `1px solid ${color}`, padding: "1px 8px", borderRadius: "999px", whiteSpace: "nowrap" }}>{text}</span>;

  return (
    <div className="cmd-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="cmd-modal" role="dialog" aria-modal="true" aria-label="Hội đồng Đạo đức (IRB)" style={{ maxWidth: "960px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="cmd-header" style={{ flexShrink: 0 }}>
          <div className="cmd-header-left">
            <div className="cmd-header-icon rose"><HeartPulse size={22} /></div>
            <div>
              <h2 className="cmd-header-title">Hội đồng Đạo đức trong nghiên cứu Y sinh học (IRB)</h2>
              <p className="cmd-header-subtitle">{proposal.code ? `${proposal.code} – ` : ""}{proposal.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="cmd-close-btn" aria-label="Đóng"><X size={20} /></button>
        </div>

        <div className="cmd-body" style={{ overflowY: "auto", flex: 1 }}>
          {message ? (
            <div className={`cmd-alert ${message.type}`} role={message.type === "error" ? "alert" : "status"}>
              {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
          ) : null}
          {loadError ? <p className="state-message error">{loadError}</p> : null}
          {!info && !loadError ? <p className="state-message">Đang tải…</p> : null}

          {info ? (
            <>
              {/* 1. Danh sách hội đồng và lời mời */}
              <div style={section}>
                <h3 style={heading}>
                  <Users size={16} color="#475569" /> 1. Thành phần hội đồng
                  <span style={{ marginLeft: "auto" }}>{chip(COUNCIL_STATUS_LABELS[councilStatus] ?? councilStatus, councilStatus === "approved" ? "#166534" : "#475569")}</span>
                </h3>
                {irb?.council?.returnReason && councilStatus === "returned" ? <p className="callout warning">Phòng KHQS trả lại: {irb.council.returnReason}</p> : null}
                {irb?.council?.rejectionReason && councilStatus === "rejected" ? <p className="callout warning">Ban giám đốc trả lại: {irb.council.rejectionReason}</p> : null}
                <p className="record-meta" style={{ margin: "0 0 8px" }}>
                  Quy định: 1 Chủ tịch, 1 Thư ký, 2–3 Phản biện, 3–5 Ủy viên. Người được mời chỉ thấy tên đề tài cho tới khi Ban giám đốc ký thành lập.{" "}
                  {(editable || irb?.council?.invitationsSentAt) && summary.map((item) => <span key={item.role} style={{ marginRight: "8px", color: item.ok ? "#166534" : "#b45309", fontWeight: 600 }}>{item.text}</span>)}
                </p>

                {editable ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <select aria-label="Nhà khoa học" value={pickId} onChange={(event) => setPickId(event.target.value)} className="cmd-select" style={{ flex: "1 1 280px" }}>
                      <option value="">Chọn nhà khoa học…</option>
                      {candidates.filter((item) => !members.some((member) => member.userId === item.userId)).map((item) => (
                        <option key={item.id} value={item.userId ?? ""}>{item.fullName} — {item.unit}</option>
                      ))}
                    </select>
                    <select aria-label="Vai trò" value={pickRole} onChange={(event) => setPickRole(event.target.value as IrbRole)} className="cmd-select" style={{ width: "140px" }}>
                      {ROLES.map((role) => <option key={role} value={role}>{IRB_ROLE_LABELS[role]}</option>)}
                    </select>
                    <button type="button" onClick={addMember} disabled={!pickId} className="cmd-btn outline">Thêm</button>
                  </div>
                ) : null}

                {members.length ? (
                  <table className="data-table">
                    <thead><tr><th>Vai trò</th><th>Thành viên</th><th>Đơn vị</th><th>Lời mời</th>{editable ? <th aria-label="Bỏ" /> : null}</tr></thead>
                    <tbody>
                      {members.map((member, index) => {
                        const status = statusOf(member);
                        return (
                          <tr key={`${member.userId}-${index}`}>
                            <td>
                              {editable ? (
                                <select aria-label={`Vai trò của ${member.displayName}`} value={member.role} onChange={(event) => setMembers(members.map((item, i) => (i === index ? { ...item, role: event.target.value as IrbRole } : item)))} className="cmd-select">
                                  {ROLES.map((role) => <option key={role} value={role}>{IRB_ROLE_LABELS[role]}</option>)}
                                </select>
                              ) : <strong>{IRB_ROLE_LABELS[member.role] ?? member.role}</strong>}
                            </td>
                            <td>{member.displayName}</td>
                            <td>{member.unit || "—"}</td>
                            <td>
                              {status ? chip(status.statusLabel, MEMBER_STATUS_COLORS[status.status] ?? "#475569") : chip("Chưa gửi lời mời", "#64748b")}
                              {status?.declineReason ? <span className="record-meta" style={{ display: "block" }}>Lý do: {status.declineReason}</span> : null}
                            </td>
                            {editable ? <td><button type="button" className="cmd-btn outline" aria-label={`Bỏ ${member.displayName}`} onClick={() => setMembers(members.filter((_, i) => i !== index))}><Trash2 size={14} /></button></td> : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <p className="record-meta">Chưa có thành viên nào.</p>}

                <div className="cmd-grid-2" style={{ marginTop: "12px" }}>
                  <div className="cmd-form-group">
                    <label className="cmd-label" htmlFor="irb-meeting-date">Ngày họp dự kiến</label>
                    <input id="irb-meeting-date" type="date" disabled={!editable} value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} className="cmd-input" />
                  </div>
                  <div className="cmd-form-group">
                    <label className="cmd-label" htmlFor="irb-meeting-location">Địa điểm họp</label>
                    <input id="irb-meeting-location" type="text" disabled={!editable} value={meetingLocation} onChange={(event) => setMeetingLocation(event.target.value)} className="cmd-input" />
                  </div>
                </div>

                {editable ? (
                  <div style={{ marginTop: "12px", display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button type="button" disabled={saving} onClick={() => void propose("save")} className="cmd-btn outline">Lưu nháp</button>
                    <button type="button" disabled={saving || !members.length} onClick={() => void propose("invite")} className="cmd-btn outline"><Send size={14} /> Gửi lời mời</button>
                    <button type="button" disabled={saving || summary.some((item) => !item.ok)} onClick={() => void propose("submit")} className="cmd-btn rose" title={summary.some((item) => !item.ok) ? "Thành phần chưa đủ theo quy định" : undefined}>Trình Trưởng ban rà soát</button>
                  </div>
                ) : null}

                {councilStatus === "submitted" && viewer?.canSign ? (
                  <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "12px" }}>
                    <div className="cmd-grid-2">
                      <div className="cmd-form-group">
                        <label className="cmd-label" htmlFor="irb-decision-number">Số quyết định thành lập</label>
                        <input id="irb-decision-number" className="cmd-input" value={decisionNumber} placeholder="Để trống: hệ thống đặt số" onChange={(event) => setDecisionNumber(event.target.value)} />
                      </div>
                      <div className="cmd-form-group">
                        <label className="cmd-label" htmlFor="irb-approval-note">Ý kiến</label>
                        <input id="irb-approval-note" className="cmd-input" value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
                      <button type="button" disabled={saving} className="cmd-btn outline" onClick={async () => { const reason = await askReason("Trả lại tờ trình Hội đồng IRB.", { label: "Lý do trả lại", confirmLabel: "Trả lại", tone: "danger" }); if (reason) void run(() => rejectIrbCouncil(proposal.id, { reason, contextVersion: info.contextVersion }), "Đã trả lại tờ trình cho chuyên viên."); }}>Trả lại</button>
                      <button type="button" disabled={saving} className="cmd-btn rose" onClick={() => void run(() => approveIrbCouncil(proposal.id, { decisionNumber, approvalNote, contextVersion: info.contextVersion }), "Đã ký quyết định thành lập Hội đồng IRB.")}>Ký thành lập hội đồng</button>
                    </div>
                  </div>
                ) : null}
                {councilStatus === "approved" ? <p className="record-meta" style={{ marginTop: "8px" }}>Quyết định {irb?.council?.decisionNumber ?? ""} — {irb?.council?.approvedByName ?? ""} ký ngày {vnDate(irb?.council?.approvedAt)}.</p> : null}
              </div>

              <RoutingStatus subjectType="proposal" subjectId={proposal.id} refreshKey={refreshKey} />

              {/* 2. Nhận xét */}
              {councilStatus === "approved" ? (
                <div style={section}>
                  <h3 style={heading}><FileText size={16} color="#475569" /> 2. Nhận xét của thành viên ({irb?.reviews?.length ?? 0})</h3>
                  {irb?.reviews?.length ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {irb.reviews.map((review) => (
                        <div key={review.reviewerId} style={{ background: "#f8fafc", color: "#0f172a", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginBottom: "4px" }}>
                            <strong>{review.reviewerName}{review.roleLabel ? ` (${review.roleLabel})` : ""}</strong>
                            <span style={{ fontSize: "12px", color: "#475569" }}>{review.recommendationLabel ?? review.recommendation} · {vnDate(review.submittedAt)}</span>
                          </div>
                          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{review.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="record-meta">Chưa có nhận xét. Thành viên gửi nhận xét ở trang hồ sơ đề tài.</p>}
                </div>
              ) : null}

              {/* 3. Kết luận và cấp giấy */}
              {councilStatus === "approved" ? (
                <div style={section}>
                  <h3 style={heading}>
                    <ShieldCheck size={16} color="#e11d48" /> 3. Kết luận và Giấy chứng nhận
                    {conclusion ? <span style={{ marginLeft: "auto" }}>{chip(CONCLUSION_STATUS_LABELS[conclusion.status] ?? conclusion.status, "#475569")}</span> : null}
                  </h3>
                  {!conclusion ? <p className="record-meta">Thư ký hội đồng chưa lập kết luận.</p> : (
                    <dl className="cmd-grid-2" style={{ margin: 0 }}>
                      <div><dt className="cmd-label">Kết luận</dt><dd>{conclusion.decision === "APPROVED" ? "Chấp thuận" : "Không chấp thuận"}</dd></div>
                      <div><dt className="cmd-label">Mức độ rủi ro</dt><dd>{IRB_RISK_LABELS[conclusion.riskLevel] ?? conclusion.riskLevel}</dd></div>
                      <div><dt className="cmd-label">Đối tượng nghiên cứu</dt><dd>{conclusion.targetSubjects || "—"}</dd></div>
                      <div><dt className="cmd-label">Thư ký lập</dt><dd>{conclusion.recordedByName ?? "—"}, {vnDate(conclusion.recordedAt)}</dd></div>
                      <div style={{ gridColumn: "1 / -1" }}><dt className="cmd-label">Ý kiến kết luận</dt><dd style={{ whiteSpace: "pre-wrap" }}>{conclusion.ethicsNotes}</dd></div>
                      {conclusion.conditions ? <div style={{ gridColumn: "1 / -1" }}><dt className="cmd-label">Điều kiện / yêu cầu chỉnh sửa</dt><dd style={{ whiteSpace: "pre-wrap" }}>{conclusion.conditions}</dd></div> : null}
                      {conclusion.status === "returned" && conclusion.returnReason ? <div style={{ gridColumn: "1 / -1" }}><p className="callout warning">Bị trả lại: {conclusion.returnReason}</p></div> : null}
                    </dl>
                  )}

                  {conclusion?.status === "finalized" && viewer?.isCoordinator ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                      <button type="button" disabled={saving} className="cmd-btn rose" onClick={() => void run(() => submitIrbConclusion(proposal.id, info.contextVersion), "Đã trình kết luận qua Phòng KHQS.")}>Trình kết luận qua Phòng KHQS</button>
                    </div>
                  ) : null}

                  {conclusion?.status === "submitted" && viewer?.canSign ? (
                    <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "12px" }}>
                      <div className="cmd-grid-2">
                        <div className="cmd-form-group">
                          <label className="cmd-label" htmlFor="irb-cert-number">Số Giấy chứng nhận</label>
                          <input id="irb-cert-number" className="cmd-input" value={certificateNumber} placeholder="Để trống: hệ thống tự cấp số" onChange={(event) => setCertificateNumber(event.target.value)} />
                        </div>
                        <div className="cmd-form-group">
                          <label className="cmd-label" htmlFor="irb-cert-date">Ngày ký</label>
                          <input id="irb-cert-date" type="date" className="cmd-input" value={decisionDate} onChange={(event) => setDecisionDate(event.target.value)} />
                        </div>
                        <div className="cmd-form-group">
                          <label className="cmd-label" htmlFor="irb-cert-valid">Hiệu lực đến</label>
                          <input id="irb-cert-valid" type="date" className="cmd-input" value={validUntil} placeholder="Mặc định 1 năm" onChange={(event) => setValidUntil(event.target.value)} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button type="button" disabled={saving} className="cmd-btn outline" onClick={async () => { const reason = await askReason("Trả lại kết luận cho thư ký hội đồng.", { label: "Lý do trả lại", confirmLabel: "Trả lại", tone: "danger" }); if (reason) void run(() => returnIrbConclusion(proposal.id, { reason, contextVersion: info.contextVersion }), "Đã trả lại kết luận."); }}>Trả lại thư ký</button>
                        <button type="button" disabled={saving} className="cmd-btn rose" onClick={() => void run(() => updateIRBStatus(proposal.id, { certificateNumber, decisionDate, validUntil: validUntil || undefined, contextVersion: info.contextVersion }), "Đã ký cấp Giấy chứng nhận IRB.")}>
                          Ký {conclusion.decision === "APPROVED" ? "cấp Giấy chứng nhận" : "văn bản không chấp thuận"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {certificate ? (
                    <div style={{ marginTop: "12px", padding: "12px", borderRadius: "6px", color: "#0f172a", background: certificate.status === "APPROVED" ? "#f0fdf4" : "#fef2f2" }}>
                      <strong>{certificate.status === "APPROVED" ? `Giấy chứng nhận số ${certificate.certificateNumber}` : "Không chấp thuận về đạo đức"}</strong>
                      <span className="record-meta" style={{ display: "block" }}>{certificate.approvedByName} ký ngày {vnDate(certificate.decisionDate)}{certificate.status === "APPROVED" ? `, hiệu lực đến ${vnDate(certificate.validUntil)}` : ""}.</span>
                      {certificate.status === "APPROVED" ? <button type="button" onClick={handleExportWord} className="cmd-btn outline" style={{ marginTop: "8px" }}>Xuất Giấy chứng nhận (.docx)</button> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="cmd-footer" style={{ flexShrink: 0 }}>
          <button type="button" onClick={onClose} className="cmd-btn outline">Đóng</button>
        </div>
      </div>
    </div>
  );
}
