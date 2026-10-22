import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

// Theo dõi đề tài: bảng như danh sách hồ sơ, đặt trong trang Quản lý đề tài.

const read = (file) => readFileSync(file, "utf8");

test("Theo dõi đề tài hiển thị dạng bảng nhiều đề tài một trang, có tìm kiếm", () => {
  const list = read("apps/web/src/components/projects/project-list.tsx");
  assert.match(list, /<table className="data-table">/);
  for (const header of ["Đề tài & Chủ nhiệm", "Thời gian thực hiện", "Tiến độ thực hiện", "Sức khoẻ", "Hạn gần nhất", "Trạng thái", "Hành động"]) assert.ok(list.includes(`>${header}</th>`), header);
  assert.doesNotMatch(list, /className="list-card"/);
  assert.match(list, /foldSearchText\(keyword\.trim\(\)\)/);
});

test("Quản lý đề tài có hai tab; /projects chuyển sang tab với vai trò đã gộp", () => {
  const workspace = read("apps/web/src/components/research-proposals/proposals-workspace.tsx");
  assert.match(workspace, /searchParams\.get\("tab"\) === "projects"/);
  assert.match(workspace, /tab === "projects" \? <ProjectList \/> : <ResearchProposalsPanel allowCreate=\{false\} \/>/);
  assert.match(read("apps/web/src/app/proposals/page.tsx"), /<ProposalsWorkspace \/>/);
  assert.match(read("apps/web/src/components/projects/projects-page.tsx"), /router\.replace\("\/proposals\?tab=projects"\)/);
});
