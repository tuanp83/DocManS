import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOrganizationUnit } from "../apps/web/src/lib/organization-match.ts";

const units = [
  { id: "a", code: "KHQS", name: "Phòng Khoa học Quân sự" },
  { id: "b", code: "K1", name: "Khoa Nội" },
  { id: "c", code: "K2", name: "Khoa Nội tiết" }
];

test("an empty affiliation matches no unit (it used to match the first unit in the list)", () => {
  assert.equal(matchOrganizationUnit(units, ""), undefined);
  assert.equal(matchOrganizationUnit(units, "   "), undefined);
});

test("exact name or code wins, case-insensitively", () => {
  assert.equal(matchOrganizationUnit(units, "khqs")?.id, "a");
  assert.equal(matchOrganizationUnit(units, "Khoa Nội")?.id, "b");
});

test("a partial match is used only when it is unambiguous", () => {
  assert.equal(matchOrganizationUnit(units, "Phòng Khoa học")?.id, "a");
  assert.equal(matchOrganizationUnit(units, "Khoa"), undefined, "matches several units");
  assert.equal(matchOrganizationUnit(units, "Bệnh viện 103"), undefined);
});
