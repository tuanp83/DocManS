"use client";

import { Clock } from "lucide-react";
import type { CouncilMetadata } from "@/lib/research-proposals-api";
import { formatDate } from "./evaluation-format";

/** Trường hợp B: tờ trình đã gửi, chờ lãnh đạo duyệt. */
export function CouncilSubmittedView({ council }: { council: CouncilMetadata | null | undefined }) {
  return (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              style={{
                background: "#fefce8",
                border: "1px solid #fef08a",
                borderRadius: "8px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#854d0e"
              }}
            >
              <Clock size={20} />
              <div>
                <strong>Tờ trình thành lập Hội đồng đang được xét duyệt (Trưởng ban → Trưởng phòng → Ban giám đốc)</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "13px" }}>
                  Thời điểm trình: {council?.proposedAt ? formatDate(council.proposedAt) : "Mới đây"} bởi{" "}
                  <strong>{council?.proposedByName || "Chuyên viên QLKH"}</strong>. Xem bước hiện tại ở mục "Tờ trình qua Phòng KHQS".
                </p>
              </div>
            </div>

            {/* Bảng danh sách dự kiến */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ padding: "8px", textAlign: "left" }}>Vai trò đề xuất</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Họ và tên</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Học hàm, học vị</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Đơn vị</th>
                </tr>
              </thead>
              <tbody>
                {council?.members?.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px", fontWeight: 700, color: "#334155" }}>{m.roleLabel}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{m.displayName}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{m.academicTitle || "—"}</td>
                    <td style={{ padding: "8px", color: "#64748b" }}>{m.unit || m.organization || "Học viện Quân y"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
  );
}
