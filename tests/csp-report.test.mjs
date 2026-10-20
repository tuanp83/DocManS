import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import express from "express";
import { CSP_REPORT_PATH, cspReportHandler, parseCspReports } from "../dist/apps/api/security/csp-report.js";
import { csrfProtection } from "../dist/apps/api/auth/csrf.js";

// Báo cáo vi phạm CSP (apps/api/src/security/csp-report.ts) và cách giao diện gắn CSP (apps/web/src/proxy.ts).

let server;
let base;

before(async () => {
  const app = express();
  app.post(CSP_REPORT_PATH, ...cspReportHandler());
  app.use(csrfProtection(["https://docmans.hvqy.test"]));
  app.all(/.*/, (_, response) => response.json({ ok: true }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

test("chuẩn hoá cả định dạng csp-report cũ lẫn Reporting API, cắt ngắn trường dài", () => {
  const legacy = parseCspReports({ "csp-report": { "document-uri": "https://x/dashboard", "violated-directive": "script-src-elem", "blocked-uri": "inline", "source-file": "https://x/a.js", "line-number": 12, disposition: "report" } });
  assert.deepEqual(legacy, [{ documentUri: "https://x/dashboard", directive: "script-src-elem", blockedUri: "inline", sourceFile: "https://x/a.js", lineNumber: 12, disposition: "report" }]);
  const modern = parseCspReports([{ type: "csp-violation", body: { documentURL: "https://x/", effectiveDirective: "style-src-elem", blockedURL: "x".repeat(1000), lineNumber: "3" } }, { type: "deprecation", body: {} }]);
  assert.equal(modern.length, 1);
  assert.equal(modern[0].blockedUri.length, 300);
  assert.equal(modern[0].lineNumber, null);
  assert.deepEqual(parseCspReports({}), []);
  assert.deepEqual(parseCspReports(null), []);
  assert.equal(parseCspReports(Array.from({ length: 50 }, () => ({ type: "csp-violation", body: {} }))).length, 20);
});

test("endpoint nhận báo cáo không cần phiên, không bị lớp chống giả mạo chặn, giới hạn 16 KB", async () => {
  for (const type of ["application/csp-report", "application/reports+json"]) {
    const response = await fetch(`${base}${CSP_REPORT_PATH}`, { method: "POST", headers: { "content-type": type }, body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }) });
    assert.equal(response.status, 204, type);
  }
  const tooLarge = await fetch(`${base}${CSP_REPORT_PATH}`, { method: "POST", headers: { "content-type": "application/csp-report" }, body: JSON.stringify({ "csp-report": { "blocked-uri": "x".repeat(20_000) } }) });
  assert.equal(tooLarge.status, 413);
  // Các đường dẫn khác vẫn qua lớp chống giả mạo yêu cầu.
  const other = await fetch(`${base}/api/v1/security/khac`, { method: "POST", headers: { "content-type": "application/csp-report" }, body: "{}" });
  assert.equal(other.status, 415);
});

test("giao diện gắn CSP có nonce trong proxy.ts, dựng động, không còn Google Fonts hay script nội tuyến trong trang tĩnh", () => {
  const proxy = readFileSync("apps/web/src/proxy.ts", "utf8");
  assert.match(proxy, /export async function proxy\(/);
  assert.match(proxy, /createNonce\(\)/);
  assert.match(proxy, /requestHeaders\.set\("x-nonce", nonce\)/);
  assert.match(proxy, /requestHeaders\.set\("Content-Security-Policy", policy\)/);
  assert.equal(existsSync("apps/web/src/middleware.ts"), false);
  assert.match(readFileSync("apps/web/src/app/layout.tsx", "utf8"), /await connection\(\)/);
  for (const file of ["apps/web/src/app/globals.css", "apps/web/src/themes/hvqy1.css", "apps/web/src/app/layout.tsx"]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /fonts\.googleapis|fonts\.gstatic/, file);
  }
  for (const file of ["apps/web/public/huong-dan-truong-ban-qlkh.html", "apps/web/public/huong-dan-truong-phong-khqs.html"]) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /<script>(?!\s*<\/script>)/, `${file}: không có script nội tuyến`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${file}: không có trình xử lý sự kiện nội tuyến`);
    assert.match(html, /<script src="\/huong-dan\.js"><\/script>/);
  }
});

test("triển khai: web đọc CSP_MODE (mặc định report-only ở production), nginx thêm header bảo mật", () => {
  const compose = readFileSync("docker-compose.prod.yml", "utf8");
  assert.match(compose, /CSP_MODE: \$\{CSP_MODE:-report-only\}/);
  const nginx = readFileSync("nginx/prod/templates/default.conf.template", "utf8");
  for (const header of ["Permissions-Policy", "Cross-Origin-Opener-Policy same-origin", "Cross-Origin-Resource-Policy same-origin", "Content-Security-Policy \"frame-ancestors 'none'\""]) {
    assert.ok(nginx.includes(header), header);
  }
});
