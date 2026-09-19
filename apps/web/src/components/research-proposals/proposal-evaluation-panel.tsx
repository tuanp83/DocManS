"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Save,
  Send,
  UserMinus,
  UserPlus,
  Users,
  Calendar,
  MapPin,
  Award,
  Printer,
  Clock,
  AlertCircle,
  FileDown,
  Plus,
  Trash2
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatIntakeDate, intakeDateToIso } from "@/lib/intake-dates";
import {
  assignProposalReviewer,
  loadReviewerCandidates,
  type ReviewerCandidates,
  loadCouncilCandidates,
  type CouncilCandidate,
  loadProposalReviewProgress,
  revokeProposalReviewAssignment,
  isNotEntitled,
  saveProposalEvaluationSummary,
  type EvaluationApiError,
  type ProposalReviewProgress,
  type ReviewAssignmentRole
} from "@/lib/proposal-evaluations-api";
import {
  loadResearchProposal,
  proposeProposalCouncil,
  recordProposalCouncilMinutes,
  type ResearchProposal,
  type CouncilMemberRole,
  type CouncilMember
} from "@/lib/research-proposals-api";
import { OfficialCouncilDecisionModal } from "@/components/research-proposals/official-council-decision-modal";
import {
  exportCouncilDecisionWord,
  exportCouncilMinutesWord,
  exportEvaluationSummaryWord,
  exportIndividualReviewWord
} from "@/lib/word-export";

function formatDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Chưa có";
}

function formatDueDate(value: string) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value)) : "Không đặt hạn";
}

