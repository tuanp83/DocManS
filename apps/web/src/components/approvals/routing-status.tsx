"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/ui/section-card";
import { loadSubjectSubmissions, type ApprovalSubmission } from "@/lib/approval-routing-api";

/**
 * Tình trạng tờ trình của hồ sơ/đề tài qua Phòng KHQS (chỉ cán bộ Phòng và Ban giám đốc thấy): đang ở bước nào,
 * ai đã trình/duyệt, lý do trả lại gần nhất. Người không có quyền xem tờ trình nội bộ thì không hiện gì.
 */
export function RoutingStatus({ subjectType, subjectId, refreshKey }: { subjectType: "proposal" | "project"; subjectId: string; refreshKey?: string }) {
  const [submissions, setSubmissions] = useState<ApprovalSubmission[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSubjectSubmissions(subjectType, subjectId)
      .then((data) => { if (!cancelled) setSubmissions(data.submissions); })
      .catch(() => { if (!cancelled) setSubmissions(null); });
    return () => { cancelled = true; };
  }, [subjectType, subjectId, refreshKey]);

  if (!submissions?.length) return null;
  // Mỗi thủ tục hiện tờ trình gần nhất.
  const latest = submissions.filter((item, index) => submissions.findIndex((other) => other.kind === item.kind) === index);

  return (
    <SectionCard title="Tờ trình qua Phòng KHQS" subtitle="Chuyên viên → Trưởng ban QLKH → Trưởng phòng KHQS → Ban giám đốc">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thủ tục</th>
              <th>Tình trạng</th>
              <th>Diễn biến</th>
            </tr>
          </thead>
          <tbody>
            {latest.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="record-title">{item.kindLabel}</span>
                  <span className="record-meta">Người ký: {item.signerLabel}</span>
                </td>
                <td>
                  <span className="record-title" style={{ color: item.status === "RETURNED" || item.status === "REJECTED" ? "#b91c1c" : item.status === "APPROVED" ? "#15803d" : "#c2410c" }}>
                    {item.status === "PENDING" ? item.stageLabel : item.statusLabel}
                  </span>
                  {item.status === "RETURNED" && item.lastNote ? <span className="record-meta">Lý do trả lại: {item.lastNote}</span> : null}
                </td>
                <td>
                  {item.steps.map((step, index) => (
                    <span key={index} className="record-meta" style={{ display: "block" }}>
                      {new Date(step.createdAt).toLocaleString("vi-VN")} · {stepLabel(step.action)} · {step.actorName}
                      {step.note ? ` — ${step.note}` : ""}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function stepLabel(action: string) {
  return ({ SUBMIT: "Trình", FORWARD: "Trưởng ban trình Trưởng phòng", APPROVE: "Duyệt", REJECT: "Không phê duyệt", RETURN: "Trả lại" } as Record<string, string>)[action] ?? action;
}
