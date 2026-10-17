import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createMigratedDatabase } from "./helpers/disposable-database.mjs";
import { PrismaService } from "../dist/apps/api/infrastructure/prisma/prisma.service.js";
import { allocateProposalCode, formatProposalCode } from "../dist/apps/api/research-proposals/proposal-code.js";

// Mã số đề tài cấp khi nộp lần đầu: <năm giờ Việt Nam>-<mã đơn vị>-<số thứ tự>, đếm riêng theo đơn vị và năm.

let database;
let db;
const originalUrl = process.env.DATABASE_URL;

before(async () => {
  database = await createMigratedDatabase("proposal_code");
  process.env.DATABASE_URL = database.url;
  db = new PrismaService();
});

after(async () => {
  await db?.$disconnect();
  process.env.DATABASE_URL = originalUrl;
  await database?.drop();
});

const allocate = (unitCode, at) => db.$transaction((tx) => allocateProposalCode(tx, unitCode, at));

test("codes count per unit and per Vietnam-time year", async () => {
  assert.equal(formatProposalCode(2026, "K1", 7), "2026-K1-007");
  const at = new Date("2026-05-10T03:00:00Z");
  assert.equal(await allocate("K1", at), "2026-K1-001");
  assert.equal(await allocate("K1", at), "2026-K1-002");
  assert.equal(await allocate("K2", at), "2026-K2-001", "đơn vị khác đếm riêng");
  // 31/12 lúc 17:30 UTC đã là 01/01 năm sau ở Việt Nam.
  assert.equal(await allocate("K1", new Date("2026-12-31T17:30:00Z")), "2027-K1-001");
});

test("concurrent submissions never receive the same code", async () => {
  const at = new Date("2028-03-01T03:00:00Z");
  const codes = await Promise.all(Array.from({ length: 10 }, () => allocate("K9", at)));
  assert.equal(new Set(codes).size, 10);
  assert.deepEqual([...codes].sort(), Array.from({ length: 10 }, (_, index) => formatProposalCode(2028, "K9", index + 1)));
});
