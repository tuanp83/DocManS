import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

// Nghiệm thu, giải ngân, thanh lý, đóng đề tài trên giao diện (docs/design/nghiem-thu-thanh-ly-dong-de-tai.md).

const read = (path) => readFileSync(path, "utf8");

test("giải ngân gọi API của đề tài, quyền lấy từ máy chủ, chứng từ là tệp của đề tài", () => {
  const modal = read("apps/web/src/components/projects/milestone-disbursement-modal.tsx");
  assert.match(modal, /getProjectFinance\(project\.id\)/);
  assert.match(modal, /updateProjectFinance\(project\.id/);
  assert.match(modal, /financeVersion: finance\.disbursement\.version/);
  assert.match(modal, /uploadProjectFile\(project, file, "disbursement_voucher"\)/);
  assert.match(modal, /finance\?\.canManage === true/);
  // Không còn suy quyền theo vai trò ở trình duyệt hay gọi API giải ngân theo hồ sơ đề xuất.
  assert.equal(/currentUserRole ===/.test(modal), false);
  assert.equal(/research-proposals\/\$\{proposalId\}\/disbursement|relatedEntityType", "research_proposal"/.test(modal), false);
  const api = read("apps/web/src/lib/proposal-evaluations-api.ts");
  assert.equal(/acceptance-council\/|\/disbursement`/.test(api), false);
});

test("trang đề tài: nút nghiệm thu / thanh lý / đóng / kinh phí theo capability", () => {
  const panel = read("apps/web/src/components/projects/project-closure-panel.tsx");
  for (const action of ["project.acceptance.submit", "project.acceptance.revision.submit", "project.acceptance.return", "project.acceptance.council.propose", "project.acceptance.council.establish", "project.acceptance.minutes.record", "project.acceptance.revision.confirm", "project.liquidation.prepare", "project.liquidation.approve", "project.close"]) {
    assert.ok(panel.includes(`"${action}"`), action);
  }
  assert.equal(/systemRole/.test(panel), false, "không quyết định nút theo vai trò hệ thống");
  const detail = read("apps/web/src/components/projects/project-detail.tsx");
  assert.match(detail, /<ProjectClosurePanel /);
  assert.match(detail, /allowed\("project\.finance\.read"\)/);
  assert.equal(/account\?\.systemRole === "RESEARCH_MANAGEMENT_STAFF"/.test(detail), false);
});

test("hồ sơ đề xuất không còn mở hội đồng nghiệm thu / giải ngân riêng; chuyển sang trang đề tài", () => {
  assert.equal(existsSync("apps/web/src/components/research-proposals/acceptance-council-modal.tsx"), false);
  const workspace = read("apps/web/src/components/reviews/proposal-reviews-workspace.tsx");
  assert.equal(/AcceptanceCouncilModal|MilestoneDisbursementModal/.test(workspace), false);
  assert.match(workspace, /\/projects\/\$\{selectedProposal\.project\.id\}/);
});
