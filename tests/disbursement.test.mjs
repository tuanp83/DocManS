import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { readApprovedBudget, readDisbursementInput, stampMilestoneDates } from "../dist/apps/api/proposal-evaluations/disbursement.js";

const milestone = (overrides = {}) => ({ id: "M1", name: "Đợt 1", percentage: 100, expectedAmount: 1000, disbursedAmount: 0, status: "PENDING", ...overrides });

describe("disbursement input validation", () => {
  it("never invents a budget: missing or invalid amounts become 0", () => {
    assert.equal(readApprovedBudget(null), 0);
    assert.equal(readApprovedBudget({ amount: "abc" }), 0);
    assert.equal(readApprovedBudget({ amount: 1500.4 }), 1500);
  });

  it("drops unknown fields and normalizes numeric strings", () => {
    const result = readDisbursementInput({ milestones: [milestone({ disbursedAmount: "250", status: "DISBURSED", hacked: true })], extra: 1 }, 1000);
    assert.equal(result.milestones[0].disbursedAmount, 250);
    assert.equal(result.milestones[0].hacked, undefined);
    assert.equal(result.extra, undefined);
    assert.deepEqual(result.costItems, []);
    assert.equal(result.settlementStatus, "PENDING");
  });

  it("rejects malformed payloads", () => {
    for (const payload of [null, [], {}, { milestones: [milestone({ name: "" })] }, { milestones: [milestone({ percentage: 150 })] }, { milestones: [milestone({ disbursedAmount: 10, status: "PENDING", expectedAmount: 5 })] }, { milestones: [milestone({ status: "DISBURSED" })] }]) {
      assert.throws(() => readDisbursementInput(payload, 1000), BadRequestException, JSON.stringify(payload));
    }
  });

  it("allows any total when the approved budget is unknown (0)", () => {
    assert.equal(readDisbursementInput({ milestones: [milestone({ expectedAmount: 5000, disbursedAmount: 5000, status: "DISBURSED" })] }, 0).milestones.length, 1);
  });

  it("stamps transition dates, keeps earlier dates and clears them when reverted to PENDING", () => {
    const now = new Date("2026-10-09T03:00:00Z");
    const previous = { milestones: [{ id: "M1", disbursedDate: "2026-01-10" }] };
    const [kept] = stampMilestoneDates([milestone({ status: "SETTLED", disbursedAmount: 1000 })], previous, now);
    assert.equal(kept.disbursedDate, "2026-01-10");
    assert.equal(kept.settledDate, "2026-10-09");
    const [reverted] = stampMilestoneDates([milestone({ disbursedDate: "2026-01-10" })], previous, now);
    assert.equal(reverted.disbursedDate, undefined);
  });
});
