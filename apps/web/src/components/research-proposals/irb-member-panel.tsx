"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import {
  acceptIrbInvitation,
  declineIrbInvitation,
  fetchIRBInfo,
  IRB_RECOMMENDATION_LABELS,
  IRB_RISK_LABELS,
  loadMyIrbInvitations,
  saveIrbConclusion,
  submitIrbReview,
  type IRBInfo,
  type IrbInvitation,
  type IrbRecommendation
} from "@/lib/proposal-evaluations-api";
import { useConfirm, useAskReason } from "@/components/ui/confirm-dialog";

const vnDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—");

/** Đồng ý / Từ chối lời mời IRB. Từ chối bắt buộc lý do; máy chủ kiểm tra lại người được mời và trạng thái lời mời. */
function IrbInvitationActions({ invitation, onDone }: { invitation: IrbInvitation; onDone: () => void | Promise<void> }) {
  const askReason = useAskReason();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function respond(response: "accept" | "decline") {
    setError("");
    let reason = "";
    if (response === "accept" && !(await confirm(`Đồng ý làm ${invitation.roleLabel} Hội đồng Đạo đức của đề tài "${invitation.proposal.title}"?`, { confirmLabel: "Đồng ý tham gia" }))) return;
    if (response === "decline") {
      const typed = await askReason(`Từ chối tham gia Hội đồng IRB của đề tài "${invitation.proposal.title}".`, { label: "Lý do từ chối", confirmLabel: "Từ chối", tone: "danger" });
      if (typed === null) return;
      reason = typed;
    }
    setBusy(true);
    try {
      if (response === "accept") await acceptIrbInvitation(invitation.proposalId, invitation.id);
      else await declineIrbInvitation(invitation.proposalId, invitation.id, reason);
      await onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không gửi được câu trả lời.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "inline-flex", gap: "8px" }}>
        <button type="button" className="button primary small" disabled={busy} onClick={() => void respond("accept")}><CheckCircle2 size={14} aria-hidden="true" /> Đồng ý</button>
        <button type="button" className="button danger small" disabled={busy} onClick={() => void respond("decline")}><XCircle size={14} aria-hidden="true" /> Từ chối</button>
      </div>
      {error ? <span role="alert" style={{ fontSize: "12px", color: "#b91c1c" }}>{error}</span> : null}
    </div>
  );
}

function invitationStage(invitation: IrbInvitation) {
  if (invitation.status === "invited") return "Chờ đồng chí trả lời";
  if (invitation.status === "accepted") return "Đã nhận lời — chờ Ban giám đốc ký thành lập hội đồng";
  if (invitation.certificateStatus) return "Đã cấp Giấy chứng nhận";
  if (invitation.role === "secretary") return invitation.conclusionStatus ? "Thư ký: đã lập kết luận" : "Thư ký: cần lập kết luận";
  return invitation.reviewSubmitted ? "Đã gửi nhận xét" : "Cần gửi nhận xét";
}

