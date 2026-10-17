import type { Prisma } from "@prisma/client";

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Mã số đề tài: <năm>-<mã đơn vị chủ trì>-<số thứ tự>, vd. 2026-K1-001. */
export function formatProposalCode(year: number, unitCode: string, sequence: number) {
  return `${year}-${unitCode}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Cấp mã khi hồ sơ được nộp lần đầu. Số thứ tự đếm riêng theo đơn vị chủ trì và năm (giờ Việt Nam) trên
 * `document_number_counters`, tăng nguyên tử nên hai hồ sơ nộp cùng lúc không trùng số. Đề tài kế thừa mã này.
 */
export async function allocateProposalCode(tx: Prisma.TransactionClient, unitCode: string, at: Date) {
  const year = new Date(at.getTime() + VIETNAM_OFFSET_MS).getUTCFullYear();
  const scope = `proposal-code:${unitCode}`;
  const [row] = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO document_number_counters (scope, year, last_value) VALUES (${scope}, ${year}, 1)
    ON CONFLICT (scope, year) DO UPDATE SET last_value = document_number_counters.last_value + 1
    RETURNING last_value AS value`;
  return formatProposalCode(year, unitCode, Number(row.value));
}
