import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSED_STATUSES, PENDING_STATUSES } from "../dist/apps/api/dashboard/dashboard.service.js";
import { PROPOSAL_STATUS, PROPOSAL_STATUS_LABELS } from "../dist/apps/api/proposals-shared/proposal-workflow.js";

const workflowStatuses = Object.values(PROPOSAL_STATUS);

test("dashboard KPI status sets only use real workflow states", () => {
  for (const status of [...PENDING_STATUSES, ...CLOSED_STATUSES]) assert.ok(workflowStatuses.includes(status), status);
});

test("'Chờ xử lý' counts resubmitted and ready-for-approval proposals, not ones waiting on the PI", () => {
  for (const status of ["submitted", "resubmitted", "under_review", "ready_for_approval"]) assert.ok(PENDING_STATUSES.includes(status), status);
  assert.equal(PENDING_STATUSES.includes("supplement_requested"), false);
});

test("every workflow state has a label for the Excel export", () => {
  for (const status of workflowStatuses) assert.ok(PROPOSAL_STATUS_LABELS[status], status);
});
