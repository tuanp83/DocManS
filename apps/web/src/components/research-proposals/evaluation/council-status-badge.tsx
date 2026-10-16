"use client";

import { CheckCircle2, Clock } from "lucide-react";

export function CouncilStatusBadge({ isCouncilApproved, isCouncilSubmitted }: { isCouncilApproved: boolean; isCouncilSubmitted: boolean }) {
  return (
          isCouncilApproved ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "#dcfce7",
                color: "#15803d",
                padding: "4px 10px",
                borderRadius: "14px",
                fontSize: "12px",
                fontWeight: 700
              }}
            >
              <CheckCircle2 size={14} /> Hội đồng đã phê chuẩn
            </span>
          ) : isCouncilSubmitted ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                background: "#fef3c7",
                color: "#92400e",
                padding: "4px 10px",
                borderRadius: "14px",
                fontSize: "12px",
                fontWeight: 700
              }}
            >
              <Clock size={14} /> Đã trình Lãnh đạo chờ duyệt
            </span>
          ) : (
            <span
              style={{
                background: "#f1f5f9",
                color: "#475569",
                padding: "4px 10px",
                borderRadius: "14px",
                fontSize: "12px",
                fontWeight: 600
              }}
            >
              Chưa trình Hội đồng
            </span>
          )
  );
}
