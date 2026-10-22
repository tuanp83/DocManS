import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// Quyết định theo mẫu QĐ 4626/QĐ-HVQY: cửa sổ xem / in và bản Word dựng từ cùng một mẫu (apps/web/src/lib/decision-document.ts).

const read = (file) => readFileSync(file, "utf8");

test("cửa sổ xem / in quyết định dùng mẫu chung, không còn bản sao thể thức cũ", () => {
  for (const file of ["apps/web/src/components/research-proposals/official-council-decision-modal.tsx", "apps/web/src/components/research-proposals/official-decision-modal.tsx"]) {
    const source = read(file);
    assert.match(source, /buildDecisionHtml\((councilDecisionDocument|approvalDecisionDocument)\(/, file);
    assert.doesNotMatch(source, /57\/2021|Đã ký và đóng dấu/, file);
  }
});

test("bản Word của ba quyết định dựng từ mẫu chung; Tổ thẩm định có nút trên từng lần nghiệm thu sản phẩm", () => {
  const word = read("apps/web/src/lib/word-export.ts");
  for (const call of ["buildDecisionHtml(councilDecisionDocument(proposal))", "buildDecisionHtml(approvalDecisionDocument(proposal))", "buildDecisionHtml(productPanelDecisionDocument(input))"]) assert.ok(word.includes(call), call);
  assert.match(read("apps/web/src/components/projects/project-products-panel.tsx"), /exportProductPanelDecisionWord\(/);
  assert.match(read("apps/web/src/lib/decision-document.ts"), /Thông tư 14\/2022\/TT-BQP ngày 01\/02\/2022/);
});

test("văn bản và giao diện căn cứ Thông tư 14/2022/TT-BQP, không còn Thông tư 57/2021 đã thay thế", () => {
  for (const file of ["apps/web/src/lib/word-export.ts", "apps/web/src/components/projects/milestone-disbursement-modal.tsx", "apps/web/src/components/research-proposals/evaluation/council-draft-form.tsx"]) {
    assert.doesNotMatch(read(file), /57\/2021|Thông tư 57/, file);
  }
  assert.equal((read("apps/web/src/lib/word-export.ts").match(/Thông tư số 14\/2022\/TT-BQP/g) ?? []).length, 3);
});
