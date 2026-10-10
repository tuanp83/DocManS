import assert from "node:assert/strict";
import test from "node:test";
import { assignmentLimitError, councilMetadataProblems, councilMetadataRoleToAssignmentRole, councilReady, EVALUATION_COUNCIL_LIMITS, isScoringRole } from "../dist/apps/api/proposals-shared/evaluation-council-rules.js";

// Hội đồng đánh giá: 2–3 phản biện, 3–5 thành viên, đúng 1 thư ký (không chấm phiếu).

const council = (reviewers, members, secretaries) => [
  ...Array.from({ length: reviewers }, (_, i) => ({ id: `r${i}`, reviewerUserId: `ur${i}`, assignmentRole: "reviewer", status: "assigned" })),
  ...Array.from({ length: members }, (_, i) => ({ id: `m${i}`, reviewerUserId: `um${i}`, assignmentRole: "committee_member", status: "assigned" })),
  ...Array.from({ length: secretaries }, (_, i) => ({ id: `s${i}`, reviewerUserId: `us${i}`, assignmentRole: "committee_secretary", status: "assigned" }))
];
const allScored = (active) => new Set(active.filter((item) => item.assignmentRole !== "committee_secretary").map((item) => item.id));

test("limits match the Academy rule", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(EVALUATION_COUNCIL_LIMITS).map(([role, limit]) => [role, [limit.min, limit.max]])), { reviewer: [2, 3], committee_member: [3, 5], committee_secretary: [1, 1] });
  assert.equal(assignmentLimitError("reviewer", 2), null);
  assert.match(assignmentLimitError("reviewer", 3), /tối đa 3 người phản biện/);
  assert.equal(assignmentLimitError("committee_member", 4), null);
  assert.match(assignmentLimitError("committee_member", 5), /tối đa 5 thành viên hội đồng/);
  assert.equal(assignmentLimitError("committee_secretary", 0), null);
  assert.match(assignmentLimitError("committee_secretary", 1), /chỉ có 1 thư ký hội đồng/);
});

test("ready only with a valid composition and every scoring review submitted; the secretary never scores", () => {
  for (const [r, m, s, ready] of [[2, 3, 1, true], [3, 5, 1, true], [1, 3, 1, false], [4, 3, 1, false], [2, 2, 1, false], [2, 6, 1, false], [2, 3, 0, false], [2, 3, 2, false]]) {
    const active = council(r, m, s);
    assert.equal(councilReady(active, allScored(active)), ready, `${r}/${m}/${s}`);
  }
  const active = council(2, 3, 1);
  const missingOne = allScored(active); missingOne.delete("m0");
  assert.equal(councilReady(active, missingOne), false);
  assert.equal(isScoringRole("committee_secretary"), false);
  assert.equal(isScoringRole("reviewer"), true);
  // Một người giữ hai vai trò: không hợp lệ.
  const doubled = council(2, 3, 1).map((item) => item.id === "s0" ? { ...item, reviewerUserId: "ur0" } : item);
  assert.equal(councilReady(doubled, allScored(doubled)), false);
});

test("council decision roles map to assignment roles; drafts are checked only against maximums", () => {
  assert.equal(councilMetadataRoleToAssignmentRole("reviewer_1"), "reviewer");
  assert.equal(councilMetadataRoleToAssignmentRole("reviewer"), "reviewer");
  assert.equal(councilMetadataRoleToAssignmentRole("secretary"), "committee_secretary");
  for (const role of ["chair", "vice_chair", "member"]) assert.equal(councilMetadataRoleToAssignmentRole(role), "committee_member");
  const full = ["chair", "member", "member", "secretary", "reviewer_1", "reviewer_2", "reviewer"].map((role, index) => ({ role, userId: `u${index}` }));
  assert.deepEqual(councilMetadataProblems(full, true), []);
  // Trình lãnh đạo: mọi thành viên phải có tài khoản (để nhận phân công); bản nháp thì chưa bắt buộc.
  const unlinked = full.map((member, index) => index === 0 ? { role: member.role } : member);
  assert.ok(councilMetadataProblems(unlinked, true).some((problem) => problem.includes("chưa gắn tài khoản")));
  assert.deepEqual(councilMetadataProblems(unlinked, false), []);
  assert.deepEqual(councilMetadataProblems([], false), [], "an empty draft is fine");
  assert.ok(councilMetadataProblems([], true).length >= 3, "but cannot be submitted");
  assert.ok(councilMetadataProblems([...full, { role: "reviewer", userId: "u99" }], false).some((problem) => problem.includes("phản biện")), "4 reviewers exceed the maximum even in a draft");
  assert.ok(councilMetadataProblems([{ role: "chair", userId: "u1" }, { role: "reviewer_1", userId: "u1" }], false).some((problem) => problem.includes("nhiều vai trò")));
});