/** Danh sách lời mời và hội đồng IRB của người xem (trang "Được mời phản biện"). */
export function IrbInvitationsPanel() {
  const [items, setItems] = useState<IrbInvitation[] | null>(null);
  const load = () => loadMyIrbInvitations().then(setItems).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);
  if (!items?.length) return null;
  return (
    <SectionCard title="Hội đồng Đạo đức (IRB)" subtitle="Lời mời và hội đồng đạo đức đồng chí tham gia. Chưa đồng ý thì chỉ thấy tên đề tài.">
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Đề tài</th><th>Vai trò</th><th>Người mời</th><th>Tình trạng</th><th>Thao tác</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><span className="record-title">{item.proposal.title}</span><span className="record-meta">{item.proposal.code ?? "Chưa cấp mã"}{item.meetingDate ? ` · Họp dự kiến ${vnDate(item.meetingDate)}` : ""}</span></td>
                <td>{item.roleLabel}</td>
                <td>{item.invitedByName ?? "—"}</td>
                <td>{invitationStage(item)}</td>
                <td>{item.status === "invited" ? <IrbInvitationActions invitation={item} onDone={load} /> : item.status === "active" ? <Link className="button small" href={`/proposals/${item.proposal.id}`}>Mở hồ sơ</Link> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/**
 * Khung IRB trên trang hồ sơ cho chính thành viên hội đồng: lời mời (khi chưa trả lời, hiện cả khi chưa được đọc hồ
 * sơ), nhận xét (Chủ tịch, Phản biện, Ủy viên), kết luận (Thư ký). Người không phải thành viên: không hiện gì.
 */
export function IrbMemberPanel({ proposalId, onChanged, onPresence }: { proposalId: string; onChanged?: () => void | Promise<void>; onPresence?: (status: IrbInvitation["status"] | null) => void }) {
  const confirm = useConfirm();
  const [invitation, setInvitation] = useState<IrbInvitation | null>(null);
  const [info, setInfo] = useState<IRBInfo | null>(null);
  const [recommendation, setRecommendation] = useState<IrbRecommendation>("approve");
  const [comment, setComment] = useState("");
  const [conclusion, setConclusion] = useState({ decision: "APPROVED" as "APPROVED" | "REJECTED", riskLevel: "LOW", targetSubjects: "", ethicsNotes: "", conditions: "", meetingConductedAt: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    try {
      const mine = (await loadMyIrbInvitations()).find((item) => item.proposal.id === proposalId) ?? null;
      setInvitation(mine);
      onPresence?.(mine?.status ?? null);
      if (mine?.status !== "active") { setInfo(null); return; }
      const data = await fetchIRBInfo(proposalId);
      setInfo(data);
      const own = data.irb.reviews?.find((review) => review.reviewerId === mine.userId);
      if (own) { setRecommendation((own.recommendation as IrbRecommendation) in IRB_RECOMMENDATION_LABELS ? (own.recommendation as IrbRecommendation) : "approve"); setComment(own.comment); }
      const saved = data.irb.conclusion;
      if (saved) setConclusion({ decision: saved.decision, riskLevel: saved.riskLevel, targetSubjects: saved.targetSubjects ?? "", ethicsNotes: saved.ethicsNotes, conditions: saved.conditions ?? "", meetingConductedAt: (saved.meetingConductedAt ?? "").slice(0, 10) });
    } catch {
      setInvitation(null);
      onPresence?.(null);
    }
  }

  useEffect(() => { void load(); }, [proposalId]); // eslint-disable-line react-hooks/exhaustive-deps -- tải lại khi đổi hồ sơ

  if (!invitation) return null;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: "success", text: success });
      await load();
      await onChanged?.();
    } catch (caught) {
      setMessage({ type: "error", text: caught instanceof Error ? caught.message : "Thao tác không thành công." });
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="grid" style={{ gap: "4px", marginBottom: "8px" }}>
      <span className="record-title">{invitation.proposal.title}</span>
      <span className="record-meta">Vai trò: {invitation.roleLabel} · Người mời: {invitation.invitedByName ?? "—"}{invitation.meetingDate ? ` · Họp dự kiến ${vnDate(invitation.meetingDate)}` : ""}</span>
    </div>
  );
  const notice = message ? <p className={`state-message ${message.type === "error" ? "error" : "success"}`} role={message.type === "error" ? "alert" : "status"}>{message.text}</p> : null;

  if (invitation.status === "invited") {
    return (
      <SectionCard title="Lời mời tham gia Hội đồng Đạo đức (IRB)" subtitle="Đồng chí chỉ xem được tên đề tài cho đến khi đồng ý và Ban giám đốc ký quyết định thành lập hội đồng.">
        {header}
        <IrbInvitationActions invitation={invitation} onDone={async () => { await load(); await onChanged?.(); }} />
      </SectionCard>
    );
  }
  if (invitation.status === "accepted") {
    return (
      <SectionCard title="Hội đồng Đạo đức (IRB)" subtitle="Đồng chí đã nhận lời. Hồ sơ đề tài sẽ mở khi Ban giám đốc ký quyết định thành lập hội đồng.">
        {header}
      </SectionCard>
    );
  }

  const irb = info?.irb;
  const conclusionStatus = irb?.conclusion?.status ?? null;
  const locked = !!irb?.certificate || conclusionStatus === "finalized" || conclusionStatus === "submitted" || conclusionStatus === "signed";
  const isSecretary = invitation.role === "secretary";

  return (
    <SectionCard title="Hội đồng Đạo đức (IRB)" subtitle={isSecretary ? "Thư ký tổng hợp nhận xét và lập kết luận; chuyên viên trình kết luận để Ban giám đốc ký cấp Giấy chứng nhận." : "Gửi nhận xét về đạo đức của đề cương nghiên cứu. Gửi lại sẽ thay nhận xét trước, cho tới khi thư ký chốt kết luận."}>
      {header}
      {notice}
      {irb?.certificate ? <p className="state-message success">Đã cấp {irb.certificate.status === "APPROVED" ? `Giấy chứng nhận số ${irb.certificate.certificateNumber}` : "văn bản không chấp thuận"} ngày {vnDate(irb.certificate.decisionDate)}.</p> : null}

      {irb?.reviews?.length ? (
        <details open={isSecretary} style={{ marginBottom: "12px" }}>
          <summary>Nhận xét của thành viên ({irb.reviews.length})</summary>
          <ul style={{ margin: "8px 0", paddingLeft: "18px" }}>
            {irb.reviews.map((review) => (
              <li key={review.reviewerId} style={{ marginBottom: "6px" }}>
                <strong>{review.reviewerName}</strong>{review.roleLabel ? ` (${review.roleLabel})` : ""} — {review.recommendationLabel ?? review.recommendation}
                <div style={{ whiteSpace: "pre-wrap" }}>{review.comment}</div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!isSecretary ? (
        <form className="grid" style={{ gap: "8px" }} onSubmit={(event) => { event.preventDefault(); void run(() => submitIrbReview(proposalId, { recommendation, comment, contextVersion: info?.contextVersion }), "Đã gửi nhận xét."); }}>
          <label className="field">
            <span>Ý kiến đề nghị</span>
            <select value={recommendation} disabled={locked} onChange={(event) => setRecommendation(event.target.value as IrbRecommendation)}>
              {(Object.keys(IRB_RECOMMENDATION_LABELS) as IrbRecommendation[]).map((key) => <option key={key} value={key}>{IRB_RECOMMENDATION_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Nhận xét</span>
            <textarea rows={4} required disabled={locked} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Quyền và an toàn của người tham gia, phiếu đồng thuận, bảo mật thông tin, rủi ro và lợi ích…" />
          </label>
          {locked ? <p className="record-meta">Kết luận đã chốt, không sửa nhận xét được nữa.</p> : <button type="submit" className="button primary" disabled={busy || !comment.trim()}>{invitation.reviewSubmitted ? "Gửi lại nhận xét" : "Gửi nhận xét"}</button>}
        </form>
      ) : (
        <form className="grid" style={{ gap: "8px" }} onSubmit={(event) => event.preventDefault()}>
          {conclusionStatus === "returned" && irb?.conclusion?.returnReason ? <p className="callout warning">Bị trả lại: {irb.conclusion.returnReason}</p> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
            <label className="field"><span>Kết luận</span>
              <select value={conclusion.decision} disabled={locked} onChange={(event) => setConclusion({ ...conclusion, decision: event.target.value as "APPROVED" | "REJECTED" })}>
                <option value="APPROVED">Chấp thuận</option>
                <option value="REJECTED">Không chấp thuận</option>
              </select>
            </label>
            <label className="field"><span>Mức độ rủi ro</span>
              <select value={conclusion.riskLevel} disabled={locked} onChange={(event) => setConclusion({ ...conclusion, riskLevel: event.target.value })}>
                {Object.entries(IRB_RISK_LABELS).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
              </select>
            </label>
            <label className="field"><span>Ngày họp</span>
              <input type="date" disabled={locked} value={conclusion.meetingConductedAt} onChange={(event) => setConclusion({ ...conclusion, meetingConductedAt: event.target.value })} />
            </label>
          </div>
          <label className="field"><span>Đối tượng nghiên cứu</span>
            <input disabled={locked} value={conclusion.targetSubjects} onChange={(event) => setConclusion({ ...conclusion, targetSubjects: event.target.value })} />
          </label>
          <label className="field"><span>Ý kiến kết luận về đạo đức</span>
            <textarea rows={4} required disabled={locked} value={conclusion.ethicsNotes} onChange={(event) => setConclusion({ ...conclusion, ethicsNotes: event.target.value })} />
          </label>
          <label className="field"><span>Điều kiện / yêu cầu chỉnh sửa (nếu có)</span>
            <textarea rows={2} disabled={locked} value={conclusion.conditions} onChange={(event) => setConclusion({ ...conclusion, conditions: event.target.value })} />
          </label>
          {locked ? (
            <p className="record-meta">{conclusionStatus === "finalized" ? "Đã chốt kết luận, chờ chuyên viên trình." : conclusionStatus === "submitted" ? "Kết luận đang trình Ban giám đốc." : "Kết luận đã được ký."}</p>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="button" disabled={busy || !conclusion.ethicsNotes.trim()} onClick={() => void run(() => saveIrbConclusion(proposalId, { ...conclusion, action: "save", contextVersion: info?.contextVersion }), "Đã lưu nháp kết luận.")}>Lưu nháp</button>
              <button type="button" className="button primary" disabled={busy || !conclusion.ethicsNotes.trim()} onClick={async () => { if (await confirm("Chốt kết luận? Sau khi chốt, thành viên không sửa nhận xét và chuyên viên sẽ trình Ban giám đốc.", { confirmLabel: "Chốt kết luận" })) void run(() => saveIrbConclusion(proposalId, { ...conclusion, action: "finalize", contextVersion: info?.contextVersion }), "Đã chốt kết luận, đã báo chuyên viên trình."); }}>Chốt kết luận</button>
            </div>
          )}
        </form>
      )}
    </SectionCard>
  );
}
