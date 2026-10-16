"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CornerUpLeft, ExternalLink, Send } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { advanceSubmission, loadApprovalInbox, returnSubmission, type ApprovalSubmission } from "@/lib/approval-routing-api";
import { useAskReason } from "@/components/ui/confirm-dialog";

const ROLE_TEXT: Record<string, { title: string; subtitle: string; advance: string }> = {
  board_head: { title: "Tờ trình chờ Trưởng ban rà soát", subtitle: "Rà soát hồ sơ chuyên viên lập rồi trình Trưởng phòng, hoặc trả lại chuyên viên kèm lý do.", advance: "Trình Trưởng phòng" },
  head: { title: "Tờ trình chờ Trưởng phòng duyệt", subtitle: "Duyệt để gửi Ban giám đốc ký, hoặc trả lại chuyên viên kèm lý do.", advance: "Duyệt, gửi Ban giám đốc" },
  leadership: { title: "Tờ trình chờ Ban giám đốc", subtitle: "Ký tại trang Hồ sơ chờ phê duyệt hoặc trang đề tài.", advance: "" },
  staff: { title: "Tờ trình của tôi", subtitle: "Theo dõi tờ trình đã lập: đang ở bước nào, bị trả lại vì sao.", advance: "" }
};

/** Hàng chờ tờ trình theo vai trò (Trưởng ban, Trưởng phòng, Ban giám đốc, chuyên viên). */
export function SubmissionsInbox() {
  const askReason = useAskReason();
  const [role, setRole] = useState<string>("");
  const [items, setItems] = useState<ApprovalSubmission[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    try {
      const data = await loadApprovalInbox();
      setRole(data.role);
      setItems(data.submissions);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không tải được tờ trình.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(item: ApprovalSubmission, kind: "advance" | "return") {
    setMessage("");
    setError("");
    const note = kind === "return"
      ? await askReason(`Trả lại "${item.kindLabel}" của ${item.title}.`, { label: "Lý do trả lại", confirmLabel: "Trả lại", tone: "danger" })
      : await askReason(`${ROLE_TEXT[role]?.advance ?? "Chuyển tiếp"}: "${item.kindLabel}" của ${item.title}.`, { label: "Ý kiến (không bắt buộc)", optional: true, confirmLabel: ROLE_TEXT[role]?.advance ?? "Đồng ý" });
    if (note === null) return;
    setBusyId(item.id);
    try {
      if (kind === "advance") await advanceSubmission(item.id, note);
      else await returnSubmission(item.id, note);
      setMessage(kind === "advance" ? "Đã chuyển tờ trình sang bước tiếp theo." : "Đã trả lại chuyên viên.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xử lý được tờ trình.");
    } finally {
      setBusyId("");
    }
  }

  if (!items) return <p className={error ? "state-message error" : "state-message"}>{error || "Đang tải tờ trình..."}</p>;
  const text = ROLE_TEXT[role] ?? ROLE_TEXT.staff;
  const canAct = role === "board_head" || role === "head";

  return (
    <SectionCard title={text.title} subtitle={text.subtitle}>
      {error ? <p className="state-message error">{error}</p> : null}
      {message ? <p className="state-message success" role="status">{message}</p> : null}
      {items.length === 0 ? (
        <EmptyState title="Không có tờ trình" message={canAct ? "Chưa có tờ trình nào chờ đồng chí xử lý." : "Chưa có tờ trình nào."} />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Thủ tục</th>
                <th style={{ minWidth: "240px" }}>Hồ sơ / đề tài</th>
                <th>Người lập</th>
                <th>Tình trạng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="record-title">{item.kindLabel}</span>
                    <span className="record-meta">Người ký: {item.signerLabel}</span>
                  </td>
                  <td>
                    <Link className="record-title" href={item.link}>{item.title}</Link>
                    {item.steps.filter((step) => step.note).slice(-1).map((step, index) => (
                      <span key={index} className="record-meta">Ý kiến gần nhất ({step.actorName}): {step.note}</span>
                    ))}
                  </td>
                  <td>
                    <span className="record-meta">{item.submittedByName}</span>
                    <span className="record-meta">{new Date(item.createdAt).toLocaleString("vi-VN")}</span>
                  </td>
                  <td>
                    <span className="record-title" style={{ color: item.status === "RETURNED" || item.status === "REJECTED" ? "#b91c1c" : item.status === "APPROVED" ? "#15803d" : "#c2410c" }}>
                      {item.status === "PENDING" ? item.stageLabel : item.statusLabel}
                    </span>
                    {item.status === "RETURNED" && item.lastNote ? <span className="record-meta">Lý do: {item.lastNote}</span> : null}
                  </td>
                  <td>
                    <div className="button-row">
                      {canAct && item.status === "PENDING" ? (
                        <>
                          <button type="button" className="button primary" disabled={busyId === item.id} onClick={() => void act(item, "advance")} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <Send size={14} aria-hidden="true" /> {text.advance}
                          </button>
                          <button type="button" className="button danger" disabled={busyId === item.id} onClick={() => void act(item, "return")} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <CornerUpLeft size={14} aria-hidden="true" /> Trả lại
                          </button>
                        </>
                      ) : null}
                      <Link className="button" href={role === "leadership" && item.subjectType === "proposal" ? "/approvals" : item.link} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <ExternalLink size={14} aria-hidden="true" /> Xem
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
