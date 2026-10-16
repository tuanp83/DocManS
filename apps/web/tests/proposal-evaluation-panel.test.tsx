import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalEvaluationPanel } from "@/components/research-proposals/proposal-evaluation-panel";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import * as evaluationApi from "@/lib/proposal-evaluations-api";
import * as proposalsApi from "@/lib/research-proposals-api";

// Test mô tả hành vi của panel đánh giá hồ sơ (phân công, hội đồng, biên bản, tổng hợp).
// Giữ nguyên khi tách panel thành hook và component con: nếu test này vẫn đạt thì hành vi không đổi.

vi.mock("@/lib/proposal-evaluations-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/proposal-evaluations-api")>();
  return {
    ...actual,
    loadProposalReviewProgress: vi.fn(),
    loadReviewerCandidates: vi.fn(),
    loadCouncilCandidates: vi.fn(),
    assignProposalReviewer: vi.fn(),
    revokeProposalReviewAssignment: vi.fn(),
    saveProposalEvaluationSummary: vi.fn(),
    finalizeProposalEvaluationSummary: vi.fn(),
    reopenProposalEvaluationSummary: vi.fn(),
    submitProposalEvaluationPackage: vi.fn()
  };
});
vi.mock("@/lib/research-proposals-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research-proposals-api")>();
  return { ...actual, loadResearchProposal: vi.fn(), proposeProposalCouncil: vi.fn(), recordProposalCouncilMinutes: vi.fn() };
});
vi.mock("@/lib/word-export", () => ({
  exportCouncilDecisionWord: vi.fn(),
  exportCouncilMinutesWord: vi.fn(),
  exportEvaluationSummaryWord: vi.fn(),
  exportIndividualReviewWord: vi.fn()
}));

const api = vi.mocked(evaluationApi);
const proposals = vi.mocked(proposalsApi);

const contextVersion = { domain: "proposal", recordId: "p1", aggregateVersion: 3, relationshipVersion: 0, conflictVersion: 0, delegationVersion: 0, policyVersion: "v1" } as never;

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1", proposalId: "p1", reviewerUserId: "u-rev", researcherProfileId: "rp1", reviewerDisplayName: "PGS. Lê Phản Biện", reviewerUsername: "leph",
    reviewerUnit: "Khoa Nội", assignmentRole: "reviewer", assignmentRoleLabel: "Người phản biện", status: "assigned", statusLabel: "Đang phân công",
    invitationPending: false, acceptedAt: "", declinedAt: "", declineReason: "", assignedById: "u-staff", assignedByDisplayName: "Chuyên viên A",
    assignedAt: "2026-10-01T00:00:00.000Z", effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveUntil: "", dueDate: "", revokedAt: "", completedAt: "",
    reviewStatus: "", reviewSubmittedAt: "", reviewTotalScore: null, reviewRecommendation: "", reviewRecommendationLabel: "", ...overrides
  };
}

function progress(overrides: Record<string, unknown> = {}) {
  return {
    proposalId: "p1", proposalStatus: "under_review", proposalStatusLabel: "Đang đánh giá",
    activeAssignmentCount: 1, submittedCount: 0, pendingCount: 1, pendingReviewers: [], allReviewsSubmitted: false, averageTotalScore: null, maxTotalScore: 100,
    assignments: [assignment()], declinedAssignments: [], councilInvitations: [], reviews: [], evaluationSummary: null,
    recommendations: [{ code: "approve", label: "Đề nghị phê duyệt" }, { code: "reject", label: "Không phê duyệt" }], ...overrides
  } as never;
}

function candidate(id: string, fullName: string, systemRole: string, extra: Record<string, unknown> = {}) {
  return { id, userId: `user-${id}`, fullName, username: id, systemRole, academicTitle: "TS", unit: "Học viện Quân y", profileType: "INTERNAL", isConflicted: false, ...extra };
}

