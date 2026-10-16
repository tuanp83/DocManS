import type { CouncilCandidate } from "@/lib/proposal-evaluations-api";
import type { CouncilMetadata } from "@/lib/research-proposals-api";
import type { DynamicCouncilMember } from "./evaluation-format";

/** Cơ cấu Hội đồng đang soạn trong tờ trình (Giai đoạn 1) và thông tin phiên họp dự kiến. */
export type CouncilRoster = {
  chair: DynamicCouncilMember;
  secretary: DynamicCouncilMember;
  reviewers: DynamicCouncilMember[];
  members: DynamicCouncilMember[];
  meetingDate: string;
  meetingLocation: string;
  tentativeAgenda: string;
};

type Updater<T> = T | ((previous: T) => T);

export type CouncilRosterAction =
  /** Khôi phục từ tờ trình đã lưu. */
  | { type: "hydrate"; council: CouncilMetadata }
  /** Điền sẵn từ danh sách ứng viên, chỉ vào vị trí còn trống. */
  | { type: "seed"; candidates: CouncilCandidate[] }
  /** Gợi ý cơ cấu chuẩn: ghi đè chủ tịch, thư ký, phản biện và ủy viên. */
  | { type: "applyStandard"; candidates: CouncilCandidate[] }
  | { type: "chair/set"; value: Updater<DynamicCouncilMember> }
  | { type: "secretary/set"; value: Updater<DynamicCouncilMember> }
  | { type: "reviewers/add"; member: DynamicCouncilMember }
  | { type: "reviewers/remove"; id: string }
  | { type: "reviewers/patch"; id: string; patch: Partial<DynamicCouncilMember> }
  | { type: "members/add"; member: DynamicCouncilMember }
  | { type: "members/remove"; id: string }
  | { type: "members/patch"; id: string; patch: Partial<DynamicCouncilMember> }
  | { type: "meeting/patch"; patch: Partial<Pick<CouncilRoster, "meetingDate" | "meetingLocation" | "tentativeAgenda">> };

/** Hội đồng có 2–3 Ủy viên Phản biện; 3–5 thành viên gồm Chủ tịch; đúng 1 Thư ký (khớp evaluation-council-rules.ts ở máy chủ). */
export const MAX_COUNCIL_REVIEWERS = 3;
export const MIN_COUNCIL_REVIEWERS = 2;
export const MAX_COUNCIL_COMMITTEE = 5;

export function createInitialRoster(): CouncilRoster {
  return {
    chair: { id: "chair", candidateId: "", isCustom: false, name: "", title: "Giáo sư, Tiến sĩ", unit: "Ban Giám đốc Học viện" },
    secretary: { id: "secretary", candidateId: "", isCustom: false, name: "", title: "Tiến sĩ", unit: "Phòng Khoa học Quân sự" },
    reviewers: [
      { id: "rev-1", candidateId: "", isCustom: false, name: "", title: "Phó Giáo sư, Tiến sĩ", unit: "Khoa Ngoại Dã chiến" },
      { id: "rev-2", candidateId: "", isCustom: false, name: "", title: "Phó Giáo sư, Tiến sĩ", unit: "Bệnh viện Trung ương Quân đội 108" }
    ],
    members: [
      { id: "mem-1", candidateId: "", isCustom: false, name: "", title: "Tiến sĩ, BSCKII", unit: "Trung tâm Chẩn đoán hình ảnh" },
      { id: "mem-2", candidateId: "", isCustom: false, name: "", title: "Tiến sĩ", unit: "Học viện Quân y" }
    ],
    meetingDate: "",
    meetingLocation: "Phòng họp 1 - Tòa nhà Trung tâm - Học viện Quân y",
    tentativeAgenda:
      "1. Tuyên bố lý do, giới thiệu đại biểu. 2. Công bố Quyết định thành lập Hội đồng. 3. Chủ nhiệm báo cáo tóm tắt thuyết minh. 4. Các phản biện và thành viên cho ý kiến. 5. Hội đồng thảo luận, bỏ phiếu đánh giá."
  };
}

