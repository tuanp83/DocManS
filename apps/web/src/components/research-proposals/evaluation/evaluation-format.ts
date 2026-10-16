import type { CouncilMemberRole } from "@/lib/research-proposals-api";

export function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Chưa có";
}

export function formatDueDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value)) : "Không đặt hạn";
}

export const COUNCIL_ROLE_LABELS: Record<CouncilMemberRole, string> = {
  chair: "Chủ tịch Hội đồng",
  vice_chair: "Phó Chủ tịch Hội đồng",
  secretary: "Thư ký khoa học",
  reviewer_1: "Ủy viên Phản biện 1",
  reviewer_2: "Ủy viên Phản biện 2",
  reviewer: "Ủy viên Phản biện",
  member: "Ủy viên Hội đồng"
};

export type DynamicCouncilMember = {
  id: string;
  candidateId: string;
  isCustom: boolean;
  name: string;
  title: string;
  unit: string;
};
