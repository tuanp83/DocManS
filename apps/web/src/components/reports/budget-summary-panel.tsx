"use client";

import { useEffect, useState } from "react";
import { KpiCard } from "@/components/ui/kpi-card";
import { SectionCard } from "@/components/ui/section-card";
import { formatMoney, loadProjectDistribution, loadProposalDistribution, type Bucket, type ProjectDistribution, type ProposalDistribution } from "@/lib/dashboard-api";
import { getProposalLevelLabel } from "@/lib/proposal-classification";

/**
 * Báo cáo kinh phí TỔNG HỢP (cho các Phó Giám đốc chỉ theo dõi): tổng kinh phí duyệt, cấp, giải ngân theo đơn vị
 * và cấp đề tài. Không có kinh phí từng hồ sơ / đề tài — máy chủ cũng không trả số liệu đó cho vai trò này.
 */
export function BudgetSummaryPanel() {
  const [proposals, setProposals] = useState<ProposalDistribution | null>(null);
  const [projects, setProjects] = useState<ProjectDistribution | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([loadProposalDistribution({}), loadProjectDistribution({})])
      .then(([proposalData, projectData]) => {
        setProposals(proposalData);
        setProjects(projectData);
      })
      .catch(() => setError("Không tải được báo cáo kinh phí tổng hợp."));
  }, []);

  if (error) return <p className="state-message error">{error}</p>;
  if (!proposals || !projects) return <p className="state-message">Đang tải báo cáo kinh phí tổng hợp...</p>;

  const table = (title: string, rows: Bucket[], labelOf: (row: Bucket) => string) => (
    <SectionCard title={title} subtitle="Số tổng hợp, không gồm kinh phí từng đề tài">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nhóm</th>
              <th>Số đề tài</th>
              <th>Kinh phí cấp</th>
              <th>Đã giải ngân</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{labelOf(row)}</td>
                <td>{row.count}</td>
                <td>{formatMoney(row.totalBudget ?? 0)}</td>
                <td>{formatMoney(row.totalDisbursed ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );

  return (
    <div className="grid">
      <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
        <KpiCard label="Kinh phí đề xuất đã duyệt" value={formatMoney(proposals.totals.approvedBudget)} meta={`${proposals.totals.approved} hồ sơ đã duyệt`} />
        <KpiCard label="Kinh phí cấp cho đề tài" value={formatMoney(projects.totals.totalBudget)} meta={`${projects.totals.count} đề tài`} />
        <KpiCard label="Đã giải ngân" value={formatMoney(projects.totals.totalDisbursed)} meta={projects.totals.totalBudget ? `${Math.round((projects.totals.totalDisbursed / projects.totals.totalBudget) * 100)}% kinh phí cấp` : "—"} />
        <KpiCard label="Đã quyết toán" value={formatMoney(projects.totals.totalSettled)} meta="Tổng số đã quyết toán" />
      </div>
      {table("Kinh phí theo đơn vị chủ trì", projects.byUnit, (row) => row.label || row.key)}
      {table("Kinh phí theo cấp đề tài", projects.byLevel, (row) => getProposalLevelLabel(row.key))}
    </div>
  );
}
