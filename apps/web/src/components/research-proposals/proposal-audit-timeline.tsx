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
    case "PROPOSAL_CREATED": return "Khởi tạo đề tài";
    case "PROPOSAL_SUBMITTED": return "Nộp đề tài";
    case "PROPOSAL_STATUS_CHANGED": return "Cập nhật trạng thái";
    case "COUNCIL_PROPOSED": return "Đề xuất Hội đồng";
    case "COUNCIL_APPROVED": return "Phê duyệt Hội đồng";
    case "COUNCIL_REJECTED": return "Từ chối Hội đồng";
    case "DISBURSEMENT_UPDATED": return "Cập nhật giải ngân";
    case "REVIEW_SUBMITTED": return "Nộp nhận xét";
    case "IRB_CERTIFICATE_ISSUED": return "Cấp chứng nhận IRB";
    default: return action;
  }
}

function getDotModifier(action: string): string {
  if (action.includes("APPROVED") || action.includes("ISSUED")) return "success";
  if (action.includes("REJECTED")) return "danger";
  if (action.includes("SUBMITTED") || action.includes("CREATED")) return "info";
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
                        <dt>Ghi chú</dt>
                        <dd>{log.reason}</dd>
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
