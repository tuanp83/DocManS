"use client";

import React, { useEffect, useState } from "react";
import { getProposalAuditLogs, AuditLogRecord } from "../../lib/research-proposals-api";

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

function getActionIcon(action: string) {
  const baseClasses = "flex items-center justify-center w-8 h-8 rounded-full ring-8 ring-white shrink-0";
  
  if (action.includes("APPROVED") || action.includes("ISSUED")) {
    return <div className={`${baseClasses} bg-green-500`}><svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></div>;
  }
  if (action.includes("REJECTED")) {
    return <div className={`${baseClasses} bg-red-500`}><svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></div>;
  }
  if (action.includes("SUBMITTED") || action.includes("CREATED")) {
    return <div className={`${baseClasses} bg-blue-500`}><svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></div>;
  }
  return <div className={`${baseClasses} bg-gray-300`}><svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>;
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

  if (loading) return <div className="p-4 text-gray-500 text-sm">Đang tải lịch sử...</div>;
  if (error) return <div className="p-4 text-red-500 text-sm">{error}</div>;
  if (logs.length === 0) return <div className="p-4 text-gray-500 text-sm">Chưa có lịch sử hoạt động nào.</div>;

  return (
    <div className="p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-6">Lịch sử hoạt động</h3>
      <div className="relative border-l border-gray-200 ml-3">
        {logs.map((log, index) => (
          <div key={log.id} className={`mb-8 ml-6 ${index === logs.length - 1 ? 'mb-0' : ''}`}>
            <span className="absolute flex items-center justify-center w-8 h-8 rounded-full -left-4 ring-4 ring-white bg-white">
              {getActionIcon(log.action)}
            </span>
            <div className="bg-white border rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{getActionLabel(log.action)}</h4>
                  <p className="text-sm font-normal text-gray-500 mt-1">
                    Bởi <span className="font-medium text-gray-900">{log.actorDisplayName}</span>
                  </p>
                </div>
                <time className="mb-1 text-xs font-normal text-gray-400 sm:order-last sm:mb-0">
                  {formatDate(log.timestamp)}
                </time>
              </div>
              
              {log.reason && (
                <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                  <strong>Ghi chú:</strong> {log.reason}
                </div>
              )}

              <div className="mt-2">
                <button 
                  onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  className="text-xs text-blue-600 hover:underline focus:outline-none"
                >
                  {expandedLogId === log.id ? "Ẩn chi tiết kỹ thuật" : "Xem chi tiết kỹ thuật"}
                </button>
                
                {expandedLogId === log.id && (
                  <div className="mt-2 bg-gray-800 rounded p-2 overflow-x-auto text-xs text-gray-300 font-mono">
                    <div className="mb-1"><strong>Action:</strong> {log.action}</div>
                    <div className="mb-1"><strong>Result:</strong> {log.result}</div>
                    {(log.beforeFacts || log.afterFacts) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {log.beforeFacts && (
                          <div>
                            <div className="text-gray-400 border-b border-gray-700 mb-1">Dữ liệu cũ (Before)</div>
                            <pre>{JSON.stringify(log.beforeFacts, null, 2)}</pre>
                          </div>
                        )}
                        {log.afterFacts && (
                          <div>
                            <div className="text-gray-400 border-b border-gray-700 mb-1">Dữ liệu mới (After)</div>
                            <pre>{JSON.stringify(log.afterFacts, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