export function newCouncilMember(prefix: "rev" | "mem"): DynamicCouncilMember {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    candidateId: "",
    isCustom: false,
    name: "",
    title: "Tiến sĩ",
    unit: "Học viện Quân y"
  };
}

function resolve<T>(value: Updater<T>, previous: T): T {
  return typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
}

/** Chia ứng viên không xung đột: chủ tịch (lãnh đạo), thư ký (chuyên viên QLKH), còn lại là nhà khoa học. */
function splitCandidates(candidates: CouncilCandidate[]) {
  const unconflicted = candidates.filter((candidate) => !candidate.isConflicted);
  if (unconflicted.length === 0) return null;
  const leader = unconflicted.find((candidate) => candidate.systemRole === "LEADERSHIP_APPROVAL_AUTHORITY") || unconflicted[0];
  const staff = unconflicted.find((candidate) => candidate.systemRole === "RESEARCH_MANAGEMENT_STAFF" && candidate.id !== leader?.id) || unconflicted[1];
  const researchers = unconflicted.filter((candidate) => candidate.id !== leader?.id && candidate.id !== staff?.id);
  return { leader, staff, researchers };
}

function hydrate(roster: CouncilRoster, council: CouncilMetadata): CouncilRoster {
  const next = { ...roster };
  if (council.meetingDate) next.meetingDate = council.meetingDate.split("T")[0] || "";
  if (council.meetingLocation) next.meetingLocation = council.meetingLocation;
  if (council.tentativeAgenda) next.tentativeAgenda = council.tentativeAgenda;

  const saved = council.members ?? [];
  if (saved.length === 0) return next;
  const chair = saved.find((member) => member.role === "chair");
  const secretary = saved.find((member) => member.role === "secretary");
  const reviewers = saved.filter(
    (member) => member.role === "reviewer_1" || member.role === "reviewer_2" || member.role === "reviewer" || member.roleLabel?.toLowerCase().includes("phản biện")
  );
  const members = saved.filter((member) => member !== chair && member !== secretary && !reviewers.includes(member));
  const toDynamic = (id: string, member: (typeof saved)[number]): DynamicCouncilMember => ({
    id,
    candidateId: member.userId || "",
    isCustom: !member.userId,
    name: member.displayName,
    title: member.academicTitle || "",
    unit: member.unit || member.organization || ""
  });
  if (chair) next.chair = toDynamic("chair", chair);
  if (secretary) next.secretary = toDynamic("secretary", secretary);
  if (reviewers.length > 0) next.reviewers = reviewers.map((member, index) => toDynamic(`rev-${index + 1}`, member));
  if (members.length > 0) next.members = members.map((member, index) => toDynamic(`mem-${index + 1}`, member));
  return next;
}

function seed(roster: CouncilRoster, candidates: CouncilCandidate[]): CouncilRoster {
  const parts = splitCandidates(candidates);
  if (!parts) return roster;
  const { leader, staff, researchers } = parts;
  const taken = (member?: DynamicCouncilMember) => Boolean(member?.candidateId || member?.name);
  return {
    ...roster,
    chair: taken(roster.chair)
      ? roster.chair
      : { id: "chair", candidateId: leader?.id || "", isCustom: false, name: leader?.fullName || "", title: leader?.academicTitle || "Giáo sư, Tiến sĩ", unit: leader?.unit || "Ban Giám đốc Học viện" },
    secretary: taken(roster.secretary)
      ? roster.secretary
      : { id: "secretary", candidateId: staff?.id || "", isCustom: false, name: staff?.fullName || "", title: staff?.academicTitle || "Tiến sĩ", unit: staff?.unit || "Phòng Khoa học Quân sự" },
    reviewers: taken(roster.reviewers[0])
      ? roster.reviewers
      : [
          { id: "rev-1", candidateId: researchers[0]?.id || "", isCustom: false, name: researchers[0]?.fullName || "", title: researchers[0]?.academicTitle || "Phó Giáo sư, Tiến sĩ", unit: researchers[0]?.unit || "Khoa Ngoại Dã chiến" },
          { id: "rev-2", candidateId: researchers[1]?.id || "", isCustom: false, name: researchers[1]?.fullName || "", title: researchers[1]?.academicTitle || "Phó Giáo sư, Tiến sĩ", unit: researchers[1]?.unit || "Bệnh viện Trung ương Quân đội 108" }
        ],
    members: taken(roster.members[0])
      ? roster.members
      : [{ id: "mem-1", candidateId: researchers[2]?.id || "", isCustom: false, name: researchers[2]?.fullName || "", title: researchers[2]?.academicTitle || "Tiến sĩ, BSCKII", unit: researchers[2]?.unit || "Trung tâm Chẩn đoán hình ảnh" }]
  };
}

