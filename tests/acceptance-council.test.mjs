import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { readAcceptanceMembers, readAcceptanceScores, readAcceptanceStatus, readResolution } from "../dist/apps/api/proposal-evaluations/acceptance-council.js";

describe("acceptance council rules", () => {
  it("maps legacy status values onto the PROPOSED → ESTABLISHED → EVALUATED flow", () => {
    assert.equal(readAcceptanceStatus(null), "NONE");
    assert.equal(readAcceptanceStatus({ status: "proposed" }), "PROPOSED");
    assert.equal(readAcceptanceStatus({ status: "approved" }), "ESTABLISHED");
    assert.equal(readAcceptanceStatus({ status: "completed" }), "EVALUATED");
    assert.equal(readAcceptanceStatus({ status: "EVALUATED" }), "EVALUATED");
  });

  it("requires every score: missing scores never become a default 'excellent' result", () => {
    assert.throws(() => readAcceptanceScores({}), BadRequestException);
    assert.throws(() => readAcceptanceScores({ reportScore: 28, scientificProductsScore: 27, trainingProductsScore: 14 }), BadRequestException);
    assert.throws(() => readAcceptanceScores({ reportScore: 28, scientificProductsScore: 27, trainingProductsScore: 16, militaryMedicalPracticalScore: 24 }), BadRequestException);
    const result = readAcceptanceScores({ reportScore: "28", scientificProductsScore: 27, trainingProductsScore: 14, militaryMedicalPracticalScore: 24 });
    assert.equal(result.totalScore, 93);
    assert.equal(result.classification, "EXCELLENT");
    assert.equal(readAcceptanceScores({ reportScore: 20, scientificProductsScore: 20, trainingProductsScore: 10, militaryMedicalPracticalScore: 10 }).classification, "FAILED");
  });

  it("validates council composition", () => {
    const m = (profileId, role) => ({ profileId, role });
    assert.throws(() => readAcceptanceMembers([m("a", "CHAIRMAN"), m("b", "SECRETARY")]), BadRequestException);
    assert.throws(() => readAcceptanceMembers([m("a", "CHAIRMAN"), m("a", "SECRETARY"), m("c", "REVIEWER_1")]), BadRequestException);
    assert.throws(() => readAcceptanceMembers([m("a", "CHAIRMAN"), m("b", "CHAIRMAN"), m("c", "REVIEWER_1")]), BadRequestException);
    assert.throws(() => readAcceptanceMembers([m("a", "CHAIRMAN"), m("b", "SECRETARY"), m("c", "MEMBER")]), BadRequestException);
    assert.throws(() => readAcceptanceMembers([m("a", "CHAIRMAN"), m("b", "SECRETARY"), m("c", "BOSS")]), BadRequestException);
    assert.equal(readAcceptanceMembers([m("a", "CHAIRMAN"), m("b", "SECRETARY"), m("c", "REVIEWER_2")]).length, 3);
  });

  it("a failing total cannot be concluded as approved", () => {
    assert.throws(() => readResolution("approved", "FAILED"), BadRequestException);
    assert.equal(readResolution(undefined, "FAILED"), "rejected");
    assert.equal(readResolution(undefined, "PASSED"), "approved");
  });
});
