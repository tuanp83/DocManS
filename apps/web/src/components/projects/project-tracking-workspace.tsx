"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Calendar,
  CheckCircle2,
  Clock,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  FolderKanban,
  HelpCircle,
  History,
  Layers,
  ListFilter,
  PieChart,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Timer,
  UserCheck,
  Users
} from "lucide-react";
import { useSession } from "@/components/auth/session-provider";
import { loadResearchProposals, type ResearchProposal } from "@/lib/research-proposals-api";
import {
  PROPOSAL_LEVEL_LABELS,
  getProposalLevelLabel,
  getProposalMilitaryScope,
  getProposalMilitaryScopeLabel
} from "@/lib/proposal-classification";
import {
  SubmitMilestoneReportModal,
  type ProjectMilestone
} from "./submit-milestone-report-modal";
import { SendDeadlineReminderModal } from "./send-deadline-reminder-modal";
import { AcceptanceCouncilModal } from "@/components/research-proposals/acceptance-council-modal";
import { MilestoneDisbursementModal } from "./milestone-disbursement-modal";
import { IRBApprovalModal } from "@/components/research-proposals/irb-approval-modal";
import { Award, HeartPulse, DollarSign } from "lucide-react";

type WorkspaceTab = "proposals_summary" | "milestones_matrix" | "alerts_center";
type ViewPerspective = "all_projects" | "my_projects";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("vi-VN").format(d);
  } catch {
    return dateStr;
  }
}

