"use client";

import React, { useEffect, useState } from "react";
import { getProposalAuditLogs, AuditLogRecord } from "../../lib/research-proposals-api";
import { SectionCard } from "../ui/section-card";
import { EmptyState } from "../ui/empty-state";

function formatDate(dateStr?: string) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

function getActionLabel(action: string) {
  switch (action) {
    case "create-proposal-draft": return "Khởi tạo đề tài";
    case "submit-proposal": return "Nộp đề tài";
    case "resubmit-proposal": return "Nộp lại đề tài";
    case "check-proposal-completeness": return "Kiểm tra hồ sơ";
    case "assign-reviewer": return "Phân công nhận xét";
    case "change-reviewer-assignment": return "Sửa phân công nhận xét";
    case "submit-score-and-review-comment": return "Nộp nhận xét và điểm";
    case "consolidate-evaluation": return "Tổng hợp đánh giá";
    case "propose-council": return "Đề xuất Hội đồng";
    case "approve-council": return "Phê duyệt Hội đồng";
    case "reject-council": return "Từ chối Hội đồng";
    case "record-council-minutes": return "Ghi nhận biên bản Hội đồng";
    case "approve-proposal-budget": return "Phê duyệt kinh phí";
    case "submit-irb-review": return "Nộp đánh giá Đạo đức y sinh (IRB)";
    case "update-irb-status": return "Cập nhật trạng thái IRB";
    case "approve-irb-council": return "Phê duyệt Hội đồng IRB";
    case "propose-irb-council": return "Đề xuất Hội đồng IRB";
    case "update-disbursement": return "Cập nhật giải ngân";
    case "propose-acceptance-council": return "Đề xuất Hội đồng nghiệm thu";
    case "approve-acceptance-council": return "Phê duyệt HĐ nghiệm thu";
    case "record-acceptance-minutes": return "Ghi nhận nghiệm thu";
    default: return action;
  }
}

function getDotModifier(action: string): string {
  if (action.includes("approve") || action.includes("record") || action.includes("complete")) return "success";
  if (action.includes("reject")) return "danger";
  if (action.includes("submit") || action.includes("create") || action.includes("propose")) return "info";
  return "";
}

export function ProposalAuditTimeline({ proposalId }: { proposalId: string }) {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getProposalAuditLogs(proposalId)
      .then(data => {
        if (mounted) {
          setLogs(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          console.error(err);
          setError("Không thể tải lịch sử hoạt động.");
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [proposalId]);

  if (loading) return <p className="state-message">Đang tải lịch sử hoạt động...</p>;
  if (error) return <p className="state-message error">{error}</p>;

  return (
    <SectionCard title="Lịch sử hoạt động" subtitle="Tất cả sự kiện audit của hồ sơ">
      {logs.length === 0 ? (
        <EmptyState title="Chưa có lịch sử" message="Lịch sử hoạt động sẽ xuất hiện khi có thay đổi trên hồ sơ." />
      ) : (
        <div className="timeline">
          {logs.map((log) => {
            const dotModifier = getDotModifier(log.action);
            return (
              <div className="timeline-item" key={log.id}>
                <span
                  className="timeline-dot"
                  style={
                    dotModifier === "success" ? { background: "var(--success)" } :
                    dotModifier === "danger" ? { background: "var(--danger)" } :
                    dotModifier === "info" ? { background: "var(--info)" } :
                    undefined
                  }
                />
                <div>
                  <p className="timeline-title">{getActionLabel(log.action)}</p>
                  <p className="timeline-transition">
                    Bởi {log.actorDisplayName}
                  </p>
                  <p className="timeline-meta">
                    {formatDate(log.timestamp)}
                    {log.result ? ` · ${log.result}` : ""}
                  </p>

                  {log.reason && (
                    <div className="timeline-details" style={{ marginTop: 8 }}>
                      <div>
                        <dt>Chi tiết / Ghi chú</dt>
                        {(() => {
                          let json = null;
                          try {
                            json = JSON.parse(log.reason);
                          } catch { /* not json */ }

                          if (!json || typeof json !== "object") {
                            return <dd>{log.reason}</dd>;
                          }

                          if (log.action === "submit-score-and-review-comment") {
                            return (
                              <dd>
                                <strong>Tổng điểm:</strong> {json.totalScore ?? "—"}<br />
                                <strong>Đề xuất:</strong> {json.recommendation === "approve" ? "Đồng ý" : json.recommendation === "reject" ? "Không đồng ý" : json.recommendation ?? "—"}
                              </dd>
                            );
                          }
                          
                          if (log.action === "approve-proposal" || log.action === "reject-proposal") {
                            return (
                              <dd>
                                <strong>Quyết định:</strong> {json.decision === "approved" ? "Phê duyệt" : "Không phê duyệt"}<br />
                                <strong>Chuyển trạng thái:</strong> {json.fromStatus} ➔ {json.toStatus}
                              </dd>
                            );
                          }

                          if (log.action.includes("council") || log.action.includes("irb")) {
                             return (
                              <dd>
                                {json.councilType && <><strong>Loại HĐ:</strong> {json.councilType}<br /></>}
                                {json.memberCount && <><strong>Số lượng TV:</strong> {json.memberCount}<br /></>}
                                {json.date && <><strong>Ngày họp:</strong> {formatDate(json.date)}<br /></>}
                                {json.status && <><strong>Trạng thái:</strong> {json.status}<br /></>}
                              </dd>
                             );
                          }

                          return (
                            <dd style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12, background: "var(--surface-muted)", padding: 8, borderRadius: 4 }}>
                              {JSON.stringify(json, null, 2)}
                            </dd>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="button"
                    style={{ marginTop: 8, fontSize: 12, padding: "4px 10px" }}
                    onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  >
                    {expandedLogId === log.id ? "Ẩn chi tiết" : "Chi tiết kỹ thuật"}
                  </button>

                  {expandedLogId === log.id && (
                    <div style={{
                      marginTop: 8,
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "monospace",
                      overflow: "auto"
                    }}>
                      <div><strong>Action:</strong> {log.action}</div>
                      <div><strong>Result:</strong> {log.result}</div>
                      {(log.beforeFacts || log.afterFacts) && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                          {log.beforeFacts && (
                            <div>
                              <div style={{ fontWeight: 700, borderBottom: "1px solid var(--border)", marginBottom: 4, paddingBottom: 4 }}>
                                Dữ liệu cũ (Before)
                              </div>
                              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                {JSON.stringify(log.beforeFacts, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.afterFacts && (
                            <div>
                              <div style={{ fontWeight: 700, borderBottom: "1px solid var(--border)", marginBottom: 4, paddingBottom: 4 }}>
                                Dữ liệu mới (After)
                              </div>
                              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                                {JSON.stringify(log.afterFacts, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
