import type { Prisma } from "@prisma/client";
import { ACCEPTANCE_ROUND_STATUSES } from "../approved-projects/project-capability-v1.js";
import { formatAcademicTitle, formatResearcherDisplayName } from "./researcher-display-name.js";

/**
 * Đổi họ tên, quân hàm, học hàm, học vị trong lý lịch khoa học thì các danh sách ĐANG DÙNG đã chép tên người đó đổi
 * theo; bằng chứng đã nộp, đã trình, đã ký, đã phát hành giữ nguyên tên tại thời điểm đó (CONTEXT.md, bất biến 5).
 *
 * Đổi theo (gắn với tài khoản hoặc hồ sơ):
 *   - Thành viên hồ sơ đề xuất (proposal_members) và đề tài (approved_project_members): danh sách sống; bản nộp đã lưu
 *     riêng trong proposal_submission_events.
 *   - Khách mời hội nghị (conference_invitations); chương trình đã chốt lưu riêng trong conference_program_versions.
 *   - Thành viên hội đồng đánh giá, hội đồng IRB trong tờ trình còn nháp hoặc bị trả lại; hội đồng nghiệm thu đang đề
 *     xuất (COUNCIL_PROPOSED).
 * Giữ nguyên: tờ trình đang trình hoặc đã ký, quyết định, hồ sơ đã nộp, chương trình đã chốt, tác giả bài báo cáo
 * (do tác giả tự nhập), nhật ký, thông báo đã gửi.
 *
 * Cập nhật bằng SQL trực tiếp cho cột JSON để không đổi updated_at của hồ sơ, đề tài (không làm hỏng bản đang mở
 * trên máy người khác vì một thay đổi không thuộc nghiệp vụ của bản đó).
 */

/** Trạng thái tờ trình hội đồng còn sửa được (chưa trình hoặc đã bị trả lại). */
const EDITABLE_COUNCIL_STATUSES = ["draft", "rejected"];
const PROPOSED_ACCEPTANCE_STATUS = ACCEPTANCE_ROUND_STATUSES.councilProposed;

export type TitlePropagationResult = {
  proposalMembers: number;
  projectMembers: number;
  conferenceInvitations: number;
  evaluationCouncils: number;
  irbCouncils: number;
  acceptanceCouncils: number;
};

type JsonMember = Record<string, unknown>;

/** Thay tên, học hàm học vị của các thành viên khớp `matches`; trả về null nếu không có gì đổi. */
export function replaceMembers(members: unknown, matches: (member: JsonMember) => boolean, next: Record<string, string>) {
  if (!Array.isArray(members)) return null;
  let changed = false;
  const updated = members.map((member) => {
    if (!member || typeof member !== "object" || !matches(member as JsonMember)) return member;
    const current = member as JsonMember;
    if (Object.entries(next).every(([key, value]) => current[key] === value)) return member;
    changed = true;
    return { ...current, ...next };
  });
  return changed ? updated : null;
}

export function isEditableCouncilStatus(status: unknown) {
  return EDITABLE_COUNCIL_STATUSES.includes(typeof status === "string" && status ? status : "draft");
}

export async function propagateScientistTitles(tx: Prisma.TransactionClient, profileId: string): Promise<TitlePropagationResult> {
  const result: TitlePropagationResult = { proposalMembers: 0, projectMembers: 0, conferenceInvitations: 0, evaluationCouncils: 0, irbCouncils: 0, acceptanceCouncils: 0 };
  const profile = await tx.researcherProfile.findUnique({
    where: { id: profileId },
    select: { id: true, fullName: true, title: true, militaryRank: true, linkedUserId: true, academicRankCatalogItem: { select: { code: true, name: true } }, academicDegreeCatalogItem: { select: { code: true, name: true } } }
  });
  if (!profile) return result;
  const displayName = formatResearcherDisplayName(profile);
  const academicTitle = formatAcademicTitle(profile);
  const userId = profile.linkedUserId;

  if (userId) {
    result.proposalMembers = (await tx.proposalMember.updateMany({ where: { userId, NOT: { name: displayName } }, data: { name: displayName } })).count;
    result.projectMembers = (await tx.approvedProjectMember.updateMany({ where: { userId, NOT: { name: displayName } }, data: { name: displayName } })).count;
    result.conferenceInvitations = (await tx.conferenceInvitation.updateMany({ where: { userId, NOT: { fullName: displayName } }, data: { fullName: displayName, academicTitle: null } })).count;

    // Hội đồng đánh giá và IRB: cột "Họ tên" giữ họ tên trong lý lịch (như danh sách ứng viên), học hàm học vị ở cột riêng.
    const member = JSON.stringify([{ userId }]);
    const councilNext = { displayName: profile.fullName, academicTitle };
    const evaluations = await tx.$queryRaw<Array<{ id: string; council_metadata: Prisma.JsonValue }>>`
      SELECT id, council_metadata FROM research_proposals WHERE council_metadata->'members' @> ${member}::jsonb`;
    for (const row of evaluations) {
      const council = row.council_metadata as JsonMember;
      if (!isEditableCouncilStatus(council.status)) continue;
      const members = replaceMembers(council.members, (item) => item.userId === userId, councilNext);
      if (!members) continue;
      await tx.$executeRaw`UPDATE research_proposals SET council_metadata = ${JSON.stringify({ ...council, members })}::jsonb WHERE id = ${row.id}`;
      result.evaluationCouncils += 1;
    }
    const irbs = await tx.$queryRaw<Array<{ id: string; irb_metadata: Prisma.JsonValue }>>`
      SELECT id, irb_metadata FROM research_proposals WHERE irb_metadata->'council'->'members' @> ${member}::jsonb`;
    for (const row of irbs) {
      const irb = row.irb_metadata as JsonMember;
      const council = (irb.council ?? {}) as JsonMember;
      if (!isEditableCouncilStatus(council.status)) continue;
      const members = replaceMembers(council.members, (item) => item.userId === userId, councilNext);
      if (!members) continue;
      await tx.$executeRaw`UPDATE research_proposals SET irb_metadata = ${JSON.stringify({ ...irb, council: { ...council, members } })}::jsonb WHERE id = ${row.id}`;
      result.irbCouncils += 1;
    }
  }

  // Hội đồng nghiệm thu chọn theo hồ sơ nhà khoa học (có thể chưa có tài khoản).
  const byProfile = JSON.stringify([{ profileId }]);
  const acceptances = await tx.$queryRaw<Array<{ id: string; council_members: Prisma.JsonValue }>>`
    SELECT id, council_members FROM project_acceptances WHERE status = ${PROPOSED_ACCEPTANCE_STATUS} AND council_members @> ${byProfile}::jsonb`;
  for (const row of acceptances) {
    const members = replaceMembers(row.council_members, (item) => item.profileId === profileId, { fullName: profile.fullName, academicTitle });
    if (!members) continue;
    await tx.$executeRaw`UPDATE project_acceptances SET council_members = ${JSON.stringify(members)}::jsonb WHERE id = ${row.id}`;
    result.acceptanceCouncils += 1;
  }
  return result;
}