export function ProjectTrackingWorkspace() {
  const { account } = useSession();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<ResearchProposal[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("proposals_summary");

  // Bộ lọc
  const [perspective, setPerspective] = useState<ViewPerspective>("all_projects");
  const [keyword, setKeyword] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [alertFilter, setAlertFilter] = useState<string>("all"); // all, overdue, due_soon, on_track

  // Trạng thái modal
  const [submittingMilestone, setSubmittingMilestone] = useState<ProjectMilestone | null>(null);
  const [remindingMilestone, setRemindingMilestone] = useState<ProjectMilestone | null>(null);

  // New Modals for Acceptance, Disbursement, and IRB
  const [isAcceptanceModalOpen, setIsAcceptanceModalOpen] = useState(false);
  const [isDisbursementModalOpen, setIsDisbursementModalOpen] = useState(false);
  const [isIRBModalOpen, setIsIRBModalOpen] = useState(false);
  const [modalTargetProposal, setModalTargetProposal] = useState<ResearchProposal | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Mốc báo cáo state (lưu cục bộ có thể cập nhật sau khi nộp/đôn đốc)
  const [customMilestones, setCustomMilestones] = useState<Record<string, Partial<ProjectMilestone>>>({});

  // Quyền: Có phải quản lý không?
  const isManager =
    account?.systemRole === "SCIENTIFIC_MANAGEMENT_STAFF" ||
    account?.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY" ||
    account?.systemRole === "SYSTEM_ADMIN";

  // Tự động chuyển perspective ban đầu nếu là Researcher
  useEffect(() => {
    if (!isManager) {
      setPerspective("my_projects");
    }
  }, [isManager]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await loadResearchProposals();
      setProposals(data);
    } catch (error) {
      console.error("Lỗi khi tải đề tài:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Đơn vị duy nhất
  const unitOptions = useMemo(() => {
    const map = new Map<string, string>();
    proposals.forEach((p) => {
      if (p.hostOrganizationUnitId) {
        map.set(p.hostOrganizationUnitId, p.hostOrganizationUnitName || p.hostOrganizationUnitId);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [proposals]);

  // Phân loại các đề tài đang thực hiện & Tạo các mốc báo cáo định kỳ
  const { activeProposals, generatedMilestones } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const list = proposals.filter((p) => p.status === "approved" || (p.startDate && p.endDate));
    const milestonesList: ProjectMilestone[] = [];

    const enhanced = list.map((proposal) => {
      const start = proposal.startDate ? new Date(proposal.startDate) : new Date();
      const end = proposal.endDate ? new Date(proposal.endDate) : new Date(start.getTime() + 730 * 24 * 3600 * 1000);

      const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const elapsedDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const remainingDays = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));

      // Tạo các mốc chuẩn cho đề tài
      const totalMonths = Math.round(totalDays / 30);
      const m1Date = new Date(start.getTime() + 180 * 24 * 3600 * 1000); // 6 tháng
      const m2Date = new Date(start.getTime() + (totalDays / 2) * 24 * 3600 * 1000); // Giữa kỳ
      const m3Date = new Date(start.getTime() + 540 * 24 * 3600 * 1000); // 18 tháng
      const m4Date = new Date(end.getTime() - 30 * 24 * 3600 * 1000); // Nghiệm thu (trước 1 tháng)

      const mDefs: Array<{
        suffix: string;
        name: string;
        type: ProjectMilestone["milestoneType"];
        date: Date;
        defaultStatus: ProjectMilestone["status"];
      }> = [
        {
          suffix: "m1",
          name: "Báo cáo tiến độ định kỳ 6 tháng lần 1",
          type: "periodic_6m",
          date: m1Date,
          defaultStatus: today > m1Date ? "submitted" : "pending"
        },
        {
          suffix: "m2",
          name: "Báo cáo đánh giá giữa kỳ (Mid-term)",
          type: "midterm",
          date: m2Date,
          defaultStatus: today > m2Date ? (today.getTime() - m2Date.getTime() > 15 * 86400000 ? "overdue" : "pending") : "pending"
        }
      ];

      if (totalMonths > 18) {
        mDefs.push({
          suffix: "m3",
          name: "Báo cáo tiến độ định kỳ lần 2 (18 tháng)",
          type: "periodic_18m",
          date: m3Date,
          defaultStatus: today > m3Date ? "overdue" : "pending"
        });
      }

      mDefs.push({
        suffix: "m4",
        name: "Báo cáo tổng kết & Nghiệm thu cơ sở",
        type: "final_acceptance",
        date: m4Date,
        defaultStatus: today > m4Date ? "overdue" : "pending"
      });

      // Tạo các đối tượng milestone thực tế
      const propMilestones: ProjectMilestone[] = mDefs.map((def) => {
        const mId = `${proposal.id}_${def.suffix}`;
        const daysRem = Math.round((def.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const override = customMilestones[mId] || {};

        let currentStatus: ProjectMilestone["status"] = override.status || def.defaultStatus;
        if (!override.status) {
          if (currentStatus === "submitted" || currentStatus === "approved") {
            // Đã nộp
          } else if (daysRem < 0) {
            currentStatus = "overdue";
          } else {
            currentStatus = "pending";
          }
        }

        const mItem: ProjectMilestone = {
          id: mId,
          proposalId: proposal.id,
          proposalCode: proposal.code || "NCKH-HVBQ",
          proposalTitle: proposal.title,
          piName: proposal.ownerDisplayName || "Chủ nhiệm đề tài",
          piId: proposal.ownerId,
          unitName: proposal.hostOrganizationUnitName || "Học viện Quân y",
          milestoneName: def.name,
          milestoneType: def.type,
          dueDate: formatDate(def.date.toISOString()),
          status: currentStatus,
          daysRemaining: daysRem,
          completionPercent: override.completionPercent,
          reportSummary: override.reportSummary,
          fileName: override.fileName,
          submittedAt: override.submittedAt
        };

        milestonesList.push(mItem);
        return mItem;
      });

      // Xác định trạng thái cảnh báo chung của đề tài
      const hasOverdueMilestone = propMilestones.some((m) => m.status === "overdue" && m.daysRemaining < 0);
      const hasDueSoonMilestone = propMilestones.some((m) => m.status === "pending" && m.daysRemaining >= 0 && m.daysRemaining <= 30);
      const isProjectOverdue = remainingDays < 0;

      let projectAlert: "overdue" | "due_soon" | "on_track" = "on_track";
      if (hasOverdueMilestone || isProjectOverdue) {
        projectAlert = "overdue";
      } else if (hasDueSoonMilestone || remainingDays <= 60) {
        projectAlert = "due_soon";
      }

      // Mốc tiếp theo
      const nextMilestone = propMilestones.find((m) => m.status !== "submitted" && m.status !== "approved") || propMilestones[propMilestones.length - 1];

      return {
        ...proposal,
        start,
        end,
        totalDays,
        elapsedDays,
        remainingDays,
        progressPercent,
        projectAlert,
        milestones: propMilestones,
        nextMilestone
      };
    });

    return {
      activeProposals: enhanced,
      generatedMilestones: milestonesList
    };
  }, [proposals, customMilestones]);

  // Lọc theo góc nhìn (Quản lý vs Chủ nhiệm đề tài)
  const userFilteredProposals = useMemo(() => {
    let list = activeProposals;
    if (perspective === "my_projects" && account?.id) {
      list = list.filter((p) => p.ownerId === account.id || p.submittedById === account.id);
    }
    return list;
  }, [activeProposals, perspective, account?.id]);

  // Lọc nâng cao (Từ khóa, Đơn vị, Cấp đề tài, Cảnh báo)
  const filteredProposals = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return userFilteredProposals.filter((p) => {
      const matchKw =
        !kw ||
        p.title.toLowerCase().includes(kw) ||
        (p.code && p.code.toLowerCase().includes(kw)) ||
        (p.ownerDisplayName && p.ownerDisplayName.toLowerCase().includes(kw));

      const matchUnit = !selectedUnit || p.hostOrganizationUnitId === selectedUnit;
      const matchLevel = !selectedLevel || p.proposalTypeCode === selectedLevel;

      let matchAlert = true;
      if (alertFilter === "overdue") matchAlert = p.projectAlert === "overdue";
      else if (alertFilter === "due_soon") matchAlert = p.projectAlert === "due_soon";
      else if (alertFilter === "on_track") matchAlert = p.projectAlert === "on_track";

      return matchKw && matchUnit && matchLevel && matchAlert;
    });
  }, [userFilteredProposals, keyword, selectedUnit, selectedLevel, alertFilter]);

  // Lọc mốc báo cáo tương ứng với danh sách đề tài sau lọc
  const filteredMilestones = useMemo(() => {
    const validProposalIds = new Set(filteredProposals.map((p) => p.id));
    return generatedMilestones.filter((m) => validProposalIds.has(m.proposalId));
  }, [generatedMilestones, filteredProposals]);

  // Thống kê KPIs
  const metrics = useMemo(() => {
    let overdueCount = 0;
    let dueSoonCount = 0;
    let onTrackCount = 0;
    let completedCount = 0;

    userFilteredProposals.forEach((p) => {
      if (p.projectAlert === "overdue") overdueCount++;
      else if (p.projectAlert === "due_soon") dueSoonCount++;
      else onTrackCount++;

      if (p.progressPercent >= 100) completedCount++;
    });

    const overdueMilestonesCount = filteredMilestones.filter((m) => m.status === "overdue").length;
    const dueSoonMilestonesCount = filteredMilestones.filter((m) => m.status === "pending" && m.daysRemaining >= 0 && m.daysRemaining <= 30).length;

    return {
      totalProposals: userFilteredProposals.length,
      overdueCount,
      dueSoonCount,
      onTrackCount,
      completedCount,
      overdueMilestonesCount,
      dueSoonMilestonesCount
    };
  }, [userFilteredProposals, filteredMilestones]);

  // Danh sách các cảnh báo khẩn cấp (Overdue & Due soon)
  const urgentAlerts = useMemo(() => {
    const list: ProjectMilestone[] = [];
    filteredMilestones.forEach((m) => {
      if (m.status === "overdue" || (m.status === "pending" && m.daysRemaining <= 30)) {
        list.push(m);
      }
    });
    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [filteredMilestones]);

  // Xử lý nộp báo cáo mốc
  const handleSubmitMilestoneSuccess = (
    milestoneId: string,
    data: { completionPercent: number; summary: string; fileName: string }
  ) => {
    setCustomMilestones((prev) => ({
      ...prev,
      [milestoneId]: {
        status: "submitted",
        completionPercent: data.completionPercent,
        reportSummary: data.summary,
        fileName: data.fileName,
        submittedAt: new Date().toISOString()
      }
    }));
    setSubmittingMilestone(null);
    showToast("Đã nộp báo cáo tiến độ thành công! Dữ liệu mốc báo cáo đã được cập nhật.");
  };

  // Xử lý gửi đôn đốc nhắc nhở
  const handleSendReminderSuccess = (milestoneId: string) => {
    setRemindingMilestone(null);
    showToast("Đã chuyển thông báo đôn đốc thành công đến Chủ nhiệm đề tài!");
  };

  // Xuất file CSV báo cáo theo dõi
  const exportProgressCsv = () => {
    const headers = [
      "Mã đề tài",
      "Tên đề tài nghiên cứu",
      "Chủ nhiệm đề tài",
      "Đơn vị chủ trì",
      "Cấp đề tài",
      "Ngày bắt đầu",
      "Ngày kết thúc",
      "Tiến độ (%)",
      "Trạng thái cảnh báo",
      "Mốc báo cáo tiếp theo",
      "Hạn nộp mốc"
    ];

    const rows = filteredProposals.map((p) => [
      `"${p.code || ""}"`,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.ownerDisplayName || ""}"`,
      `"${p.hostOrganizationUnitName || ""}"`,
      `"${getProposalLevelLabel(p.proposalTypeCode)}"`,
      `"${formatDate(p.startDate)}"`,
      `"${formatDate(p.endDate)}"`,
      `"${p.progressPercent}%"`,
      `"${p.projectAlert === "overdue" ? "Trễ hạn / Quá hạn" : p.projectAlert === "due_soon" ? "Sắp đến hạn báo cáo" : "Đúng tiến độ"}"`,
      `"${p.nextMilestone?.milestoneName || "N/A"}"`,
      `"${p.nextMilestone?.dueDate || "N/A"}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Theo_doi_tien_do_de_tai_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Đã xuất danh sách theo dõi tiến độ thành công!");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Toast thông báo */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "#064e3b",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "14px",
            fontWeight: 600
          }}
        >
          <CheckCircle2 size={20} color="#34d399" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* BANNER CẢNH BÁO TRỄ HẠN & ĐÔN ĐỐC TIẾN ĐỘ */}
      {urgentAlerts.length > 0 && (
        <div
          style={{
            background: metrics.overdueMilestonesCount > 0 ? "#fff1f2" : "#fffbeb",
            border: metrics.overdueMilestonesCount > 0 ? "1px solid #fecdd3" : "1px solid #fef3c7",
            borderRadius: "12px",
            padding: "18px 20px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.03)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div
                style={{
                  background: metrics.overdueMilestonesCount > 0 ? "#e11d48" : "#d97706",
                  color: "#ffffff",
                  padding: "8px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "15px", fontWeight: 700, color: metrics.overdueMilestonesCount > 0 ? "#9f1239" : "#92400e", display: "flex", alignItems: "center", gap: "8px" }}>
                  {perspective === "my_projects"
                    ? "Cảnh báo tiến độ mốc báo cáo đề tài của đồng chí"
                    : "Hệ thống cảnh báo trễ hạn & Đôn đốc tiến độ thực hiện đề tài"}
                  {metrics.overdueMilestonesCount > 0 && (
                    <span style={{ background: "#e11d48", color: "#fff", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: 800 }}>
                      {metrics.overdueMilestonesCount} mốc quá hạn
                    </span>
                  )}
                  {metrics.dueSoonMilestonesCount > 0 && (
                    <span style={{ background: "#d97706", color: "#fff", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", fontWeight: 800 }}>
                      {metrics.dueSoonMilestonesCount} mốc sắp đến hạn
                    </span>
                  )}
                </h3>
                <p style={{ margin: 0, fontSize: "12.5px", color: metrics.overdueMilestonesCount > 0 ? "#be123c" : "#b45309", lineHeight: 1.4 }}>
                  {perspective === "my_projects"
                    ? "Đồng chí có mốc báo cáo định kỳ cần khẩn trương hoàn thiện và nộp báo cáo trên hệ thống để đảm bảo tiến độ nghiệm thu."
                    : "Phát hiện các đề tài có mốc báo cáo quá hạn hoặc sắp đến hạn trong vòng 30 ngày. Đề nghị chuyên viên phụ trách kiểm tra và gửi thông báo đôn đốc."}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="button button-outline"
              style={{ fontSize: "12px", padding: "6px 12px", height: "auto", background: "#ffffff" }}
              onClick={() => setActiveTab("alerts_center")}
            >
              <Flame size={14} color="#e11d48" style={{ marginRight: "4px" }} />
              Xem trung tâm cảnh báo ({urgentAlerts.length})
            </button>
          </div>

          {/* Danh sách 3 cảnh báo cấp bách nhất */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "12px",
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: metrics.overdueMilestonesCount > 0 ? "1px dashed #fecdd3" : "1px dashed #fde68a"
            }}
          >
            {urgentAlerts.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  background: "#ffffff",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "10px"
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 700, color: "#064e3b", fontSize: "12px" }}>[{item.proposalCode}]</span>
                    {item.daysRemaining < 0 ? (
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#be123c", background: "#ffe4e6", padding: "2px 6px", borderRadius: "4px" }}>
                        Trễ {Math.abs(item.daysRemaining)} ngày
                      </span>
                    ) : (
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "2px 6px", borderRadius: "4px" }}>
                        Còn {item.daysRemaining} ngày
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", lineHeight: 1.3 }}>{item.milestoneName}</div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                    CN: <strong>{item.piName}</strong> ({item.unitName}) — Hạn: <strong>{item.dueDate}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "8px" }}>
                  {isManager && (
                    <button
                      type="button"
                      className="button button-outline"
                      style={{ fontSize: "11px", padding: "4px 8px", height: "auto", color: "#92400e", borderColor: "#fde68a", background: "#fffbeb" }}
                      onClick={() => setRemindingMilestone(item)}
                    >
                      <Send size={12} style={{ marginRight: "4px" }} /> Đôn đốc
                    </button>
                  )}
                  <button
                    type="button"
                    className="button"
                    style={{ fontSize: "11px", padding: "4px 10px", height: "auto", background: "#064e3b", color: "#ffffff" }}
                    onClick={() => setSubmittingMilestone(item)}
                  >
                    <FileText size={12} style={{ marginRight: "4px" }} /> Nộp báo cáo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TỔNG HỢP TRẠNG THÁI THỰC HIỆN (EXECUTIVE KPI CARDS) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px"
        }}
      >
        <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Đề tài đang thực hiện</span>
            <FolderKanban size={18} color="#064e3b" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "8px" }}>{metrics.totalProposals}</div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>
            <span style={{ color: "#064e3b", fontWeight: 700 }}>100%</span> trong danh mục theo dõi
          </div>
        </div>

        <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Đúng tiến độ</span>
            <CheckCircle2 size={18} color="#059669" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#059669", marginTop: "8px" }}>{metrics.onTrackCount}</div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>Đảm bảo các mốc NCKH</div>
        </div>

        <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Sắp đến hạn báo cáo</span>
            <Clock size={18} color="#d97706" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#d97706", marginTop: "8px" }}>{metrics.dueSoonCount}</div>
          <div style={{ fontSize: "11.5px", color: "#b45309", marginTop: "4px", fontWeight: 600 }}>Hạn nộp trong ≤ 30 ngày</div>
        </div>

        <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Chậm tiến độ / Quá hạn</span>
            <AlertTriangle size={18} color="#e11d48" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#e11d48", marginTop: "8px" }}>{metrics.overdueCount}</div>
          <div style={{ fontSize: "11.5px", color: "#e11d48", marginTop: "4px", fontWeight: 700 }}>Cần đôn đốc khẩn cấp</div>
        </div>

        <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: "12px", fontWeight: 600 }}>
            <span>Chờ nghiệm thu</span>
            <Sparkles size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#1d4ed8", marginTop: "8px" }}>{metrics.completedCount}</div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>Giai đoạn tổng kết</div>
        </div>
      </div>

      {/* THANH ĐIỀU HƯỚNG TABS & CHUYỂN ĐỔI GÓC NHÌN */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
        <nav className="tabs-nav" aria-label="Phân hệ Theo dõi đề tài" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab-btn ${activeTab === "proposals_summary" ? "active" : ""}`}
            onClick={() => setActiveTab("proposals_summary")}
          >
            <FolderKanban size={15} style={{ marginRight: "6px" }} />
            <span>Tổng hợp trạng thái đề tài</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "milestones_matrix" ? "active" : ""}`}
            onClick={() => setActiveTab("milestones_matrix")}
          >
            <Calendar size={15} style={{ marginRight: "6px" }} />
            <span>Ma trận Mốc báo cáo định kỳ ({filteredMilestones.length})</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "alerts_center" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts_center")}
          >
            <AlertTriangle size={15} color={urgentAlerts.length > 0 ? "#e11d48" : "currentColor"} style={{ marginRight: "6px" }} />
            <span>Trung tâm Cảnh báo trễ hạn ({urgentAlerts.length})</span>
          </button>
        </nav>

        {/* Chuyển đổi góc nhìn */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Góc nhìn:</span>
          <div style={{ display: "inline-flex", background: "#f1f5f9", padding: "3px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <button
              type="button"
              style={{
                border: "none",
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: perspective === "all_projects" ? 700 : 500,
                background: perspective === "all_projects" ? "#ffffff" : "transparent",
                color: perspective === "all_projects" ? "#064e3b" : "#64748b",
                boxShadow: perspective === "all_projects" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"
              }}
              onClick={() => setPerspective("all_projects")}
            >
              Toàn Học viện (Quản lý)
            </button>
            <button
              type="button"
              style={{
                border: "none",
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: perspective === "my_projects" ? 700 : 500,
                background: perspective === "my_projects" ? "#ffffff" : "transparent",
                color: perspective === "my_projects" ? "#064e3b" : "#64748b",
                boxShadow: perspective === "my_projects" ? "0 1px 2px rgba(0,0,0,0.06)" : "none"
              }}
              onClick={() => setPerspective("my_projects")}
            >
              Đề tài tôi chủ nhiệm (PI)
            </button>
          </div>
        </div>
      </div>

      {/* KHUNG BỘ LỌC TÌM KIẾM */}
      <div style={{ background: "#ffffff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>Tìm kiếm từ khóa</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "#94a3b8" }} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Mã, tên đề tài, chủ nhiệm..."
                style={{ width: "100%", fontSize: "12px", padding: "7px 10px 7px 30px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>Đơn vị chủ trì</label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              style={{ width: "100%", fontSize: "12px", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
            >
              <option value="">Tất cả đơn vị</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>Cấp đề tài</label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              style={{ width: "100%", fontSize: "12px", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
            >
              <option value="">Tất cả cấp đề tài</option>
              {Object.entries(PROPOSAL_LEVEL_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px" }}>Cảnh báo tiến độ</label>
            <select
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value)}
              style={{ width: "100%", fontSize: "12px", padding: "7px 10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }}
            >
              <option value="all">Tất cả tình trạng</option>
              <option value="overdue">🚨 Chậm tiến độ / Quá hạn</option>
              <option value="due_soon">⚠️ Sắp đến hạn báo cáo (≤ 30 ngày)</option>
              <option value="on_track">✅ Đang đúng tiến độ</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #f1f5f9", fontSize: "12px" }}>
          <span style={{ color: "#64748b" }}>
            Hiển thị <strong>{filteredProposals.length}</strong> đề tài nghiên cứu khoa học
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="button button-outline"
              style={{ fontSize: "12px", padding: "6px 12px", height: "auto" }}
              onClick={exportProgressCsv}
            >
              <FileSpreadsheet size={14} color="#059669" style={{ marginRight: "4px" }} /> Xuất Excel theo dõi
            </button>
            <button
              type="button"
              className="button button-outline"
              style={{ fontSize: "12px", padding: "6px 12px", height: "auto" }}
              onClick={loadData}
            >
              <RefreshCw size={14} style={{ marginRight: "4px" }} className={loading ? "animate-spin" : ""} /> Làm mới
            </button>
          </div>
        </div>
      </div>

      {/* NỘI DUNG CHÍNH CỦA CÁC TAB */}

      {/* TAB 1: TỔNG HỢP TRẠNG THÁI ĐỀ TÀI */}
      {activeTab === "proposals_summary" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
              <FolderKanban size={16} color="#064e3b" />
              Bảng theo dõi tiến độ thực hiện đề tài khoa học
            </h3>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Cập nhật theo thời gian thực</span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px", width: "40px", textAlign: "center" }}>STT</th>
                  <th style={{ padding: "10px 12px" }}>Mã & Tên đề tài</th>
                  <th style={{ padding: "10px 12px" }}>Chủ nhiệm (PI) & Đơn vị</th>
                  <th style={{ padding: "10px 12px", width: "140px" }}>Thời gian thực hiện</th>
                  <th style={{ padding: "10px 12px", width: "160px" }}>Tiến độ thực tế</th>
                  <th style={{ padding: "10px 12px" }}>Mốc báo cáo kế tiếp</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: "130px" }}>Cảnh báo tiến độ</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: "120px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredProposals.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                      Không tìm thấy đề tài nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredProposals.map((proposal, idx) => (
                    <tr key={proposal.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: "12px", maxWidth: "280px" }}>
                        <span style={{ fontWeight: 700, color: "#064e3b", display: "block", marginBottom: "2px", fontSize: "12px" }}>
                          {proposal.code || "NCKH-2026"}
                        </span>
                        <Link
                          href={`/proposals?id=${proposal.id}`}
                          style={{ fontWeight: 600, color: "#1e293b", textDecoration: "none", lineHeight: 1.3, display: "block" }}
                        >
                          {proposal.title}
                        </Link>
                        <span style={{ fontSize: "10.5px", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", marginTop: "4px", display: "inline-block" }}>
                          {getProposalLevelLabel(proposal.proposalTypeCode)}
                        </span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{proposal.ownerDisplayName || "—"}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{proposal.hostOrganizationUnitName || "Học viện Quân y"}</div>
                      </td>

                      <td style={{ padding: "12px", color: "#475569", fontSize: "12px" }}>
                        <div>{formatDate(proposal.startDate)}</div>
                        <div style={{ color: "#94a3b8" }}>đến {formatDate(proposal.endDate)}</div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, color: "#1e293b" }}>{proposal.progressPercent}%</span>
                          <span style={{ color: "#64748b" }}>
                            {proposal.remainingDays < 0 ? `Quá ${Math.abs(proposal.remainingDays)} ngày` : `Còn ${proposal.remainingDays} ngày`}
                          </span>
                        </div>
                        <div style={{ width: "100%", background: "#e2e8f0", height: "6px", borderRadius: "4px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${proposal.progressPercent}%`,
                              height: "100%",
                              borderRadius: "4px",
                              background: proposal.projectAlert === "overdue" ? "#e11d48" : proposal.projectAlert === "due_soon" ? "#d97706" : "#059669"
                            }}
                          />
                        </div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {proposal.nextMilestone ? (
                          <div>
                            <div style={{ fontWeight: 600, color: "#334155" }}>{proposal.nextMilestone.milestoneName}</div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              Hạn nộp: <strong>{proposal.nextMilestone.dueDate}</strong>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Đã nghiệm thu</span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {proposal.projectAlert === "overdue" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#ffe4e6", color: "#be123c", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "10px" }}>
                            <Flame size={11} /> Quá hạn
                          </span>
                        ) : proposal.projectAlert === "due_soon" ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#b45309", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "10px" }}>
                            <Clock size={11} /> Sắp đến hạn
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#d1fae5", color: "#065f46", fontSize: "11px", fontWeight: 700, padding: "3px 8px", borderRadius: "10px" }}>
                            <CheckCircle2 size={11} /> Đúng hạn
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: "4px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="button button-outline"
                            style={{ fontSize: "11px", padding: "4px 7px", height: "auto", display: "inline-flex", alignItems: "center", gap: "3px", color: "#065f46" }}
                            onClick={() => {
                              setModalTargetProposal(proposal);
                              setIsDisbursementModalOpen(true);
                            }}
                            title="Giám sát Giải ngân & Quyết toán theo mốc"
                          >
                            <DollarSign size={11} /> Kinh phí
                          </button>

                          <button
                            type="button"
                            className="button button-outline"
                            style={{ fontSize: "11px", padding: "4px 7px", height: "auto", display: "inline-flex", alignItems: "center", gap: "3px", color: "#1e3a8a" }}
                            onClick={() => {
                              setModalTargetProposal(proposal);
                              setIsAcceptanceModalOpen(true);
                            }}
                            title="Hội đồng Nghiệm thu & Đánh giá kết quả (4 tiêu chí)"
                          >
                            <Award size={11} /> Nghiệm thu
                          </button>

                          <button
                            type="button"
                            className="button button-outline"
                            style={{ fontSize: "11px", padding: "4px 7px", height: "auto", display: "inline-flex", alignItems: "center", gap: "3px", color: "#be123c" }}
                            onClick={() => {
                              setModalTargetProposal(proposal);
                              setIsIRBModalOpen(true);
                            }}
                            title="Phê duyệt Hội đồng Đạo đức Y sinh (IRB)"
                          >
                            <HeartPulse size={11} /> IRB
                          </button>

                          {proposal.nextMilestone && (
                            <button
                              type="button"
                              className="button button-outline"
                              style={{ fontSize: "11px", padding: "4px 7px", height: "auto" }}
                              onClick={() => setSubmittingMilestone(proposal.nextMilestone!)}
                            >
                              Nộp BC
                            </button>
                          )}
                          {isManager && proposal.nextMilestone && (
                            <button
                              type="button"
                              className="button button-outline"
                              style={{ fontSize: "11px", padding: "4px 7px", height: "auto", color: "#be123c", borderColor: "#fecdd3" }}
                              onClick={() => setRemindingMilestone(proposal.nextMilestone!)}
                            >
                              Đôn đốc
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: MA TRẬN MỐC BÁO CÁO ĐỊNH KỲ */}
      {activeTab === "milestones_matrix" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={16} color="#064e3b" />
                Lịch trình & Chi tiết các mốc báo cáo định kỳ
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "#64748b" }}>
                Bao gồm Báo cáo 6 tháng đợt 1, Báo cáo đánh giá giữa kỳ (Mid-term) và Báo cáo tổng kết nghiệm thu cơ sở.
              </p>
            </div>
            <a
              href="/documents"
              className="button button-outline"
              style={{ fontSize: "12px", padding: "5px 10px", height: "auto", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}
            >
              <Download size={13} /> Tải Mẫu 07/BC-KHQS
            </a>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px", width: "40px", textAlign: "center" }}>STT</th>
                  <th style={{ padding: "10px 12px" }}>Tên mốc báo cáo</th>
                  <th style={{ padding: "10px 12px" }}>Đề tài liên quan</th>
                  <th style={{ padding: "10px 12px" }}>Chủ nhiệm (PI)</th>
                  <th style={{ padding: "10px 12px" }}>Hạn nộp (Due Date)</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Thời hạn còn lại</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Trạng thái nộp</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: "140px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredMilestones.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                      Chưa có mốc báo cáo nào trong danh mục.
                    </td>
                  </tr>
                ) : (
                  filteredMilestones.map((milestone, idx) => (
                    <tr key={milestone.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 700, color: "#1e293b" }}>{milestone.milestoneName}</div>
                        <span style={{ fontSize: "10.5px", color: "#64748b", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", marginTop: "2px", display: "inline-block" }}>
                          {milestone.milestoneType === "periodic_6m"
                            ? "Định kỳ 6 tháng"
                            : milestone.milestoneType === "midterm"
                            ? "Đánh giá giữa kỳ"
                            : milestone.milestoneType === "periodic_18m"
                            ? "Định kỳ 18 tháng"
                            : "Nghiệm thu tổng kết"}
                        </span>
                      </td>

                      <td style={{ padding: "12px", maxWidth: "260px" }}>
                        <span style={{ fontWeight: 700, color: "#064e3b", display: "block", fontSize: "11.5px" }}>[{milestone.proposalCode}]</span>
                        <span style={{ color: "#475569", lineHeight: 1.2, display: "block" }}>{milestone.proposalTitle}</span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{milestone.piName}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{milestone.unitName}</div>
                      </td>

                      <td style={{ padding: "12px", fontWeight: 700, color: "#334155" }}>{milestone.dueDate}</td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {milestone.status === "submitted" || milestone.status === "approved" ? (
                          <span style={{ color: "#059669", fontWeight: 600, fontSize: "11px" }}>Đã hoàn tất</span>
                        ) : milestone.daysRemaining < 0 ? (
                          <span style={{ color: "#be123c", fontWeight: 700, fontSize: "11px", background: "#ffe4e6", padding: "2px 6px", borderRadius: "10px" }}>
                            Trễ {Math.abs(milestone.daysRemaining)} ngày
                          </span>
                        ) : milestone.daysRemaining <= 30 ? (
                          <span style={{ color: "#b45309", fontWeight: 700, fontSize: "11px", background: "#fef3c7", padding: "2px 6px", borderRadius: "10px" }}>
                            Còn {milestone.daysRemaining} ngày
                          </span>
                        ) : (
                          <span style={{ color: "#64748b", fontSize: "11px" }}>Còn {milestone.daysRemaining} ngày</span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {milestone.status === "submitted" ? (
                          <span style={{ background: "#d1fae5", color: "#065f46", fontWeight: 700, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                            Đã nộp ({milestone.completionPercent || 80}%)
                          </span>
                        ) : milestone.status === "approved" ? (
                          <span style={{ background: "#dbeafe", color: "#1e40af", fontWeight: 700, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                            Đã duyệt
                          </span>
                        ) : milestone.status === "overdue" ? (
                          <span style={{ background: "#ffe4e6", color: "#be123c", fontWeight: 700, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                            Quá hạn
                          </span>
                        ) : (
                          <span style={{ background: "#f1f5f9", color: "#475569", fontWeight: 600, fontSize: "11px", padding: "2px 8px", borderRadius: "10px" }}>
                            Chờ nộp
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: "4px" }}>
                          <button
                            type="button"
                            className="button button-outline"
                            style={{ fontSize: "11px", padding: "4px 8px", height: "auto" }}
                            onClick={() => setSubmittingMilestone(milestone)}
                          >
                            {milestone.status === "submitted" ? "Cập nhật" : "Nộp báo cáo"}
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              className="button button-outline"
                              style={{ fontSize: "11px", padding: "4px 8px", height: "auto", color: "#be123c", borderColor: "#fecdd3" }}
                              onClick={() => setRemindingMilestone(milestone)}
                            >
                              Đôn đốc
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRUNG TÂM CẢNH BÁO TRỄ HẠN */}
      {activeTab === "alerts_center" && (
        <div style={{ background: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                <ShieldAlert size={16} color="#e11d48" />
                Danh sách cảnh báo vi phạm tiến độ & mốc báo cáo cần xử lý
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "#64748b" }}>
                Tập trung các mốc đã quá hạn hoặc đến hạn trong vòng 30 ngày để xử lý khẩn cấp.
              </p>
            </div>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#be123c", background: "#ffe4e6", padding: "4px 10px", borderRadius: "8px" }}>
              {urgentAlerts.length} cảnh báo cần xử lý
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#f8fafc", color: "#475569", fontWeight: 700, borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px", width: "40px", textAlign: "center" }}>STT</th>
                  <th style={{ padding: "10px 12px" }}>Mức độ cảnh báo</th>
                  <th style={{ padding: "10px 12px" }}>Mốc báo cáo vi phạm</th>
                  <th style={{ padding: "10px 12px" }}>Đề tài nghiên cứu</th>
                  <th style={{ padding: "10px 12px" }}>Chủ nhiệm (PI)</th>
                  <th style={{ padding: "10px 12px" }}>Hạn chót quy định</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Thời gian trễ / Còn lại</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", width: "130px" }}>Hành động xử lý</th>
                </tr>
              </thead>
              <tbody>
                {urgentAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <CheckCircle2 size={32} color="#059669" />
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>
                          Tuyệt vời! Hiện tại không có mốc báo cáo nào bị trễ hạn hoặc sắp đến hạn khẩn cấp.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  urgentAlerts.map((alert, idx) => (
                    <tr key={alert.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", textAlign: "center", color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: "12px" }}>
                        {alert.daysRemaining < 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#ffe4e6", color: "#be123c", fontSize: "11px", fontWeight: 800, padding: "3px 8px", borderRadius: "10px" }}>
                            <Flame size={12} /> Báo động Đỏ: Quá hạn
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#b45309", fontSize: "11px", fontWeight: 800, padding: "3px 8px", borderRadius: "10px" }}>
                            <Clock size={12} /> Báo động Vàng: Sắp đến hạn
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px", fontWeight: 700, color: "#0f172a" }}>{alert.milestoneName}</td>

                      <td style={{ padding: "12px", maxWidth: "260px" }}>
                        <span style={{ fontWeight: 700, color: "#064e3b", display: "block", fontSize: "11.5px" }}>[{alert.proposalCode}]</span>
                        <span style={{ color: "#475569" }}>{alert.proposalTitle}</span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{alert.piName}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{alert.unitName}</div>
                      </td>

                      <td style={{ padding: "12px", fontWeight: 700, color: "#334155" }}>{alert.dueDate}</td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {alert.daysRemaining < 0 ? (
                          <span style={{ color: "#be123c", fontWeight: 800, fontSize: "12px" }}>
                            Quá hạn {Math.abs(alert.daysRemaining)} ngày
                          </span>
                        ) : (
                          <span style={{ color: "#b45309", fontWeight: 800, fontSize: "12px" }}>
                            Còn {alert.daysRemaining} ngày
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "center" }}>
                        {isManager ? (
                          <button
                            type="button"
                            className="button"
                            style={{ fontSize: "11px", padding: "5px 10px", height: "auto", background: "#e11d48", color: "#fff", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            onClick={() => setRemindingMilestone(alert)}
                          >
                            <Send size={11} /> Gửi đôn đốc
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button"
                            style={{ fontSize: "11px", padding: "5px 10px", height: "auto", background: "#064e3b", color: "#fff", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            onClick={() => setSubmittingMilestone(alert)}
                          >
                            <FileText size={11} /> Nộp ngay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}
      {submittingMilestone && (
        <SubmitMilestoneReportModal
          milestone={submittingMilestone}
          onClose={() => setSubmittingMilestone(null)}
          onSubmitSuccess={handleSubmitMilestoneSuccess}
        />
      )}

      {remindingMilestone && (
        <SendDeadlineReminderModal
          milestone={remindingMilestone}
          onClose={() => setRemindingMilestone(null)}
          onSendSuccess={handleSendReminderSuccess}
        />
      )}

      {/* Modal Hội đồng Nghiệm thu & Đánh giá kết quả */}
      {modalTargetProposal && isAcceptanceModalOpen && (
        <AcceptanceCouncilModal
          isOpen={isAcceptanceModalOpen}
          onClose={() => {
            setIsAcceptanceModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}

      {/* Modal Giám sát Giải ngân & Quyết toán theo mốc */}
      {modalTargetProposal && isDisbursementModalOpen && (
        <MilestoneDisbursementModal
          isOpen={isDisbursementModalOpen}
          onClose={() => {
            setIsDisbursementModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}

      {/* Modal Phê duyệt Hội đồng Đạo đức Y sinh (IRB) */}
      {modalTargetProposal && isIRBModalOpen && (
        <IRBApprovalModal
          isOpen={isIRBModalOpen}
          onClose={() => {
            setIsIRBModalOpen(false);
            setModalTargetProposal(null);
          }}
          proposal={modalTargetProposal}
          currentUserRole={account?.systemRole}
          currentUserUsername={account?.username}
          onSuccess={() => void loadData()}
        />
      )}
    </div>
  );
}
