"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useEffect, useReducer, useState } from "react";
import { Send, Plus, Trash2 } from "lucide-react";
import { intakeDateToIso } from "@/lib/intake-dates";
import type { CouncilCandidate, ProposalReviewProgress, ReviewerCandidates } from "@/lib/proposal-evaluations-api";
import { proposeProposalCouncil, type CouncilMember, type CouncilMemberRole, type CouncilMetadata } from "@/lib/research-proposals-api";
import { buildCouncilInvitationRows } from "./council-invitations";
import {
  councilRosterReducer,
  createInitialRoster,
  MAX_COUNCIL_COMMITTEE,
  MAX_COUNCIL_REVIEWERS,
  MIN_COUNCIL_REVIEWERS,
  newCouncilMember
} from "./council-roster";
import { COUNCIL_ROLE_LABELS, type DynamicCouncilMember } from "./evaluation-format";
import { useNotice } from "@/components/ui/confirm-dialog";

/** Trường hợp C: chưa trình hoặc bản nháp; lập, lưu, mời và trình tờ trình đề xuất Hội đồng (Giai đoạn 1). */
export function CouncilDraftForm({
  proposalId,
  council,
  progress,
  councilCandidates,
  reviewerProfiles,
  contextVersion,
  onChanged
}: {
  proposalId: string;
  council: CouncilMetadata | null | undefined;
  progress: ProposalReviewProgress;
  councilCandidates: CouncilCandidate[];
  reviewerProfiles: ReviewerCandidates["profiles"];
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  /** Tải lại dữ liệu và báo cho trang cha sau khi lưu hoặc trình. */
  onChanged: () => Promise<void>;
}) {
  const notice = useNotice();
  const [roster, dispatch] = useReducer(councilRosterReducer, undefined, createInitialRoster);
  const [isSubmittingCouncil, setIsSubmittingCouncil] = useState(false);
  const [councilError, setCouncilError] = useState("");
  const [councilSuccess, setCouncilSuccess] = useState("");

  const chairState = roster.chair;
  const secretaryState = roster.secretary;
  const councilReviewers = roster.reviewers;
  const councilMembers = roster.members;
  const councilMeetingDate = roster.meetingDate;
  const councilMeetingLocation = roster.meetingLocation;
  const councilTentativeAgenda = roster.tentativeAgenda;

  type MemberUpdate = DynamicCouncilMember | ((previous: DynamicCouncilMember) => DynamicCouncilMember);
  const setChairState = (value: MemberUpdate) => dispatch({ type: "chair/set", value });
  const setSecretaryState = (value: MemberUpdate) => dispatch({ type: "secretary/set", value });
  const setCouncilMeetingDate = (meetingDate: string) => dispatch({ type: "meeting/patch", patch: { meetingDate } });
  const setCouncilMeetingLocation = (meetingLocation: string) => dispatch({ type: "meeting/patch", patch: { meetingLocation } });
  const setCouncilTentativeAgenda = (tentativeAgenda: string) => dispatch({ type: "meeting/patch", patch: { tentativeAgenda } });

  // Khôi phục tờ trình đã lưu, rồi điền sẵn vị trí còn trống từ danh sách ứng viên (đã loại người xung đột).
  useEffect(() => {
    if (council) dispatch({ type: "hydrate", council });
  }, [council]);
  useEffect(() => {
    dispatch({ type: "seed", candidates: councilCandidates });
  }, [councilCandidates]);

  // Thành phần hội đồng (khớp máy chủ, evaluation-council-rules.ts): 2–3 phản biện, 3–5 thành viên
  // (Chủ tịch + các Ủy viên Hội đồng), đúng 1 thư ký.
  function addReviewer() {
    if (councilReviewers.length >= MAX_COUNCIL_REVIEWERS) {
      void notice("Hội đồng có tối đa 3 Ủy viên Phản biện.", "Thành phần Hội đồng");
      return;
    }
    dispatch({ type: "reviewers/add", member: newCouncilMember("rev") });
  }

  function removeReviewer(id: string) {
    if (councilReviewers.length <= MIN_COUNCIL_REVIEWERS) {
      void notice("Hội đồng cần có ít nhất 2 Ủy viên Phản biện.", "Thành phần Hội đồng");
      return;
    }
    dispatch({ type: "reviewers/remove", id });
  }

  function updateReviewer(id: string, patch: Partial<DynamicCouncilMember>) {
    dispatch({ type: "reviewers/patch", id, patch });
  }

  function addCouncilMember() {
    if (1 + councilMembers.length >= MAX_COUNCIL_COMMITTEE) {
      void notice("Hội đồng có tối đa 5 thành viên (gồm Chủ tịch Hội đồng).", "Thành phần Hội đồng");
      return;
    }
    dispatch({ type: "members/add", member: newCouncilMember("mem") });
  }

  function removeCouncilMember(id: string) {
    dispatch({ type: "members/remove", id });
  }

  function updateCouncilMember(id: string, patch: Partial<DynamicCouncilMember>) {
    dispatch({ type: "members/patch", id, patch });
  }

  function applyStandardMODCouncil() {
    dispatch({ type: "applyStandard", candidates: councilCandidates });
  }

  const councilInvitationRows = buildCouncilInvitationRows(council, progress);
  const allCouncilMembersAccepted = councilInvitationRows.length > 0 && councilInvitationRows.every((row) => row.accepted);

  /** save: lưu nháp; invite: lưu và gửi lời mời thành viên mới; submit: trình lãnh đạo khi mọi người đã nhận lời. */
  async function handleProposeCouncil(action: "save" | "invite" | "submit") {
    const submitToLeadership = action === "submit";
    setCouncilError("");
    setCouncilSuccess("");

    const findCandidate = (id: string) => councilCandidates.find((c) => c.id === id || c.userId === id);
    const findProfile = (id: string) => reviewerProfiles.find((p) => p.id === id);

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
    if (submitToLeadership) {
      const reviewerCount = members.filter((m) => m.role === "reviewer_1" || m.role === "reviewer_2" || m.role === "reviewer").length;
      const committeeCount = members.filter((m) => m.role === "chair" || m.role === "vice_chair" || m.role === "member").length;
      if (reviewerCount < 2 || reviewerCount > 3 || committeeCount < 3 || committeeCount > 5) {
        setCouncilError(`Hội đồng cần 2–3 Ủy viên Phản biện (hiện ${reviewerCount}) và 3–5 thành viên gồm Chủ tịch (hiện ${committeeCount}), cùng 1 Thư ký.`);
        return;
      }
    }

    setIsSubmittingCouncil(true);
    try {
      await proposeProposalCouncil(proposalId, {
        meetingDate: councilMeetingDate ? intakeDateToIso(councilMeetingDate) : undefined,
        meetingLocation: councilMeetingLocation,
        tentativeAgenda: councilTentativeAgenda,
        members,
        action,
        contextVersion
      });
      setCouncilSuccess(
        action === "submit"
          ? "Đã trình tờ trình Hội đồng. Trưởng ban QLKH rà soát, Trưởng phòng KHQS duyệt rồi Ban giám đốc ký."
          : action === "invite"
            ? "Đã lưu tờ trình và gửi lời mời đến các thành viên chưa được mời. Theo dõi tình trạng nhận lời ở bảng bên dưới."
            : "Đã lưu bản nháp tờ trình đề xuất Hội đồng."
      );
      await onChanged();
    } catch (err) {
      setCouncilError(err instanceof Error ? err.message : "Không thể gửi tờ trình Hội đồng.");
    } finally {
      setIsSubmittingCouncil(false);
    }
  }

  return (
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
                          {c.fullName} — {c.academicTitle} ({c.unit}){c.unitPositions?.length ? ` · ${c.unitPositions.join("; ")}` : ""} {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
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
                          {c.fullName} — {c.academicTitle} ({c.unit}){c.unitPositions?.length ? ` · ${c.unitPositions.join("; ")}` : ""} {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
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
                              {c.fullName} — {c.academicTitle} ({c.unit}){c.unitPositions?.length ? ` · ${c.unitPositions.join("; ")}` : ""} {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
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
                                {c.fullName} — {c.academicTitle} ({c.unit}){c.unitPositions?.length ? ` · ${c.unitPositions.join("; ")}` : ""} {c.isConflicted ? "⚠️ [XUNG ĐỘT LỢI ÍCH]" : ""}
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

            {council?.status === "returned" || council?.status === "rejected" ? (
              <p className="state-message warning" role="status">
                {council.status === "returned" ? "Phòng KHQS đã trả lại tờ trình" : "Ban giám đốc chưa phê duyệt tờ trình"}
                {council.returnedByName || council.rejectedByName ? ` (${council.returnedByName ?? council.rejectedByName})` : ""}: {council.returnReason ?? council.rejectionReason ?? "Không ghi lý do"}. Sửa rồi trình lại.
              </p>
            ) : null}
            {councilInvitationRows.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Vai trò trong hội đồng</th>
                      <th>Thành viên</th>
                      <th>Tình trạng lời mời</th>
                    </tr>
                  </thead>
                  <tbody>
                    {councilInvitationRows.map((row) => (
                      <tr key={`${row.role}-${row.userId ?? row.displayName}`}>
                        <td>{row.roleLabel}</td>
                        <td>{row.displayName}</td>
                        <td>
                          <span className="record-title" style={{ color: row.tone }}>{row.statusLabel}</span>
                          {row.detail ? <span className="record-meta">{row.detail}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="record-meta" style={{ margin: 0 }}>
              Thành viên chỉ xem được tên đề tài cho đến khi nhận lời; hồ sơ mở khi lãnh đạo ký quyết định thành lập. Trình lãnh đạo khi mọi thành viên đã nhận lời; người từ chối cần được thay bằng người khác.
            </p>

            {councilError && <p className="form-error">{councilError}</p>}
            {councilSuccess && <p className="state-message success">{councilSuccess}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                className="button"
                onClick={() => handleProposeCouncil("save")}
                disabled={isSubmittingCouncil}
                style={{ fontSize: "13px" }}
              >
                Lưu nháp tờ trình
              </button>
              <button
                type="button"
                className="button"
                onClick={() => handleProposeCouncil("invite")}
                disabled={isSubmittingCouncil}
                title="Lưu tờ trình và gửi lời mời đến thành viên chưa được mời"
                style={{ fontSize: "13px" }}
              >
                Gửi lời mời thành viên
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => handleProposeCouncil("submit")}
                disabled={isSubmittingCouncil || !allCouncilMembersAccepted}
                title={allCouncilMembersAccepted ? undefined : "Chỉ trình được khi mọi thành viên đã nhận lời tham gia"}
                style={{ background: "#15803d", borderColor: "#15803d", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Send size={15} />
                {isSubmittingCouncil ? "Đang gửi..." : "Trình Trưởng ban rà soát"}
              </button>
            </div>
          </div>
  );
}