const COUNCIL_ROLE_LABELS: Record<CouncilMemberRole, string> = {
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

/**
 * ST-3.2 + ST-3.4 + Epic 10 Council Workflow:
 * - Giai đoạn 1: Trưởng phòng KHQS lập Tờ trình đề xuất Hội đồng & Trình Lãnh đạo Học viện phê duyệt.
 * - Giai đoạn 2: Ghi nhận Biên bản & Kết luận phiên họp Hội đồng (Council Minutes).
 * - Vòng đánh giá: Phân công, theo dõi phiếu điểm và tổng hợp kết quả trình phê duyệt đề tài.
 */
export function ProposalEvaluationPanel({
  proposalId,
  onWorkflowChange,
  canAssignReviewers,
  canConsolidate,
  blockedReason,
  consolidateBlockedReason,
  contextVersion
}: {
  proposalId: string;
  onWorkflowChange: () => void;
  canAssignReviewers: boolean;
  canConsolidate: boolean;
  blockedReason: string;
  consolidateBlockedReason: string;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
}) {
  const [proposal, setProposal] = useState<ResearchProposal | null>(null);
  const [progress, setProgress] = useState<ProposalReviewProgress | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  const [candidates, setCandidates] = useState<ReviewerCandidates>({ profiles: [] });
  const [candidateQuery, setCandidateQuery] = useState("");
  const [profileId, setProfileId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [assignmentRole, setAssignmentRole] = useState<ReviewAssignmentRole>("reviewer");
  const [dueDate, setDueDate] = useState("");
  const [assignError, setAssignError] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [revokingId, setRevokingId] = useState("");

  const [summaryText, setSummaryText] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  const [savingMode, setSavingMode] = useState<"" | "draft" | "ready">("");
  const [message, setMessage] = useState("");

  // --- State Hội đồng (Giai đoạn 1) ---
  const [councilMeetingDate, setCouncilMeetingDate] = useState("");
  const [councilMeetingLocation, setCouncilMeetingLocation] = useState("Phòng họp 1 - Tòa nhà Trung tâm - Học viện Quân y");
  const [councilTentativeAgenda, setCouncilTentativeAgenda] = useState(
    "1. Tuyên bố lý do, giới thiệu đại biểu. 2. Công bố Quyết định thành lập Hội đồng. 3. Chủ nhiệm báo cáo tóm tắt thuyết minh. 4. Các phản biện và thành viên cho ý kiến. 5. Hội đồng thảo luận, bỏ phiếu đánh giá."
  );
  const [councilCandidates, setCouncilCandidates] = useState<CouncilCandidate[]>([]);

  // Chủ tịch & Thư ký (cho phép tùy chỉnh chức danh và đơn vị quản lý/công tác)
  const [chairState, setChairState] = useState<DynamicCouncilMember>({
    id: "chair",
    candidateId: "",
    isCustom: false,
    name: "",
    title: "Giáo sư, Tiến sĩ",
    unit: "Ban Giám đốc Học viện"
  });
  const [secretaryState, setSecretaryState] = useState<DynamicCouncilMember>({
    id: "secretary",
    candidateId: "",
    isCustom: false,
    name: "",
    title: "Tiến sĩ",
    unit: "Phòng Khoa học Quân sự"
  });

  // Dynamic Reviewers (Ủy viên Phản biện - có thể thêm/bớt linh hoạt tùy ý)
  const [councilReviewers, setCouncilReviewers] = useState<DynamicCouncilMember[]>([
    {
      id: "rev-1",
      candidateId: "",
      isCustom: false,
      name: "",
      title: "Phó Giáo sư, Tiến sĩ",
      unit: "Khoa Ngoại Dã chiến"
    },
    {
      id: "rev-2",
      candidateId: "",
      isCustom: false,
      name: "",
      title: "Phó Giáo sư, Tiến sĩ",
      unit: "Bệnh viện Trung ương Quân đội 108"
    }
  ]);

  // Dynamic Members (Ủy viên Hội đồng - có thể thêm/bớt linh hoạt tùy ý)
  const [councilMembers, setCouncilMembers] = useState<DynamicCouncilMember[]>([
    {
      id: "mem-1",
      candidateId: "",
      isCustom: false,
      name: "",
      title: "Tiến sĩ, BSCKII",
      unit: "Trung tâm Chẩn đoán hình ảnh"
    }
  ]);

  const [isSubmittingCouncil, setIsSubmittingCouncil] = useState(false);
  const [councilError, setCouncilError] = useState("");
  const [councilSuccess, setCouncilSuccess] = useState("");
  const [isCouncilDecisionModalOpen, setIsCouncilDecisionModalOpen] = useState(false);

  // --- State Biên bản họp Hội đồng (Giai đoạn 2) ---
  const [minutesConductedAt, setMinutesConductedAt] = useState("");
  const [minutesConclusion, setMinutesConclusion] = useState<"approved" | "revision_required" | "rejected">("approved");
  const [minutesAverageScore, setMinutesAverageScore] = useState<number>(85);
  const [minutesComments, setMinutesComments] = useState("");
  const [minutesModifications, setMinutesModifications] = useState("");
  const [isSavingMinutes, setIsSavingMinutes] = useState(false);
  const [minutesError, setMinutesError] = useState("");
  const [minutesSuccess, setMinutesSuccess] = useState("");

  function addReviewer() {
    setCouncilReviewers((prev) => [
      ...prev,
      {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        candidateId: "",
        isCustom: false,
        name: "",
        title: "Tiến sĩ",
        unit: "Học viện Quân y"
      }
    ]);
  }

  function removeReviewer(id: string) {
    if (councilReviewers.length <= 1) {
      alert("Hội đồng cần có ít nhất 1 Ủy viên Phản biện.");
      return;
    }
    setCouncilReviewers((prev) => prev.filter((r) => r.id !== id));
  }

  function updateReviewer(id: string, patch: Partial<DynamicCouncilMember>) {
    setCouncilReviewers((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function addCouncilMember() {
    setCouncilMembers((prev) => [
      ...prev,
      {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        candidateId: "",
        isCustom: false,
        name: "",
        title: "Tiến sĩ",
        unit: "Học viện Quân y"
      }
    ]);
  }

  function removeCouncilMember(id: string) {
    setCouncilMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function updateCouncilMember(id: string, patch: Partial<DynamicCouncilMember>) {
    setCouncilMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  function applyStandardMODCouncil(roster: CouncilCandidate[] = councilCandidates) {
    const unconflicted = roster.filter((c) => !c.isConflicted);
    if (unconflicted.length === 0) return;

    const leader = unconflicted.find((c) => c.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY") || unconflicted[0];
    const staff = unconflicted.find((c) => c.systemRole === "SCIENTIFIC_MANAGEMENT_STAFF" && c.id !== leader?.id) || unconflicted[1];
    const researchers = unconflicted.filter((c) => c.id !== leader?.id && c.id !== staff?.id);

    if (leader) {
      setChairState({
        id: "chair",
        candidateId: leader.id,
        isCustom: false,
        name: leader.fullName,
        title: leader.academicTitle,
        unit: leader.unit
      });
    }
    if (staff) {
      setSecretaryState({
        id: "secretary",
        candidateId: staff.id,
        isCustom: false,
        name: staff.fullName,
        title: staff.academicTitle,
        unit: staff.unit
      });
    }

    const defaultRevs: DynamicCouncilMember[] = [];
    if (researchers[0]) {
      defaultRevs.push({
        id: "rev-1",
        candidateId: researchers[0].id,
        isCustom: false,
        name: researchers[0].fullName,
        title: researchers[0].academicTitle || "Phó Giáo sư, Tiến sĩ",
        unit: researchers[0].unit || "Khoa Ngoại Dã chiến"
      });
    }
    if (researchers[1]) {
      defaultRevs.push({
        id: "rev-2",
        candidateId: researchers[1].id,
        isCustom: false,
        name: researchers[1].fullName,
        title: researchers[1].academicTitle || "Phó Giáo sư, Tiến sĩ",
        unit: researchers[1].unit || "Bệnh viện Trung ương Quân đội 108"
      });
    }
    if (defaultRevs.length > 0) {
      setCouncilReviewers(defaultRevs);
    }

    if (researchers[2]) {
      setCouncilMembers([
        {
          id: "mem-1",
          candidateId: researchers[2].id,
          isCustom: false,
          name: researchers[2].fullName,
          title: researchers[2].academicTitle,
          unit: researchers[2].unit
        }
      ]);
    }
  }

  async function refresh() {
    try {
      const [progressData, proposalData] = await Promise.all([
        loadProposalReviewProgress(proposalId),
        loadResearchProposal(proposalId).catch(() => null)
      ]);
      setProgress(progressData);
      if (proposalData) {
        setProposal(proposalData);
        if (proposalData.councilMetadata?.meetingDate) {
          setCouncilMeetingDate(proposalData.councilMetadata.meetingDate.split("T")[0] || "");
        }
        if (proposalData.councilMetadata?.meetingLocation) {
          setCouncilMeetingLocation(proposalData.councilMetadata.meetingLocation);
        }
        if (proposalData.councilMetadata?.tentativeAgenda) {
          setCouncilTentativeAgenda(proposalData.councilMetadata.tentativeAgenda);
        }

        // Khôi phục thành viên Hội đồng nếu đã có
        if (proposalData.councilMetadata?.members && proposalData.councilMetadata.members.length > 0) {
          const savedMembers = proposalData.councilMetadata.members;
          const chair = savedMembers.find((m) => m.role === "chair");
          const sec = savedMembers.find((m) => m.role === "secretary");
          const revs = savedMembers.filter((m) => m.role === "reviewer_1" || m.role === "reviewer_2" || m.role === "reviewer" || m.roleLabel?.toLowerCase().includes("phản biện"));
          const mems = savedMembers.filter((m) => m !== chair && m !== sec && !revs.includes(m));

          if (chair) {
            setChairState({
              id: "chair",
              candidateId: chair.userId || "",
              isCustom: !chair.userId,
              name: chair.displayName,
              title: chair.academicTitle || "",
              unit: chair.unit || chair.organization || ""
            });
          }
          if (sec) {
            setSecretaryState({
              id: "secretary",
              candidateId: sec.userId || "",
              isCustom: !sec.userId,
              name: sec.displayName,
              title: sec.academicTitle || "",
              unit: sec.unit || sec.organization || ""
            });
          }
          if (revs.length > 0) {
            setCouncilReviewers(
              revs.map((r, i) => ({
                id: `rev-${i + 1}`,
                candidateId: r.userId || "",
                isCustom: !r.userId,
                name: r.displayName,
                title: r.academicTitle || "",
                unit: r.unit || r.organization || ""
              }))
            );
          }
          if (mems.length > 0) {
            setCouncilMembers(
              mems.map((m, i) => ({
                id: `mem-${i + 1}`,
                candidateId: m.userId || "",
                isCustom: !m.userId,
                name: m.displayName,
                title: m.academicTitle || "",
                unit: m.unit || m.organization || ""
              }))
            );
          }
        }

        // Init Stage 2 state if exists
        const min = proposalData.councilMetadata?.councilMinutes;
        if (min) {
          setMinutesConductedAt(min.meetingConductedAt ? min.meetingConductedAt.split("T")[0] : "");
          setMinutesConclusion(min.conclusion || "approved");
          setMinutesAverageScore(min.averageScore ?? 85);
          setMinutesComments(min.summaryComments || "");
          setMinutesModifications(min.modificationsRequired || "");
        }
      }

      // Load Council Candidates with COI analysis
      try {
        const cData = await loadCouncilCandidates(proposalId);
        const fetched = cData.candidates || [];
        setCouncilCandidates(fetched);

        const unconflicted = fetched.filter((c) => !c.isConflicted);
        if (unconflicted.length > 0) {
          const leader = unconflicted.find((c) => c.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY") || unconflicted[0];
          const staff = unconflicted.find((c) => c.systemRole === "SCIENTIFIC_MANAGEMENT_STAFF" && c.id !== leader?.id) || unconflicted[1];
          const researchers = unconflicted.filter((c) => c.id !== leader?.id && c.id !== staff?.id);

          setChairState((prev) => (prev.candidateId || prev.name ? prev : {
            id: "chair",
            candidateId: leader?.id || "",
            isCustom: false,
            name: leader?.fullName || "",
            title: leader?.academicTitle || "Giáo sư, Tiến sĩ",
            unit: leader?.unit || "Ban Giám đốc Học viện"
          }));

          setSecretaryState((prev) => (prev.candidateId || prev.name ? prev : {
            id: "secretary",
            candidateId: staff?.id || "",
            isCustom: false,
            name: staff?.fullName || "",
            title: staff?.academicTitle || "Tiến sĩ",
            unit: staff?.unit || "Phòng Khoa học Quân sự"
          }));

          setCouncilReviewers((prev) => (prev[0]?.candidateId || prev[0]?.name ? prev : [
            {
              id: "rev-1",
              candidateId: researchers[0]?.id || "",
              isCustom: false,
              name: researchers[0]?.fullName || "",
              title: researchers[0]?.academicTitle || "Phó Giáo sư, Tiến sĩ",
              unit: researchers[0]?.unit || "Khoa Ngoại Dã chiến"
            },
            {
              id: "rev-2",
              candidateId: researchers[1]?.id || "",
              isCustom: false,
              name: researchers[1]?.fullName || "",
              title: researchers[1]?.academicTitle || "Phó Giáo sư, Tiến sĩ",
              unit: researchers[1]?.unit || "Bệnh viện Trung ương Quân đội 108"
            }
          ]));

          setCouncilMembers((prev) => (prev[0]?.candidateId || prev[0]?.name ? prev : [
            {
              id: "mem-1",
              candidateId: researchers[2]?.id || "",
              isCustom: false,
              name: researchers[2]?.fullName || "",
              title: researchers[2]?.academicTitle || "Tiến sĩ, BSCKII",
              unit: researchers[2]?.unit || "Trung tâm Chẩn đoán hình ảnh"
            }
          ]));
        }
      } catch (cErr) {
        console.warn("Could not load council candidates:", cErr);
      }

      if (canAssignReviewers) {
        try {
          const cand = await loadReviewerCandidates(proposalId, candidateQuery);
          setCandidates(cand);
          setAssignError("");
        } catch (error) {
          setCandidates({ profiles: [] });
          setAssignError(error instanceof Error ? error.message : "Không tải được người đánh giá.");
        }
      } else {
        setCandidates({ profiles: [] });
      }


      if (!summaryDirty) {
        setSummaryText(progressData.evaluationSummary?.summary ?? "");
        setRecommendation(progressData.evaluationSummary?.recommendation ?? "");
      }
      setState("ready");
    } catch (error) {
      if (isNotEntitled(error)) {
        setState("forbidden");
        return;
      }
      setLoadError(error instanceof Error ? error.message : "Không tải được tiến độ đánh giá.");
      setState("error");
    }
  }

  useEffect(() => {
    void refresh();
  }, [proposalId, canAssignReviewers, contextVersion?.aggregateVersion]);

  if (state === "loading") {
    return <p className="state-message">Đang tải tiến độ đánh giá & Hội đồng...</p>;
  }

  if (state === "error") {
    return <p className="state-message error">{loadError}</p>;
  }

  if (state === "forbidden" || !progress) {
    return (
      <SectionCard title="Phân công đánh giá" subtitle="Người phản biện và thành viên hội đồng">
        <button className="button primary" type="button" disabled title={blockedReason}>
          Phân công người đánh giá
        </button>
        <p className="record-meta">{blockedReason}</p>
      </SectionCard>
    );
  }

  const canAssign = canAssignReviewers;
  const isReadyForApproval = progress.evaluationSummary?.status === "ready_for_approval";
  const council = proposal?.councilMetadata;
  const isCouncilApproved = council?.status === "approved";
  const isCouncilSubmitted = council?.status === "submitted";

  // --- Handlers Hội đồng (Giai đoạn 1) ---
  async function handleProposeCouncil(submitToLeadership: boolean) {
    setCouncilError("");
    setCouncilSuccess("");

    const findCandidate = (id: string) => councilCandidates.find((c) => c.id === id || c.userId === id);
    const findProfile = (id: string) => candidates.profiles.find((p) => p.id === id);

    const resolveMemberData = (
      item: DynamicCouncilMember,
      role: CouncilMemberRole,
      defaultRoleLabel: string
    ): CouncilMember => {
      if (item.isCustom) {
        if (!item.name.trim()) throw new Error(`Vui lòng nhập họ tên cho vị trí ${defaultRoleLabel}.`);
        return {
          role,
          roleLabel: defaultRoleLabel,
          displayName: item.name.trim(),
          academicTitle: item.title.trim() || "Nhà khoa học",
          unit: item.unit.trim() || "Đơn vị ngoài"
        };
      }
      const cand = findCandidate(item.candidateId);
      if (cand) {
        if (cand.isConflicted) {
          throw new Error(`Đồng chí ${cand.fullName} có xung đột lợi ích (${cand.conflictReason || "không hợp lệ"}), không thể tham gia Hội đồng.`);
        }
        return {
          role,
          roleLabel: defaultRoleLabel,
          userId: cand.userId || undefined,
          displayName: cand.fullName,
          academicTitle: item.title.trim() || cand.academicTitle,
          unit: item.unit.trim() || cand.unit
        };
      }
      const p = findProfile(item.candidateId);
      if (p) {
        return {
          role,
          roleLabel: defaultRoleLabel,
          userId: p.linkedUserId,
          displayName: p.fullName,
          academicTitle: item.title.trim() || "Tiến sĩ",
          unit: item.unit.trim() || "Học viện Quân y"
        };
      }
      if (item.name.trim()) {
        return {
          role,
          roleLabel: defaultRoleLabel,
          displayName: item.name.trim(),
          academicTitle: item.title.trim() || "Nhà khoa học",
          unit: item.unit.trim() || "Học viện Quân y"
        };
      }
      throw new Error(`Vui lòng chọn hoặc nhập chuyên gia cho vị trí ${defaultRoleLabel}.`);
    };

    const members: CouncilMember[] = [];
    try {
      members.push(resolveMemberData(chairState, "chair", COUNCIL_ROLE_LABELS.chair));
      members.push(resolveMemberData(secretaryState, "secretary", COUNCIL_ROLE_LABELS.secretary));

      councilReviewers.forEach((rev, idx) => {
        const role: CouncilMemberRole = idx === 0 ? "reviewer_1" : idx === 1 ? "reviewer_2" : "reviewer";
        const label = `Ủy viên Phản biện ${idx + 1}`;
        members.push(resolveMemberData(rev, role, label));
      });

      councilMembers.forEach((mem, idx) => {
        if (mem.candidateId || mem.name.trim()) {
          const label = councilMembers.length > 1 ? `Ủy viên Hội đồng ${idx + 1}` : "Ủy viên Hội đồng";
          members.push(resolveMemberData(mem, "member", label));
        }
      });
    } catch (validationErr) {
      setCouncilError(validationErr instanceof Error ? validationErr.message : "Dữ liệu thành viên Hội đồng chưa hợp lệ.");
      return;
    }

    setIsSubmittingCouncil(true);
    try {
      await proposeProposalCouncil(proposalId, {
        meetingDate: councilMeetingDate ? intakeDateToIso(councilMeetingDate) : undefined,
        meetingLocation: councilMeetingLocation,
        tentativeAgenda: councilTentativeAgenda,
        members,
        submitToLeadership
      });
      setCouncilSuccess(
        submitToLeadership
          ? "Đã gửi tờ trình đề xuất Hội đồng lên Lãnh đạo Học viện phê duyệt thành công!"
          : "Đã lưu bản nháp tờ trình đề xuất Hội đồng."
      );
      await refresh();
      onWorkflowChange();
    } catch (err) {
      setCouncilError(err instanceof Error ? err.message : "Không thể gửi tờ trình Hội đồng.");
    } finally {
      setIsSubmittingCouncil(false);
    }
  }

  // --- Handlers Biên bản họp Hội đồng (Giai đoạn 2) ---
  async function handleSaveMinutes(e: React.FormEvent) {
    e.preventDefault();
    setMinutesError("");
    setMinutesSuccess("");
    setIsSavingMinutes(true);

    try {
      await recordProposalCouncilMinutes(proposalId, {
        meetingConductedAt: minutesConductedAt ? intakeDateToIso(minutesConductedAt) : undefined,
        conclusion: minutesConclusion,
        averageScore: Number(minutesAverageScore) || 0,
        summaryComments: minutesComments,
        modificationsRequired: minutesModifications
      });
      setMinutesSuccess("Đã ghi nhận Biên bản & Kết luận phiên họp Hội đồng thành công!");
      // Pre-fill consolidation summary with council conclusion
      if (!summaryDirty) {
        setSummaryText(
          `Hội đồng đánh giá đề tài đã họp và kết luận: ${
            minutesConclusion === "approved"
              ? "Đạt yêu cầu (Đề nghị phê duyệt)"
              : minutesConclusion === "revision_required"
              ? "Đạt nhưng cần chỉnh sửa bổ sung"
              : "Không đạt yêu cầu"
          }. Điểm trung bình: ${minutesAverageScore}/100. ${minutesComments}`
        );
        setRecommendation(minutesConclusion === "approved" ? "approve" : minutesConclusion === "revision_required" ? "revise" : "reject");
        setSummaryDirty(true);
      }
      await refresh();
      onWorkflowChange();
    } catch (err) {
      setMinutesError(err instanceof Error ? err.message : "Không thể lưu biên bản Hội đồng.");
    } finally {
      setIsSavingMinutes(false);
    }
  }

  // --- Handlers Phân công cá nhân & Tổng hợp kết quả ---
  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignError("");
    setMessage("");

    if (!profileId) {
      setAssignError("Chọn hồ sơ nhà khoa học đã liên kết tài khoản.");
      return;
    }

    if (!window.confirm("Xác nhận người đánh giá, hồ sơ nhà khoa học, vai trò và thời hạn phân công?")) return;
    setIsAssigning(true);
    try {
      await assignProposalReviewer(proposalId, {
        researcherProfileId: profileId,
        contextVersion,
        effectiveFrom: effectiveFrom ? intakeDateToIso(effectiveFrom) : undefined,
        effectiveUntil: effectiveUntil ? intakeDateToIso(effectiveUntil, true) : undefined,
        assignmentRole,
        dueDate: dueDate ? intakeDateToIso(dueDate, true) : undefined
      });
      setProfileId("");
      setDueDate("");
      setMessage("Đã phân công người đánh giá.");
      await refresh();
      onWorkflowChange();
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : "Không thể phân công người đánh giá.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRevoke(assignmentId: string, reviewerName: string) {
    setAssignError("");
    setMessage("");
    if (!window.confirm(`Thu hồi phân công đánh giá của ${reviewerName}? Lịch sử phân công vẫn được giữ lại.`)) {
      return;
    }

    const reason = window.prompt("Lý do thu hồi phân công:");
    if (!reason?.trim()) return;
    setRevokingId(assignmentId);
    try {
      await revokeProposalReviewAssignment(proposalId, assignmentId, reason, contextVersion);
      setMessage("Đã thu hồi phân công đánh giá.");
      await refresh();
      onWorkflowChange();
    } catch (error) {
      setAssignError(error instanceof Error ? error.message : "Không thể thu hồi phân công.");
    } finally {
      setRevokingId("");
    }
  }

  async function handleSaveSummary(markReady: boolean) {
    setSummaryError("");
    setPendingNames([]);
    setMessage("");

    if (!summaryText.trim()) {
      setSummaryError("Nhập nội dung tổng hợp kết quả đánh giá.");
      return;
    }
    if (!recommendation) {
      setSummaryError("Chọn kết luận tổng hợp.");
      return;
    }
    if (markReady && !window.confirm("Gửi lãnh đạo phê duyệt? Vòng đánh giá sẽ được đóng lại.")) {
      return;
    }

    setSavingMode(markReady ? "ready" : "draft");
    try {
      await saveProposalEvaluationSummary(proposalId, { summary: summaryText, recommendation, markReady });
      setSummaryDirty(false);
      setMessage(markReady ? "Đã gửi hồ sơ tới lãnh đạo phê duyệt." : "Đã lưu bản nháp tổng hợp.");
      await refresh();
      onWorkflowChange();
    } catch (error) {
      const evaluationError = error as EvaluationApiError;
      setSummaryError(evaluationError.message);
      setPendingNames((evaluationError.pendingReviewers ?? []).map((item) => item.reviewerDisplayName).filter(Boolean));
    } finally {
      setSavingMode("");
    }
  }

  return (
    <>
      {/* =========================================================================
          KHỐI 1: HỘI ĐỒNG TƯ VẤN ĐÁNH GIÁ ĐỀ TÀI (GIAI ĐOẠN 1 & 2)
          ========================================================================= */}
      <SectionCard
        title="Hội đồng tư vấn đánh giá / xét duyệt đề tài"
        subtitle="Quy trình lập tờ trình từ Trưởng phòng KHQS trình Lãnh đạo Học viện phê chuẩn & ban hành Quyết định"
        action={
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
        }
      >
        {/* Trường hợp A: Hội đồng đã được Lãnh đạo phê duyệt */}
        {isCouncilApproved ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", fontWeight: 700, fontSize: "15px" }}>
                  <Award size={18} />
                  Quyết định thành lập Hội đồng: {council?.decisionNumber || "ĐÃ BAN HÀNH"}
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#15803d" }}>
                  Ký ban hành ngày: <strong>{council?.decidedAt ? formatDate(council.decidedAt) : "—"}</strong> bởi{" "}
                  <strong>{council?.decidedByName || "Giám đốc Học viện"}</strong>.
                  {council?.approvalNote ? ` — Ý kiến chỉ đạo: "${council.approvalNote}"` : ""}
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="button secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => proposal && exportCouncilDecisionWord(proposal)}
                  title="Tải văn bản Quyết định thành lập Hội đồng (.doc)"
                >
                  <FileDown size={15} /> Lưu Quyết định HĐ (Word)
                </button>
                <button
                  type="button"
                  className="button primary"
                  style={{ background: "#15803d", borderColor: "#15803d", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", whiteSpace: "nowrap" }}
                  onClick={() => setIsCouncilDecisionModalOpen(true)}
                >
                  <Printer size={15} /> Xem & In Quyết định thành lập HĐ
                </button>
              </div>
            </div>

            {/* Bảng thành viên Hội đồng chính thức */}
            <div>
              <span style={{ fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "8px", color: "#1e293b" }}>
                Danh sách thành viên Hội đồng chính thức:
              </span>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", width: "150px" }}>Trách nhiệm</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Họ và tên</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Học hàm, học vị</th>
                    <th style={{ padding: "8px 10px", textAlign: "left" }}>Đơn vị công tác</th>
                  </tr>
                </thead>
                <tbody>
                  {council?.members?.map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: m.role === "chair" ? "#15803d" : "#334155" }}>
                        {m.roleLabel}
                      </td>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{m.displayName}</td>
                      <td style={{ padding: "8px 10px", color: "#64748b" }}>{m.academicTitle || "—"}</td>
                      <td style={{ padding: "8px 10px", color: "#64748b" }}>{m.unit || m.organization || "Học viện Quân y"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* GIAI ĐOẠN 2: BIÊN BẢN & KẾT LUẬN PHIÊN HỌP HỘI ĐỒNG */}
            <div
              style={{
                marginTop: "12px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "16px",
                background: "#f8fafc"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <Award size={18} color="#15803d" />
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  Giai đoạn 2: Biên bản & Kết luận phiên họp Hội đồng
                </h4>
              </div>

              {council?.councilMinutes ? (
                <div style={{ background: "#ffffff", padding: "14px", borderRadius: "6px", border: "1px solid #e2e8f0", marginBottom: "14px", fontSize: "13px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontWeight: 700, color: "#166534", fontSize: "14px" }}>
                        Kết luận: {council.councilMinutes.conclusionLabel}
                      </span>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ padding: "2px 8px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        onClick={() => proposal && exportCouncilMinutesWord(proposal)}
                        title="Tải Biên bản họp Hội đồng dưới dạng file Word (.doc)"
                      >
                        <FileDown size={13} /> Lưu Biên bản (Word)
                      </button>
                    </div>
                    <span style={{ fontWeight: 700, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "10px" }}>
                      Điểm trung bình: {council.councilMinutes.averageScore}/100
                    </span>
                  </div>
                  <p style={{ margin: "4px 0", color: "#334155" }}>
                    <strong>Nhận xét chung:</strong> {council.councilMinutes.summaryComments || "Chưa có"}
                  </p>
                  {council.councilMinutes.modificationsRequired && (
                    <p style={{ margin: "4px 0", color: "#92400e" }}>
                      <strong>Yêu cầu chỉnh sửa:</strong> {council.councilMinutes.modificationsRequired}
                    </p>
                  )}
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "#64748b" }}>
                    Biên bản ghi nhận bởi: <strong>{council.councilMinutes.recordedByName}</strong> lúc{" "}
                    {council.councilMinutes.recordedAt ? formatDate(council.councilMinutes.recordedAt) : "—"}
                  </p>
                </div>
              ) : null}

              {/* Form cập nhật biên bản họp */}
              <form onSubmit={handleSaveMinutes} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                  Ghi nhận / Cập nhật nội dung phiên họp Hội đồng:
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Ngày họp thực tế:</span>
                    <input
                      type="date"
                      value={minutesConductedAt}
                      onChange={(e) => setMinutesConductedAt(e.target.value)}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Kết luận Hội đồng:</span>
                    <select
                      value={minutesConclusion}
                      onChange={(e) => setMinutesConclusion(e.target.value as any)}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    >
                      <option value="approved">Đạt yêu cầu (Đề nghị phê duyệt)</option>
                      <option value="revision_required">Đạt nhưng cần chỉnh sửa bổ sung</option>
                      <option value="rejected">Không đạt yêu cầu</option>
                    </select>
                  </label>
                  <label className="field" style={{ margin: 0 }}>
                    <span style={{ fontSize: "12px" }}>Điểm TB của Hội đồng (/100):</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={minutesAverageScore}
                      onChange={(e) => setMinutesAverageScore(Number(e.target.value))}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                  </label>
                </div>

                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: "12px" }}>Nhận xét, đánh giá chung của Hội đồng:</span>
                  <textarea
                    rows={2}
                    value={minutesComments}
                    onChange={(e) => setMinutesComments(e.target.value)}
                    placeholder="Tóm tắt nhận xét về tính cấp thiết, tính khả thi, phương pháp nghiên cứu..."
                    style={{ padding: "6px 10px", fontSize: "13px" }}
                  />
                </label>

                <label className="field" style={{ margin: 0 }}>
                  <span style={{ fontSize: "12px" }}>Nội dung yêu cầu Chủ nhiệm chỉnh sửa, bổ sung (nếu có):</span>
                  <textarea
                    rows={2}
                    value={minutesModifications}
                    onChange={(e) => setMinutesModifications(e.target.value)}
                    placeholder="Các nội dung cần chỉnh sửa theo biên bản họp..."
                    style={{ padding: "6px 10px", fontSize: "13px" }}
                  />
                </label>

                {minutesError && <p className="form-error">{minutesError}</p>}
                {minutesSuccess && <p className="state-message success">{minutesSuccess}</p>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    onClick={() => {
                      if (!proposal) return;
                      const draftProposal = {
                        ...proposal,
                        councilMetadata: {
                          ...proposal.councilMetadata,
                          councilMinutes: {
                            meetingDate: minutesConductedAt || new Date().toISOString(),
                            averageScore: minutesAverageScore,
                            conclusion: minutesConclusion,
                            conclusionLabel: minutesConclusion === "approved" ? "Đạt yêu cầu (Đề nghị phê duyệt)" : minutesConclusion === "revision_required" ? "Đạt nhưng cần chỉnh sửa" : "Không đạt yêu cầu",
                            summaryComments: minutesComments,
                            modificationsRequired: minutesModifications
                          }
                        }
                      };
                      exportCouncilMinutesWord(draftProposal);
                    }}
                    title="Tải biên bản họp theo nội dung đang soạn thảo (.doc)"
                  >
                    <FileDown size={14} /> Xuất dự thảo Biên bản (Word)
                  </button>
                  <button
                    type="submit"
                    className="button"
                    style={{ background: "#15803d", color: "#ffffff", borderColor: "#15803d", fontSize: "13px" }}
                    disabled={isSavingMinutes}
                  >
                    {isSavingMinutes ? "Đang lưu..." : "Lưu Biên bản & Kết luận Hội đồng"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : isCouncilSubmitted ? (
          /* Trường hợp B: Tờ trình đã gửi, chờ Lãnh đạo duyệt */
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
                <strong>Tờ trình thành lập Hội đồng đã được gửi Lãnh đạo Học viện phê duyệt</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "13px" }}>
                  Thời điểm trình: {council?.proposedAt ? formatDate(council.proposedAt) : "Mới đây"} bởi{" "}
                  <strong>{council?.proposedByName || "Trưởng phòng KHQS"}</strong>. Đang chờ Giám đốc Học viện xem xét ký ban hành Quyết định.
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
        ) : (
          /* Trường hợp C: Chưa trình hoặc bản nháp - Cho phép Trưởng phòng KHQS lập Tờ trình */
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Thanh công cụ cơ cấu & thêm thành viên */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "10px 14px",
                flexWrap: "wrap",
                gap: "8px"
              }}
            >
              <p style={{ margin: 0, fontSize: "13px", color: "#334155" }}>
                Đồng chí Trưởng phòng KHQS xây dựng cơ cấu Hội đồng tư vấn tuyển chọn/xét duyệt (gồm Chủ tịch, Thư ký, các Ủy viên Phản biện và các Ủy viên Hội đồng). Đơn vị quản lý / công tác có thể tự do điều chỉnh trực tiếp cho từng cá nhân.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {councilCandidates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => applyStandardMODCouncil()}
                    className="button"
                    style={{ fontSize: "12px", background: "#f1f5f9", borderColor: "#cbd5e1", color: "#0f172a", whiteSpace: "nowrap" }}
                  >
                    ⚡ Gợi ý cơ cấu chuẩn (Thông tư 57/BQP)
                  </button>
                )}
                <button
                  type="button"
                  onClick={addReviewer}
                  className="button secondary"
                  style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
                >
                  <Plus size={14} /> Thêm Ủy viên Phản biện
                </button>
                <button
                  type="button"
                  onClick={addCouncilMember}
                  className="button secondary"
                  style={{ fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}
                >
                  <Plus size={14} /> Thêm Ủy viên Hội đồng
                </button>
              </div>
            </div>

            {/* KHỐI 1: CHỦ TỊCH & THƯ KÝ */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {/* 1. CHỦ TỊCH HỘI ĐỒNG */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>1. Chủ tịch Hội đồng:</span>
                  <button
                    type="button"
                    onClick={() => setChairState((prev) => ({ ...prev, isCustom: !prev.isCustom }))}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                  >
                    {chairState.isCustom ? "← Chọn từ danh mục" : "+ Mời chuyên gia ngoài"}
                  </button>
                </div>

                {chairState.isCustom ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                    <input
                      type="text"
                      placeholder="Họ và tên Chủ tịch Hội đồng"
                      value={chairState.name}
                      onChange={(e) => setChairState({ ...chairState, name: e.target.value })}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      <input
                        type="text"
                        placeholder="Học hàm, học vị (VD: GS. TS.)"
                        value={chairState.title}
                        onChange={(e) => setChairState({ ...chairState, title: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Học hàm, học vị"
                      />
                      <input
                        type="text"
                        placeholder="Đơn vị quản lý / công tác"
                        value={chairState.unit}
                        onChange={(e) => setChairState({ ...chairState, unit: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      value={chairState.candidateId}
                      onChange={(e) => {
                        const candId = e.target.value;
                        const cand = councilCandidates.find((c) => c.id === candId);
                        setChairState({
                          ...chairState,
                          candidateId: candId,
                          name: cand ? cand.fullName : "",
                          title: cand ? cand.academicTitle : chairState.title,
                          unit: cand ? cand.unit : chairState.unit
                        });
                      }}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    >
                      <option value="">-- Chọn Chủ tịch Hội đồng --</option>
                      {councilCandidates.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.isConflicted}>
                          {c.fullName} — {c.academicTitle} ({c.unit}) {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "4px" }}>
                      <input
                        type="text"
                        placeholder="Học hàm, học vị"
                        value={chairState.title}
                        onChange={(e) => setChairState({ ...chairState, title: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Học hàm, học vị"
                      />
                      <input
                        type="text"
                        placeholder="Đơn vị quản lý / công tác"
                        value={chairState.unit}
                        onChange={(e) => setChairState({ ...chairState, unit: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* 2. THƯ KÝ KHOA HỌC */}
              <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>2. Thư ký khoa học:</span>
                  <button
                    type="button"
                    onClick={() => setSecretaryState((prev) => ({ ...prev, isCustom: !prev.isCustom }))}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                  >
                    {secretaryState.isCustom ? "← Chọn từ danh mục" : "+ Mời chuyên gia ngoài"}
                  </button>
                </div>

                {secretaryState.isCustom ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                    <input
                      type="text"
                      placeholder="Họ và tên Thư ký khoa học"
                      value={secretaryState.name}
                      onChange={(e) => setSecretaryState({ ...secretaryState, name: e.target.value })}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                      <input
                        type="text"
                        placeholder="Học hàm, học vị (VD: TS.)"
                        value={secretaryState.title}
                        onChange={(e) => setSecretaryState({ ...secretaryState, title: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Học hàm, học vị"
                      />
                      <input
                        type="text"
                        placeholder="Đơn vị quản lý / công tác"
                        value={secretaryState.unit}
                        onChange={(e) => setSecretaryState({ ...secretaryState, unit: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      value={secretaryState.candidateId}
                      onChange={(e) => {
                        const candId = e.target.value;
                        const cand = councilCandidates.find((c) => c.id === candId);
                        setSecretaryState({
                          ...secretaryState,
                          candidateId: candId,
                          name: cand ? cand.fullName : "",
                          title: cand ? cand.academicTitle : secretaryState.title,
                          unit: cand ? cand.unit : secretaryState.unit
                        });
                      }}
                      style={{ padding: "6px 10px", fontSize: "13px" }}
                    >
                      <option value="">-- Chọn Thư ký khoa học --</option>
                      {councilCandidates.map((c) => (
                        <option key={c.id} value={c.id} disabled={c.isConflicted}>
                          {c.fullName} — {c.academicTitle} ({c.unit}) {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "4px" }}>
                      <input
                        type="text"
                        placeholder="Học hàm, học vị"
                        value={secretaryState.title}
                        onChange={(e) => setSecretaryState({ ...secretaryState, title: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Học hàm, học vị"
                      />
                      <input
                        type="text"
                        placeholder="Đơn vị quản lý / công tác"
                        value={secretaryState.unit}
                        onChange={(e) => setSecretaryState({ ...secretaryState, unit: e.target.value })}
                        style={{ padding: "6px 8px", fontSize: "12px" }}
                        title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* KHỐI 2: CÁC ỦY VIÊN PHẢN BIỆN (DYNAMIIC) */}
            <div style={{ marginTop: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                  Ủy viên Phản biện ({councilReviewers.length} đồng chí):
                </span>
                <button
                  type="button"
                  onClick={addReviewer}
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Plus size={13} /> Thêm Phản biện
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {councilReviewers.map((rev, idx) => (
                  <div
                    key={rev.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                        Ủy viên Phản biện {idx + 1}:
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => updateReviewer(rev.id, { isCustom: !rev.isCustom })}
                          style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                        >
                          {rev.isCustom ? "← Từ danh mục" : "+ Mời ngoài"}
                        </button>
                        {councilReviewers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeReviewer(rev.id)}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px", padding: 0 }}
                            title="Xóa Ủy viên Phản biện này"
                          >
                            <Trash2 size={13} /> Xóa
                          </button>
                        )}
                      </div>
                    </div>

                    {rev.isCustom ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                        <input
                          type="text"
                          placeholder={`Họ và tên Phản biện ${idx + 1}`}
                          value={rev.name}
                          onChange={(e) => updateReviewer(rev.id, { name: e.target.value })}
                          style={{ padding: "6px 10px", fontSize: "13px" }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                          <input
                            type="text"
                            placeholder="Học hàm, học vị (VD: PGS. TS.)"
                            value={rev.title}
                            onChange={(e) => updateReviewer(rev.id, { title: e.target.value })}
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            title="Học hàm, học vị"
                          />
                          <input
                            type="text"
                            placeholder="Đơn vị quản lý / công tác"
                            value={rev.unit}
                            onChange={(e) => updateReviewer(rev.id, { unit: e.target.value })}
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <select
                          value={rev.candidateId}
                          onChange={(e) => {
                            const candId = e.target.value;
                            const cand = councilCandidates.find((c) => c.id === candId);
                            updateReviewer(rev.id, {
                              candidateId: candId,
                              name: cand ? cand.fullName : "",
                              title: cand ? cand.academicTitle : rev.title,
                              unit: cand ? cand.unit : rev.unit
                            });
                          }}
                          style={{ padding: "6px 10px", fontSize: "13px" }}
                        >
                          <option value="">-- Chọn Phản biện {idx + 1} --</option>
                          {councilCandidates.map((c) => (
                            <option key={c.id} value={c.id} disabled={c.isConflicted}>
                              {c.fullName} — {c.academicTitle} ({c.unit}) {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
                            </option>
                          ))}
                        </select>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "4px" }}>
                          <input
                            type="text"
                            placeholder="Học hàm, học vị"
                            value={rev.title}
                            onChange={(e) => updateReviewer(rev.id, { title: e.target.value })}
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            title="Học hàm, học vị"
                          />
                          <input
                            type="text"
                            placeholder="Đơn vị quản lý / công tác"
                            value={rev.unit}
                            onChange={(e) => updateReviewer(rev.id, { unit: e.target.value })}
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* KHỐI 3: CÁC ỦY VIÊN HỘI ĐỒNG (DYNAMIC) */}
            <div style={{ marginTop: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                  Ủy viên Hội đồng ({councilMembers.length} đồng chí):
                </span>
                <button
                  type="button"
                  onClick={addCouncilMember}
                  className="button secondary"
                  style={{ fontSize: "12px", padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <Plus size={13} /> Thêm Ủy viên Hội đồng
                </button>
              </div>

              {councilMembers.length === 0 ? (
                <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: "8px", padding: "14px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                  Chưa có Ủy viên Hội đồng bổ sung. Bấm nút <strong>"+ Thêm Ủy viên Hội đồng"</strong> ở trên nếu muốn bổ sung thành viên Hội đồng.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  {councilMembers.map((mem, idx) => (
                    <div
                      key={mem.id}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b" }}>
                          Ủy viên Hội đồng {councilMembers.length > 1 ? idx + 1 : ""}:
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => updateCouncilMember(mem.id, { isCustom: !mem.isCustom })}
                            style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0 }}
                          >
                            {mem.isCustom ? "← Từ danh mục" : "+ Mời ngoài"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCouncilMember(mem.id)}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px", padding: 0 }}
                            title="Xóa Ủy viên Hội đồng này"
                          >
                            <Trash2 size={13} /> Xóa
                          </button>
                        </div>
                      </div>

                      {mem.isCustom ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                          <input
                            type="text"
                            placeholder="Họ và tên Ủy viên Hội đồng"
                            value={mem.name}
                            onChange={(e) => updateCouncilMember(mem.id, { name: e.target.value })}
                            style={{ padding: "6px 10px", fontSize: "13px" }}
                          />
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                            <input
                              type="text"
                              placeholder="Học hàm, học vị (VD: TS. BSCKII.)"
                              value={mem.title}
                              onChange={(e) => updateCouncilMember(mem.id, { title: e.target.value })}
                              style={{ padding: "6px 8px", fontSize: "12px" }}
                              title="Học hàm, học vị"
                            />
                            <input
                              type="text"
                              placeholder="Đơn vị quản lý / công tác"
                              value={mem.unit}
                              onChange={(e) => updateCouncilMember(mem.id, { unit: e.target.value })}
                              style={{ padding: "6px 8px", fontSize: "12px" }}
                              title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <select
                            value={mem.candidateId}
                            onChange={(e) => {
                              const candId = e.target.value;
                              const cand = councilCandidates.find((c) => c.id === candId);
                              updateCouncilMember(mem.id, {
                                candidateId: candId,
                                name: cand ? cand.fullName : "",
                                title: cand ? cand.academicTitle : mem.title,
                                unit: cand ? cand.unit : mem.unit
                              });
                            }}
                            style={{ padding: "6px 10px", fontSize: "13px" }}
                          >
                            <option value="">-- Chọn Ủy viên Hội đồng --</option>
                            {councilCandidates.map((c) => (
                              <option key={c.id} value={c.id} disabled={c.isConflicted}>
                                {c.fullName} — {c.academicTitle} ({c.unit}) {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginTop: "4px" }}>
                            <input
                              type="text"
                              placeholder="Học hàm, học vị"
                              value={mem.title}
                              onChange={(e) => updateCouncilMember(mem.id, { title: e.target.value })}
                              style={{ padding: "6px 8px", fontSize: "12px" }}
                              title="Học hàm, học vị"
                            />
                            <input
                              type="text"
                              placeholder="Đơn vị quản lý / công tác"
                              value={mem.unit}
                              onChange={(e) => updateCouncilMember(mem.id, { unit: e.target.value })}
                              style={{ padding: "6px 8px", fontSize: "12px" }}
                              title="Đơn vị quản lý / công tác (có thể tự do điều chỉnh)"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>


            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Dự kiến ngày họp:</span>
                <input
                  type="date"
                  value={councilMeetingDate}
                  onChange={(e) => setCouncilMeetingDate(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600 }}>Địa điểm họp:</span>
                <input
                  type="text"
                  value={councilMeetingLocation}
                  onChange={(e) => setCouncilMeetingLocation(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px" }}
                />
              </label>
            </div>

            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>Dự thảo nội dung phiên họp:</span>
              <textarea
                rows={2}
                value={councilTentativeAgenda}
                onChange={(e) => setCouncilTentativeAgenda(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "13px" }}
              />
            </label>

            {councilError && <p className="form-error">{councilError}</p>}
            {councilSuccess && <p className="state-message success">{councilSuccess}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                className="button"
                onClick={() => handleProposeCouncil(false)}
                disabled={isSubmittingCouncil}
                style={{ fontSize: "13px" }}
              >
                Lưu nháp tờ trình
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => handleProposeCouncil(true)}
                disabled={isSubmittingCouncil}
                style={{ background: "#15803d", borderColor: "#15803d", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Send size={15} />
                {isSubmittingCouncil ? "Đang gửi..." : "Trình Lãnh đạo Học viện phê duyệt"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* =========================================================================
          KHỐI 2: DANH SÁCH PHÂN CÔNG ĐÁNH GIÁ & TIẾN ĐỘ CHẤM ĐIỂM
          ========================================================================= */}
      <SectionCard
        title="Phân công đánh giá"
        subtitle="Người phản biện và thành viên hội đồng được phân công cho hồ sơ này"
        action={<StatusBadge status={progress.proposalStatus} />}
      >
        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Đang phân công</span>
            <span className="meta-value">{progress.activeAssignmentCount}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Đã gửi phiếu</span>
            <span className="meta-value">{progress.submittedCount}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Còn chờ</span>
            <span className="meta-value">{progress.pendingCount}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Điểm trung bình</span>
            <span className="meta-value">
              {progress.averageTotalScore === null ? "Chưa có" : `${progress.averageTotalScore}/${progress.maxTotalScore}`}
            </span>
          </div>
        </div>

        {assignError ? <p className="form-error">{assignError}</p> : null}
        {message ? (
          <p className="state-message success" role="status">
            {message}
          </p>
        ) : null}

        {progress.assignments.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Người đánh giá</th>
                  <th>Vai trò</th>
                  <th>Hạn đánh giá</th>
                  <th>Trạng thái phân công</th>
                  <th>Tình trạng phiếu</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {progress.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <span className="record-title">{assignment.reviewerDisplayName}</span>
                      <span className="record-meta">
                        {assignment.reviewerUnit} · Phân công {formatDate(assignment.assignedAt)}
                      </span>
                      <span className="record-meta">Người phân công: {assignment.assignedByDisplayName}</span>
                    </td>
                    <td>{assignment.assignmentRoleLabel}</td>
                    <td>{formatDueDate(assignment.dueDate)}</td>
                    <td>
                      <span className="record-title">{assignment.statusLabel}</span>
                      <span className="record-meta">Hiệu lực từ {formatIntakeDate(assignment.effectiveFrom)}</span>
                      {assignment.effectiveUntil ? <span className="record-meta">Đến {formatIntakeDate(assignment.effectiveUntil)}</span> : null}
                      {assignment.completedAt ? <span className="record-meta">Hoàn thành {formatDate(assignment.completedAt)}</span> : null}
                      {assignment.revokedAt ? <span className="record-meta">Thu hồi {formatDate(assignment.revokedAt)}</span> : null}
                    </td>
                    <td>
                      {assignment.reviewStatus === "submitted" ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span className="record-title">
                              Đã gửi · {assignment.reviewTotalScore}/{progress.maxTotalScore}
                            </span>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ padding: "1px 6px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "3px" }}
                              onClick={() => {
                                if (!proposal) return;
                                exportIndividualReviewWord(proposal, {
                                  reviewerDisplayName: assignment.reviewerDisplayName,
                                  reviewerUnit: assignment.reviewerUnit,
                                  assignmentRoleLabel: assignment.assignmentRoleLabel,
                                  reviewTotalScore: assignment.reviewTotalScore,
                                  reviewRecommendationLabel: assignment.reviewRecommendationLabel
                                });
                              }}
                              title="Tải Phiếu nhận xét, đánh giá chuyên môn dưới dạng file Word (.doc)"
                            >
                              <FileDown size={11} /> Word
                            </button>
                          </div>
                          <span className="record-meta">{assignment.reviewRecommendationLabel}</span>
                        </>
                      ) : (
                        <span className="record-meta">Chưa gửi phiếu</span>
                      )}
                    </td>
                    <td>
                      {assignment.status === "assigned" || assignment.status === "completed" ? (
                        <button
                          className="button icon-button danger"
                          type="button"
                          title="Thu hồi phân công"
                          aria-label={`Thu hồi phân công của ${assignment.reviewerDisplayName}`}
                          disabled={!canAssign || revokingId === assignment.id}
                          onClick={() => void handleRevoke(assignment.id, assignment.reviewerDisplayName)}
                        >
                          <UserMinus size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="record-meta">{assignment.statusLabel}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Chưa phân công người đánh giá"
            message="Lập tờ trình đề xuất Hội đồng ở mục trên để Lãnh đạo phê duyệt và tự động kích hoạt người đánh giá."
          />
        )}
        {canAssign && (
          <form className="form-grid" onSubmit={handleAssign} style={{ marginTop: "16px", borderTop: "1px dashed var(--border)", paddingTop: "14px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Phân công bổ sung người đánh giá độc lập / chuyên gia:</span>
            <div className="form-grid two">
              <label className="field">
                <span>Hồ sơ nhà khoa học đã liên kết tài khoản *</span>
                <select required value={profileId} disabled={!canAssign} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">Chọn hồ sơ đủ điều kiện</option>
                  {candidates.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} — {p.linkedAccountDisplayName} ({p.linkedAccountUsername})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Vai trò trong vòng đánh giá</span>
                <select value={assignmentRole} onChange={(event) => setAssignmentRole(event.target.value as ReviewAssignmentRole)} disabled={!canAssign}>
                  <option value="reviewer">Người phản biện</option>
                  <option value="council_member">Thành viên hội đồng</option>
                </select>
              </label>
            </div>
            <div className="form-grid two">
              <label className="field">
                <span>Hiệu lực từ (để trống: ngay lập tức)</span>
                <input type="date" lang="vi" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} disabled={!canAssign} />
              </label>
              <label className="field">
                <span>Hiệu lực đến (tùy chọn)</span>
                <input type="date" lang="vi" value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} disabled={!canAssign} />
              </label>
            </div>
            <label className="field">
              <span>Hạn đánh giá (tùy chọn)</span>
              <input type="date" lang="vi" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={!canAssign} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="button primary" type="submit" disabled={!canAssign || isAssigning}>
                {isAssigning ? "Đang phân công..." : "Xác nhận phân công"}
              </button>
            </div>
          </form>
        )}
      </SectionCard>

      {/* =========================================================================
          KHỐI 3: TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ & TRÌNH PHÊ DUYỆT ĐỀ TÀI
          ========================================================================= */}
      <SectionCard
        title="Tổng hợp kết quả đánh giá"
        subtitle="Tổng hợp kết luận chuyên môn để chuyển hồ sơ sang bước phê duyệt"
        action={
          progress.evaluationSummary?.statusLabel ? (
            <span className="record-meta">{progress.evaluationSummary.statusLabel}</span>
          ) : undefined
        }
      >
        <form className="form-grid" onSubmit={(e) => e.preventDefault()}>
          <label className="field">
            <span>Nội dung tổng hợp kết quả</span>
            <textarea
              rows={4}
              maxLength={5000}
              value={summaryText}
              onChange={(event) => {
                setSummaryText(event.target.value);
                setSummaryDirty(true);
              }}
              disabled={!canConsolidate}
            />
          </label>
          <label className="field">
            <span>Kết luận tổng hợp</span>
            <select
              value={recommendation}
              onChange={(event) => {
                setRecommendation(event.target.value);
                setSummaryDirty(true);
              }}
              disabled={!canConsolidate}
            >
              <option value="">-- Chọn kết luận --</option>
              {progress.recommendations.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {summaryError ? <p className="form-error">{summaryError}</p> : null}
          {pendingNames.length ? <p className="record-meta">Chờ phiếu của: {pendingNames.join(", ")}.</p> : null}
          {isReadyForApproval ? (
            <p className="state-message success compact-state">
              <CheckCircle2 size={16} aria-hidden="true" /> Đã chuyển lãnh đạo phê duyệt lúc{" "}
              {formatDate(progress.evaluationSummary?.markedReadyAt ?? "")}.
            </p>
          ) : null}

          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                if (!proposal) return;
                exportEvaluationSummaryWord({
                  code: proposal.code,
                  title: proposal.title,
                  ownerDisplayName: proposal.ownerDisplayName,
                  evaluationSummary: {
                    summary: summaryText,
                    recommendation: recommendation
                  }
                });
              }}
              title="Tải Báo cáo tổng hợp đánh giá đề tài dưới dạng file Word (.doc)"
            >
              <FileDown size={16} aria-hidden="true" />
              Lưu Báo cáo tổng hợp (Word)
            </button>
            <button
              className="button"
              type="button"
              disabled={!canConsolidate || savingMode !== ""}
              onClick={() => void handleSaveSummary(false)}
            >
              <Save size={16} aria-hidden="true" />
              {savingMode === "draft" ? "Đang lưu" : "Lưu nháp tổng hợp"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={!canConsolidate || isReadyForApproval || !progress.allReviewsSubmitted || savingMode !== ""}
              onClick={() => void handleSaveSummary(true)}
            >
              <Send size={16} aria-hidden="true" />
              {savingMode === "ready" ? "Đang gửi" : "Gửi lãnh đạo phê duyệt"}
            </button>
          </div>
          {!canConsolidate ? (
            <p className="record-meta">{consolidateBlockedReason || "Chỉ hồ sơ đang đánh giá hoặc chờ phê duyệt mới được tổng hợp kết quả."}</p>
          ) : !progress.allReviewsSubmitted && !isReadyForApproval ? (
            <p className="record-meta">
              {progress.activeAssignmentCount === 0
                ? "Chưa phân công người đánh giá nên chưa thể chuyển hồ sơ sang chờ phê duyệt."
                : "Còn phiếu đánh giá chưa gửi nên chưa thể chuyển hồ sơ sang chờ phê duyệt."}
            </p>
          ) : null}
        </form>
      </SectionCard>

      {/* Modal văn bản Quyết định thành lập Hội đồng */}
      {proposal && (
        <OfficialCouncilDecisionModal
          isOpen={isCouncilDecisionModalOpen}
          onClose={() => setIsCouncilDecisionModalOpen(false)}
          proposal={proposal}
        />
      )}
    </>
  );
}