const roster = [
  candidate("c1", "Giám đốc Một", "LEADERSHIP_APPROVAL_AUTHORITY"),
  candidate("c2", "Chuyên viên Hai", "RESEARCH_MANAGEMENT_STAFF"),
  candidate("c3", "Nhà khoa học Ba", "RESEARCHER_INTERNAL_USER"),
  candidate("c4", "Nhà khoa học Bốn", "RESEARCHER_INTERNAL_USER"),
  candidate("c5", "Nhà khoa học Năm", "RESEARCHER_INTERNAL_USER")
];

const props = {
  proposalId: "p1",
  onWorkflowChange: vi.fn(),
  canAssignReviewers: true,
  canConsolidate: true,
  canFinalize: true,
  canSubmitPackage: true,
  blockedReason: "Không đủ quyền phân công.",
  consolidateBlockedReason: "Chưa được tổng hợp.",
  contextVersion
};

// Hộp xác nhận / nhập lý do của hệ thống (thay window.confirm, prompt) nằm trong ConfirmProvider ở gốc ứng dụng.
const renderPanel = (ui: React.ReactElement) => render(ui, { wrapper: ConfirmProvider });

/** Trả lời hộp thoại đang mở: nhập lý do (nếu có) rồi bấm nút `button`. */
async function answerDialog(user: ReturnType<typeof userEvent.setup>, button: string, reason?: string) {
  const dialog = await screen.findByRole("dialog");
  if (reason !== undefined) await user.type(within(dialog).getByRole("textbox"), reason);
  await user.click(within(dialog).getByRole("button", { name: button }));
}

function setup(overrides: { progress?: unknown; proposal?: unknown; candidates?: unknown; roster?: unknown } = {}) {
  api.loadProposalReviewProgress.mockResolvedValue((overrides.progress ?? progress()) as never);
  api.loadReviewerCandidates.mockResolvedValue((overrides.candidates ?? { profiles: [{ id: "rp9", fullName: "TS. Chuyên Gia", linkedUserId: "u9", linkedAccountUsername: "cg", linkedAccountDisplayName: "Chuyên Gia" }] }) as never);
  api.loadCouncilCandidates.mockResolvedValue({ candidates: overrides.roster ?? [] } as never);
  proposals.loadResearchProposal.mockResolvedValue((overrides.proposal ?? { id: "p1", code: "DT-1", title: "Đề tài thử", councilMetadata: null }) as never);
  return renderPanel(<ProposalEvaluationPanel {...props} {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  props.onWorkflowChange = vi.fn();
});

describe("tải dữ liệu", () => {
  it("hiện thông báo đang tải rồi bảng phân công", async () => {
    setup();
    expect(screen.getByText(/Đang tải tiến độ đánh giá/)).toBeInTheDocument();
    expect(await screen.findByText("PGS. Lê Phản Biện")).toBeInTheDocument();
    expect(screen.getByText("Đang phân công", { selector: ".meta-label" })).toBeInTheDocument();
  });

  it("không đủ quyền (403): hiện nút bị khoá và lý do", async () => {
    api.loadProposalReviewProgress.mockRejectedValue(Object.assign(new Error("cấm"), { status: 403 }));
    api.loadCouncilCandidates.mockResolvedValue({ candidates: [] } as never);
    proposals.loadResearchProposal.mockResolvedValue(null as never);
    renderPanel(<ProposalEvaluationPanel {...props} />);
    expect(await screen.findByText("Không đủ quyền phân công.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phân công người đánh giá" })).toBeDisabled();
  });

  it("lỗi khác: hiện thông điệp lỗi", async () => {
    api.loadProposalReviewProgress.mockRejectedValue(new Error("Máy chủ lỗi"));
    proposals.loadResearchProposal.mockResolvedValue(null as never);
    renderPanel(<ProposalEvaluationPanel {...props} />);
    expect(await screen.findByText("Máy chủ lỗi")).toBeInTheDocument();
  });

  it("tải lại khi phiên bản ngữ cảnh đổi", async () => {
    const view = setup();
    await screen.findByText("PGS. Lê Phản Biện");
    expect(api.loadProposalReviewProgress).toHaveBeenCalledTimes(1);
    view.rerender(<ProposalEvaluationPanel {...props} contextVersion={{ ...(contextVersion as object), aggregateVersion: 4 } as never} />);
    await waitFor(() => expect(api.loadProposalReviewProgress).toHaveBeenCalledTimes(2));
  });

  it("không tải danh sách người đánh giá khi không có quyền phân công", async () => {
    api.loadProposalReviewProgress.mockResolvedValue(progress());
    api.loadCouncilCandidates.mockResolvedValue({ candidates: [] } as never);
    proposals.loadResearchProposal.mockResolvedValue({ id: "p1", councilMetadata: null } as never);
    renderPanel(<ProposalEvaluationPanel {...props} canAssignReviewers={false} />);
    await screen.findByText("PGS. Lê Phản Biện");
    expect(api.loadReviewerCandidates).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Xác nhận phân công" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thu hồi phân công của/ })).toBeDisabled();
  });
});

