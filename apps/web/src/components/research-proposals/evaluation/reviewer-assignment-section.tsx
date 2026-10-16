"use client";

import type { ViewerAuthorizationV1 } from "@rtms/permissions";
import { useReducer, useState } from "react";
import { UserMinus, FileDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatIntakeDate, intakeDateToIso } from "@/lib/intake-dates";
import {
  assignProposalReviewer,
  revokeProposalReviewAssignment,
  type ProposalReviewProgress,
  type ReviewAssignmentRole,
  type ReviewerCandidates
} from "@/lib/proposal-evaluations-api";
import type { ResearchProposal } from "@/lib/research-proposals-api";
import { exportIndividualReviewWord } from "@/lib/word-export";
import { formatDate, formatDueDate } from "./evaluation-format";
import { useConfirm, useAskReason } from "@/components/ui/confirm-dialog";

type AssignmentForm = { profileId: string; effectiveFrom: string; effectiveUntil: string; assignmentRole: ReviewAssignmentRole; dueDate: string };
type AssignmentFormAction = { type: "set"; field: keyof AssignmentForm; value: string } | { type: "reset" };

const emptyAssignmentForm: AssignmentForm = { profileId: "", effectiveFrom: "", effectiveUntil: "", assignmentRole: "reviewer", dueDate: "" };

/** Sau khi phân công thành công chỉ xoá hồ sơ đã chọn và hạn đánh giá; vai trò và thời hạn hiệu lực được giữ để phân công người kế tiếp. */
function assignmentFormReducer(form: AssignmentForm, action: AssignmentFormAction): AssignmentForm {
  if (action.type === "reset") return { ...form, profileId: "", dueDate: "" };
  return { ...form, [action.field]: action.value };
}

/** Khối 2: danh sách phân công đánh giá, tiến độ chấm điểm và phân công bổ sung / thu hồi. */
export function ReviewerAssignmentSection({
  proposalId,
  proposal,
  progress,
  reviewerProfiles,
  reviewerProfilesError,
  canAssign,
  contextVersion,
  onChanged
}: {
  proposalId: string;
  proposal: ResearchProposal | null;
  progress: ProposalReviewProgress;
  reviewerProfiles: ReviewerCandidates["profiles"];
  /** Lỗi khi tải danh sách người đánh giá có thể phân công. */
  reviewerProfilesError: string;
  canAssign: boolean;
  contextVersion?: ViewerAuthorizationV1["contextVersion"];
  /** Tải lại dữ liệu và báo cho trang cha sau khi phân công hoặc thu hồi. */
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const askReason = useAskReason();
  const [form, dispatch] = useReducer(assignmentFormReducer, emptyAssignmentForm);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [revokingId, setRevokingId] = useState("");

  const { profileId, effectiveFrom, effectiveUntil, assignmentRole, dueDate } = form;
  const assignError = actionError || reviewerProfilesError;
  const setProfileId = (value: string) => dispatch({ type: "set", field: "profileId", value });
  const setAssignmentRole = (value: ReviewAssignmentRole) => dispatch({ type: "set", field: "assignmentRole", value });
  const setEffectiveFrom = (value: string) => dispatch({ type: "set", field: "effectiveFrom", value });
  const setEffectiveUntil = (value: string) => dispatch({ type: "set", field: "effectiveUntil", value });
  const setDueDate = (value: string) => dispatch({ type: "set", field: "dueDate", value });

  async function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError("");
    setMessage("");

    if (!profileId) {
      setActionError("Chọn hồ sơ nhà khoa học đã liên kết tài khoản.");
      return;
    }

    if (!(await confirm("Xác nhận người đánh giá, hồ sơ nhà khoa học, vai trò và thời hạn phân công?", { confirmLabel: "Phân công" }))) return;
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
      dispatch({ type: "reset" });
      setMessage("Đã phân công người đánh giá.");
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể phân công người đánh giá.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRevoke(assignmentId: string, reviewerName: string) {
    setActionError("");
    setMessage("");
    const reason = await askReason(`Thu hồi phân công đánh giá của ${reviewerName}? Lịch sử phân công vẫn được giữ lại.`, { label: "Lý do thu hồi", confirmLabel: "Thu hồi", tone: "danger" });
    if (!reason) return;
    setRevokingId(assignmentId);
    try {
      await revokeProposalReviewAssignment(proposalId, assignmentId, reason, contextVersion);
      setMessage("Đã thu hồi phân công đánh giá.");
      await onChanged();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể thu hồi phân công.");
    } finally {
      setRevokingId("");
    }
  }

  return (
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
                      {assignment.acceptedAt ? <span className="record-meta">Nhận lời {formatDate(assignment.acceptedAt)}</span> : null}
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
                              title="Tải Phiếu nhận xét, đánh giá chuyên môn dưới dạng file Word (.docx)"
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
        {progress?.declinedAssignments?.length ? (
          <div className="state-message warning" role="status" style={{ marginTop: "12px" }}>
            <strong>Lời mời bị từ chối trong vòng đánh giá này:</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
              {progress.declinedAssignments.map((assignment) => (
                <li key={assignment.id}>
                  {assignment.reviewerDisplayName} ({assignment.assignmentRoleLabel}) · từ chối {formatDate(assignment.declinedAt)}: {assignment.declineReason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {canAssign && (
          <form className="form-grid" onSubmit={handleAssign} style={{ marginTop: "16px", borderTop: "1px dashed var(--border)", paddingTop: "14px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700 }}>Phân công bổ sung người đánh giá độc lập / chuyên gia:</span>
            <div className="form-grid two">
              <label className="field">
                <span>Hồ sơ nhà khoa học đã liên kết tài khoản *</span>
                <select required value={profileId} disabled={!canAssign} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">Chọn hồ sơ đủ điều kiện</option>
                  {reviewerProfiles.map((p) => (
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
                  <option value="committee_member">Thành viên hội đồng</option>
                  <option value="committee_secretary">Thư ký hội đồng (không chấm phiếu)</option>
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
  );
}
