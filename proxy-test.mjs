import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
await db.$transaction(async (tx) => {
  console.log("Keys in tx:", Object.keys(tx));
  console.log("tx.proposalManagementOfficer:", !!tx.proposalManagementOfficer);
});
await db.$disconnect();