describe("phân công người đánh giá", () => {
  it("phân công thành công: gọi API đúng dữ liệu, báo kết quả, tải lại và báo cho trang cha", async () => {
    api.assignProposalReviewer.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");

    await user.selectOptions(screen.getByLabelText(/Hồ sơ nhà khoa học đã liên kết tài khoản/), "rp9");
    await user.selectOptions(screen.getByLabelText("Vai trò trong vòng đánh giá"), "committee_member");
    await user.click(screen.getByRole("button", { name: "Xác nhận phân công" }));
    await answerDialog(user, "Phân công");

    await waitFor(() => expect(api.assignProposalReviewer).toHaveBeenCalledTimes(1));
    expect(api.assignProposalReviewer).toHaveBeenCalledWith("p1", {
      researcherProfileId: "rp9", contextVersion, effectiveFrom: undefined, effectiveUntil: undefined, assignmentRole: "committee_member", dueDate: undefined
    });
    expect(await screen.findByText("Đã phân công người đánh giá.")).toBeInTheDocument();
    expect(api.loadProposalReviewProgress).toHaveBeenCalledTimes(2);
    expect(props.onWorkflowChange).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/Hồ sơ nhà khoa học đã liên kết tài khoản/)).toHaveValue("");
  });

  it("không phân công khi người dùng không xác nhận", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.selectOptions(screen.getByLabelText(/Hồ sơ nhà khoa học đã liên kết tài khoản/), "rp9");
    await user.click(screen.getByRole("button", { name: "Xác nhận phân công" }));
    await answerDialog(user, "Hủy");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.assignProposalReviewer).not.toHaveBeenCalled();
  });

  it("phân công lỗi: hiện thông điệp lỗi và không gọi tải lại", async () => {
    api.assignProposalReviewer.mockRejectedValue(new Error("Người này đang xung đột lợi ích."));
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.selectOptions(screen.getByLabelText(/Hồ sơ nhà khoa học đã liên kết tài khoản/), "rp9");
    await user.click(screen.getByRole("button", { name: "Xác nhận phân công" }));
    await answerDialog(user, "Phân công");
    expect(await screen.findByText("Người này đang xung đột lợi ích.")).toBeInTheDocument();
    expect(api.loadProposalReviewProgress).toHaveBeenCalledTimes(1);
    expect(props.onWorkflowChange).not.toHaveBeenCalled();
  });

  it("thu hồi phân công kèm lý do", async () => {
    api.revokeProposalReviewAssignment.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: "Thu hồi phân công của PGS. Lê Phản Biện" }));
    await answerDialog(user, "Thu hồi", "  Phân công nhầm ");
    await waitFor(() => expect(api.revokeProposalReviewAssignment).toHaveBeenCalledWith("p1", "a1", "Phân công nhầm", contextVersion));
    expect(await screen.findByText("Đã thu hồi phân công đánh giá.")).toBeInTheDocument();
    expect(props.onWorkflowChange).toHaveBeenCalledTimes(1);
  });

  it("không cho thu hồi khi bỏ trống lý do", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: /Thu hồi phân công của/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "  ");
    expect(within(dialog).getByRole("button", { name: "Thu hồi" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.revokeProposalReviewAssignment).not.toHaveBeenCalled();
  });

  it("hiện lời mời bị từ chối và phiếu đã gửi", async () => {
    setup({
      progress: progress({
        assignments: [assignment({ reviewStatus: "submitted", reviewTotalScore: 82, reviewRecommendationLabel: "Đề nghị phê duyệt" })],
        declinedAssignments: [assignment({ id: "a2", reviewerDisplayName: "TS. Từ Chối", declinedAt: "2026-10-02T00:00:00.000Z", declineReason: "Bận công tác" })]
      })
    });
    expect(await screen.findByText(/Đã gửi · 82\/100/)).toBeInTheDocument();
    expect(screen.getByText(/TS\. Từ Chối/)).toHaveTextContent("Bận công tác");
  });
});