function applyStandard(roster: CouncilRoster, candidates: CouncilCandidate[]): CouncilRoster {
  const parts = splitCandidates(candidates);
  if (!parts) return roster;
  const { leader, staff, researchers } = parts;
  const next = { ...roster };
  if (leader) next.chair = { id: "chair", candidateId: leader.id, isCustom: false, name: leader.fullName, title: leader.academicTitle, unit: leader.unit };
  if (staff) next.secretary = { id: "secretary", candidateId: staff.id, isCustom: false, name: staff.fullName, title: staff.academicTitle, unit: staff.unit };

  const reviewers: DynamicCouncilMember[] = [];
  if (researchers[0]) {
    reviewers.push({ id: "rev-1", candidateId: researchers[0].id, isCustom: false, name: researchers[0].fullName, title: researchers[0].academicTitle || "Phó Giáo sư, Tiến sĩ", unit: researchers[0].unit || "Khoa Ngoại Dã chiến" });
  }
  if (researchers[1]) {
    reviewers.push({ id: "rev-2", candidateId: researchers[1].id, isCustom: false, name: researchers[1].fullName, title: researchers[1].academicTitle || "Phó Giáo sư, Tiến sĩ", unit: researchers[1].unit || "Bệnh viện Trung ương Quân đội 108" });
  }
  if (reviewers.length > 0) next.reviewers = reviewers;
  if (researchers[2]) {
    next.members = [{ id: "mem-1", candidateId: researchers[2].id, isCustom: false, name: researchers[2].fullName, title: researchers[2].academicTitle, unit: researchers[2].unit }];
  }
  return next;
}

const patchById = (list: DynamicCouncilMember[], id: string, patch: Partial<DynamicCouncilMember>) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));

export function councilRosterReducer(roster: CouncilRoster, action: CouncilRosterAction): CouncilRoster {
  switch (action.type) {
    case "hydrate":
      return hydrate(roster, action.council);
    case "seed":
      return seed(roster, action.candidates);
    case "applyStandard":
      return applyStandard(roster, action.candidates);
    case "chair/set":
      return { ...roster, chair: resolve(action.value, roster.chair) };
    case "secretary/set":
      return { ...roster, secretary: resolve(action.value, roster.secretary) };
    case "reviewers/add":
      return { ...roster, reviewers: [...roster.reviewers, action.member] };
    case "reviewers/remove":
      return { ...roster, reviewers: roster.reviewers.filter((item) => item.id !== action.id) };
    case "reviewers/patch":
      return { ...roster, reviewers: patchById(roster.reviewers, action.id, action.patch) };
    case "members/add":
      return { ...roster, members: [...roster.members, action.member] };
    case "members/remove":
      return { ...roster, members: roster.members.filter((item) => item.id !== action.id) };
    case "members/patch":
      return { ...roster, members: patchById(roster.members, action.id, action.patch) };
    case "meeting/patch":
      return { ...roster, ...action.patch };
  }
}
