import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import {
  approveProposalBudgetPipe,
  declineIrbInvitationPipe,
  evaluationSummaryLifecyclePipe,
  irbReviewPipe,
  proposeCouncilPipe,
  saveEvaluationSummaryPipe,
  saveProposalReviewPipe,
  submitIrbConclusionPipe
} from "../dist/apps/api/proposal-evaluations/proposal-evaluations.dto.js";
import { completeProposalCheckPipe, proposalMutationPipe } from "../dist/apps/api/research-proposals/research-proposals.dto.js";
import { intakePeriodStatusPipe } from "../dist/apps/api/proposal-intake-periods/proposal-intake-periods.dto.js";
import { deleteFilePipe } from "../dist/apps/api/modules/files/files.dto.js";
import { advanceSubmissionPipe, returnSubmissionPipe } from "../dist/apps/api/approvals/approval-routing.dto.js";
import { userPositionsPipe } from "../dist/apps/api/admin/admin-request.pipe.js";

// Kiểm tra đầu vào ở cổng HTTP: thao tác ghi lên hồ sơ phải gửi phiên bản đang xem (chống ghi đè), thân sai dạng bị chặn sớm.
const contextVersion = { domain: "proposal", recordId: "p1", aggregateVersion: 1, relationshipVersion: 0, conflictVersion: 0, delegationVersion: 0, policyVersion: "v1" };
const missingContext = /Thiếu phiên bản/;

describe("pipe kiểm tra đầu vào", () => {
  it("thao tác ghi lên hồ sơ bắt buộc contextVersion", () => {
    for (const [pipe, body] of [
      [proposalMutationPipe, {}],
      [completeProposalCheckPipe, {}],
      [saveProposalReviewPipe, { comment: "Nhận xét" }],
      [approveProposalBudgetPipe, { approvedBudget: 100 }],
      [proposeCouncilPipe, {}],
      [irbReviewPipe, { recommendation: "approve", comment: "Đạt" }],
      [submitIrbConclusionPipe, {}]
    ]) {
      assert.throws(() => pipe.transform(body), missingContext);
    }
    assert.deepEqual(completeProposalCheckPipe.transform({ contextVersion, extra: "bỏ" }), { contextVersion });
    assert.equal(irbReviewPipe.transform({ recommendation: "approve", comment: "Đạt", contextVersion }).contextVersion, contextVersion);
    // Hàm đọc của service vẫn chạy ở cổng: dữ liệu sai bị chặn trước khi vào giao dịch.
    assert.throws(() => irbReviewPipe.transform({ recommendation: "khác", comment: "Đạt", contextVersion }), BadRequestException);
  });

  it("người được mời từ chối lời mời IRB không cần phiên bản hồ sơ, nhưng phải có lý do", () => {
    assert.deepEqual(declineIrbInvitationPipe.transform({ reason: "Bận công tác" }), { reason: "Bận công tác" });
    assert.throws(() => declineIrbInvitationPipe.transform({}), BadRequestException);
  });

  it("bản tổng hợp đánh giá bắt buộc revision đang xem, kể cả khi lưu nháp", () => {
    assert.throws(() => saveEvaluationSummaryPipe.transform({ summary: "Đạt", recommendation: "approve" }), missingContext);
    assert.equal(saveEvaluationSummaryPipe.transform({ summary: "Đạt", recommendation: "approve", revision: 0 }).revision, 0);
    assert.throws(() => evaluationSummaryLifecyclePipe.transform({}), missingContext);
    assert.throws(() => evaluationSummaryLifecyclePipe.transform({ revision: -1 }), missingContext);
    assert.equal(evaluationSummaryLifecyclePipe.transform({ revision: "3" }).revision, 3);
  });

  it("đợt tiếp nhận, xoá tệp bắt buộc phiên bản; tờ trình, chức danh kiểm tra dạng thân", () => {
    assert.throws(() => intakePeriodStatusPipe.transform({}), missingContext);
    assert.deepEqual(intakePeriodStatusPipe.transform({ contextVersion: "2026-10-01T00:00:00.000Z", x: 1 }), { contextVersion: "2026-10-01T00:00:00.000Z" });
    assert.throws(() => deleteFilePipe.transform(undefined), missingContext);
    assert.deepEqual(advanceSubmissionPipe.transform(undefined), { note: null });
    assert.throws(() => returnSubmissionPipe.transform({ note: "  " }), /lý do trả lại/);
    assert.throws(() => advanceSubmissionPipe.transform([]), BadRequestException);
    assert.throws(() => userPositionsPipe.transform({ positions: "Trưởng khoa" }), BadRequestException);
    assert.deepEqual(userPositionsPipe.transform({ positions: [] }), { positions: [] });
  });
});