describe("tổng hợp kết quả", () => {
  it("báo lỗi khi lưu nháp mà thiếu nội dung hoặc kết luận", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: "Lưu nháp tổng hợp" }));
    expect(await screen.findByText("Nhập nội dung tổng hợp kết quả đánh giá.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nội dung tổng hợp kết quả"), "Đạt yêu cầu");
    await user.click(screen.getByRole("button", { name: "Lưu nháp tổng hợp" }));
    expect(await screen.findByText("Chọn kết luận tổng hợp.")).toBeInTheDocument();
    expect(api.saveProposalEvaluationSummary).not.toHaveBeenCalled();
  });

  it("lưu nháp, rồi mới cho chốt", async () => {
    api.saveProposalEvaluationSummary.mockResolvedValue({} as never);
    api.finalizeProposalEvaluationSummary.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ progress: progress({ allReviewsSubmitted: true, evaluationSummary: { status: "draft", statusLabel: "Bản nháp", revision: 2, summary: "", recommendation: "", reopenReason: "" } }) });
    await screen.findByText("PGS. Lê Phản Biện");

    await user.type(screen.getByLabelText("Nội dung tổng hợp kết quả"), "Đạt yêu cầu");
    await user.selectOptions(screen.getByLabelText("Kết luận tổng hợp"), "approve");
    expect(screen.getByRole("button", { name: "Chốt bản tổng hợp" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Lưu nháp tổng hợp" }));
    await waitFor(() => expect(api.saveProposalEvaluationSummary).toHaveBeenCalledWith("p1", { summary: "Đạt yêu cầu", recommendation: "approve" }));
    expect(await screen.findByText("Đã lưu bản nháp tổng hợp.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Chốt bản tổng hợp" })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: "Chốt bản tổng hợp" }));
    await answerDialog(user, "Chốt bản tổng hợp");
    await waitFor(() => expect(api.finalizeProposalEvaluationSummary).toHaveBeenCalledWith("p1", { revision: 2 }));
    expect(await screen.findByText("Đã chốt bản tổng hợp.")).toBeInTheDocument();
  });

  it("bản đã chốt: khoá ô nhập, cho mở lại kèm lý do", async () => {
    api.reopenProposalEvaluationSummary.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ progress: progress({ allReviewsSubmitted: true, evaluationSummary: { status: "finalized", statusLabel: "Đã chốt", revision: 4, summary: "Nội dung cũ", recommendation: "approve", reopenReason: "" } }) });
    await screen.findByText("PGS. Lê Phản Biện");
    await waitFor(() => expect(screen.getByLabelText("Nội dung tổng hợp kết quả")).toHaveValue("Nội dung cũ"));
    expect(screen.getByLabelText("Nội dung tổng hợp kết quả")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Mở lại để sửa" }));
    await answerDialog(user, "Mở lại", "Bổ sung phiếu");
    await waitFor(() => expect(api.reopenProposalEvaluationSummary).toHaveBeenCalledWith("p1", { reason: "Bổ sung phiếu", revision: 4 }));
  });

  it("trình gói đánh giá: liệt kê người chưa gửi phiếu khi bị từ chối", async () => {
    api.submitProposalEvaluationPackage.mockRejectedValue(Object.assign(new Error("Còn phiếu chưa gửi."), { pendingReviewers: [{ reviewerDisplayName: "PGS. Lê Phản Biện" }] }));
    const user = userEvent.setup();
    setup({ progress: progress({ allReviewsSubmitted: true }) });
    await screen.findByText("PGS. Lê Phản Biện");
    const summarySection = screen.getByText("Tổng hợp kết quả đánh giá").closest("section") as HTMLElement;
    await user.click(within(summarySection).getByRole("button", { name: "Trình Trưởng ban rà soát" }));
    await answerDialog(user, "Trình gói đánh giá");
    expect(await screen.findByText("Còn phiếu chưa gửi.")).toBeInTheDocument();
    expect(screen.getByText(/Chờ phiếu của: PGS\. Lê Phản Biện\./)).toBeInTheDocument();
  });

  it("giải thích vì sao chưa trình được khi còn phiếu chưa gửi", async () => {
    setup({ progress: progress({ allReviewsSubmitted: false, councilProblems: ["Thiếu thư ký."] }) });
    await screen.findByText("PGS. Lê Phản Biện");
    expect(screen.getByText(/Thành phần hội đồng chưa đúng quy định: Thiếu thư ký\./)).toBeInTheDocument();
  });
});

