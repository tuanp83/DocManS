import { test } from "node:test";
import assert from "node:assert/strict";
import { projectHistoryLabel } from "../apps/web/src/lib/project-history-labels.ts";

test("project history actions read as Vietnamese labels, unknown codes stay visible", () => {
  assert.equal(projectHistoryLabel("project.created"), "Lập đề tài");
  assert.equal(projectHistoryLabel("project.report.submit"), "Báo cáo tiến độ: nộp");
  assert.equal(projectHistoryLabel("project.adjustment.request-supplement"), "Đề nghị điều chỉnh: yêu cầu bổ sung");
  assert.equal(projectHistoryLabel("project.acceptance.council.establish"), "Nghiệm thu");
  assert.equal(projectHistoryLabel("something.else"), "something.else");
});
