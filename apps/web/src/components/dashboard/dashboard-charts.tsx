"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { SectionCard } from "@/components/ui/section-card";

interface DashboardStats {
  totalProposals: number;
  proposalsByUnit: { unit: string; count: number }[];
  proposalsByStatus: { status: string; count: number }[];
}

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

const STATUS_MAP: Record<string, string> = {
  draft: "Bản nháp",
  submitted: "Đã nộp",
  "pending-approval": "Chờ duyệt",
  approved: "Đã duyệt",
  "needs-supplement": "Cần bổ sung",
  rejected: "Từ chối"
};

import { getApiBaseUrl } from "@/lib/session";

export function DashboardCharts() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/dashboard/stats`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch((err) => console.error(err));
  }, []);

  if (!stats) return null;

  const pieData = stats.proposalsByStatus.map((item) => ({
    name: STATUS_MAP[item.status] || item.status,
    value: item.count
  }));

  const barData = stats.proposalsByUnit.map((item) => ({
    name: item.unit || "Chưa rõ",
    value: item.count
  }));

  return (
    <div className="grid two-column" style={{ marginTop: 16 }}>
      <SectionCard title="Thống kê theo đơn vị" subtitle="Số lượng hồ sơ đang xử lý phân theo đơn vị chủ trì">
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
              />
              <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Tình trạng hồ sơ" subtitle="Tỷ lệ phân bố các hồ sơ theo trạng thái hiện tại">
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