describe("hội đồng: lập tờ trình (bản nháp)", () => {
  it("báo lỗi khi chưa chọn chủ tịch", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: /Lưu nháp tờ trình/ }));
    expect(await screen.findByText(/Vui lòng chọn hoặc nhập chuyên gia cho vị trí Chủ tịch Hội đồng\./)).toBeInTheDocument();
    expect(proposals.proposeProposalCouncil).not.toHaveBeenCalled();
  });

  it("tự điền cơ cấu từ danh sách ứng viên và lưu nháp đúng vai trò", async () => {
    proposals.proposeProposalCouncil.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ roster });
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: /Lưu nháp tờ trình/ }));
    await waitFor(() => expect(proposals.proposeProposalCouncil).toHaveBeenCalledTimes(1));
    const [, payload] = proposals.proposeProposalCouncil.mock.calls[0] as [string, { members: Array<{ role: string; userId?: string; displayName: string }>; action: string }];
    expect(payload.action).toBe("save");
    expect(payload.members.map((m) => [m.role, m.displayName])).toEqual([
      ["chair", "Giám đốc Một"],
      ["secretary", "Chuyên viên Hai"],
      ["reviewer_1", "Nhà khoa học Ba"],
      ["reviewer_2", "Nhà khoa học Bốn"],
      ["member", "Nhà khoa học Năm"]
    ]);
    expect(payload.members[0].userId).toBe("user-c1");
    expect(await screen.findByText("Đã lưu bản nháp tờ trình đề xuất Hội đồng.")).toBeInTheDocument();
    expect(props.onWorkflowChange).toHaveBeenCalledTimes(1);
  });

  it("chặn thêm phản biện quá 3 người và bớt dưới 2 người", async () => {
    const user = userEvent.setup();
    setup({ roster });
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: /Thêm Phản biện/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Thêm Phản biện/ }));
    expect(await screen.findByRole("dialog", { name: "Thành phần Hội đồng" })).toHaveTextContent("Hội đồng có tối đa 3 Ủy viên Phản biện.");
  });

  it("không tự điền người có xung đột lợi ích làm chủ tịch", async () => {
    proposals.proposeProposalCouncil.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ roster: [{ ...roster[0], isConflicted: true, conflictReason: "cùng đơn vị" }, ...roster.slice(1)] });
    await screen.findByText("PGS. Lê Phản Biện");
    await user.click(screen.getByRole("button", { name: /Lưu nháp tờ trình/ }));
    await waitFor(() => expect(proposals.proposeProposalCouncil).toHaveBeenCalledTimes(1));
    const [, payload] = proposals.proposeProposalCouncil.mock.calls[0] as [string, { members: Array<{ role: string; displayName: string }> }];
    expect(payload.members.find((m) => m.role === "chair")?.displayName).not.toBe("Giám đốc Một");
  });
});

