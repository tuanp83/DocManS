import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// "Việc của tôi" dùng dữ liệu thật (docs/design/quan-ly-tien-do-nhiem-vu.md, mục 7).

test("my-tasks renders the server work queue, not mock data", () => {
  const page = readFileSync("apps/web/src/app/my-tasks/page.tsx", "utf8");
  assert.match(page, /WorkQueueList/);
  assert.equal(/mockTasks|showcase-data/.test(page), false);
  const list = readFileSync("apps/web/src/components/work-queue/work-queue-list.tsx", "utf8");
  assert.match(list, /loadWorkQueue/);
});

test("my-tasks is no longer hidden behind the feature flag; /tasks still is", () => {
  const navigation = readFileSync("apps/web/src/lib/navigation.ts", "utf8");
  assert.match(navigation, /item\.href !== "\/tasks"/);
  assert.equal(/item\.href !== "\/my-tasks"/.test(navigation), false);
});

test("project detail shows the progress panel and the weighted setup form", () => {
  const detail = readFileSync("apps/web/src/components/projects/project-detail.tsx", "utf8");
  assert.match(detail, /ProjectProgressPanel/);
  assert.match(detail, /ProjectSetupForm/);
});