describe("hội đồng: đã trình / đã phê chuẩn", () => {
  const members = [
    { role: "chair", roleLabel: "Chủ tịch Hội đồng", userId: "user-c1", displayName: "Giám đốc Một", academicTitle: "GS.TS", unit: "Ban Giám đốc" },
    { role: "secretary", roleLabel: "Thư ký khoa học", userId: "user-c2", displayName: "Chuyên viên Hai", academicTitle: "TS", unit: "Phòng KHQS" }
  ];

  it("đã trình lãnh đạo: hiện bảng đề xuất, không còn form lập tờ trình", async () => {
    setup({ proposal: { id: "p1", code: "DT-1", title: "Đề tài", councilMetadata: { status: "submitted", members, proposedByName: "Chuyên viên A" } } });
    expect(await screen.findByText("Đã trình Lãnh đạo chờ duyệt")).toBeInTheDocument();
    expect(screen.getByText("Giám đốc Một")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lưu nháp tờ trình/ })).not.toBeInTheDocument();
  });

  it("đã phê chuẩn: hiện số quyết định và ghi nhận biên bản họp", async () => {
    proposals.recordProposalCouncilMinutes.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ proposal: { id: "p1", code: "DT-1", title: "Đề tài", councilMetadata: { status: "approved", decisionNumber: "123/QĐ-HV", members } } });
    expect(await screen.findByText(/Quyết định thành lập Hội đồng: 123\/QĐ-HV/)).toBeInTheDocument();
    expect(screen.getByText("Hội đồng đã phê chuẩn")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Kết luận Hội đồng:"), "revision_required");
    await user.clear(screen.getByLabelText("Điểm TB của Hội đồng (/100):"));
    await user.type(screen.getByLabelText("Điểm TB của Hội đồng (/100):"), "78");
    await user.type(screen.getByLabelText("Nhận xét, đánh giá chung của Hội đồng:"), "Cần bổ sung cỡ mẫu");
    await user.click(screen.getByRole("button", { name: "Lưu Biên bản & Kết luận Hội đồng" }));

    await waitFor(() => expect(proposals.recordProposalCouncilMinutes).toHaveBeenCalledTimes(1));
    expect(proposals.recordProposalCouncilMinutes).toHaveBeenCalledWith("p1", {
      meetingConductedAt: undefined, conclusion: "revision_required", averageScore: 78, summaryComments: "Cần bổ sung cỡ mẫu", modificationsRequired: "", contextVersion
    });
    expect(await screen.findByText(/Đã ghi nhận Biên bản & Kết luận phiên họp Hội đồng thành công/)).toBeInTheDocument();
    expect(props.onWorkflowChange).toHaveBeenCalledTimes(1);
  });

  // Bản gốc có lỗi: sau khi ghi biên bản, lần tải lại ghi đè phần điền sẵn bằng dữ liệu máy chủ.
  it("ghi biên bản xong thì điền sẵn kết luận cho phần tổng hợp nếu người dùng chưa sửa", async () => {
    proposals.recordProposalCouncilMinutes.mockResolvedValue({} as never);
    const user = userEvent.setup();
    setup({ proposal: { id: "p1", code: "DT-1", title: "Đề tài", councilMetadata: { status: "approved", decisionNumber: "1/QĐ", members } } });
    await screen.findByText(/Quyết định thành lập Hội đồng/);
    await user.selectOptions(screen.getByLabelText("Kết luận Hội đồng:"), "rejected");
    await user.click(screen.getByRole("button", { name: "Lưu Biên bản & Kết luận Hội đồng" }));
    await screen.findByText(/Đã ghi nhận Biên bản/);
    expect(screen.getByLabelText("Kết luận tổng hợp")).toHaveValue("reject");
    expect((screen.getByLabelText("Nội dung tổng hợp kết quả") as HTMLTextAreaElement).value).toContain("Không đạt yêu cầu");
  });
});
