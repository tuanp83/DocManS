import { describe, expect, it } from "vitest";
import { apiOrigin, cspHeaderName, cspMode, isStaticHtmlPath, pageCsp, staticHtmlCsp } from "@/lib/csp";

const directives = (policy: string) => Object.fromEntries(policy.split("; ").map((part) => { const [name, ...values] = part.split(" "); return [name, values]; }));

describe("chính sách bảo mật nội dung (lib/csp.ts)", () => {
  it("trang Next.js: script chỉ chạy khi có nonce, không có unsafe-inline/unsafe-eval ở production", () => {
    const policy = directives(pageCsp({ nonce: "abc123", isDev: false, apiBaseUrl: "/api/v1" }));
    expect(policy["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(policy["style-src"]).toEqual(["'self'", "'nonce-abc123'"]);
    expect(policy["style-src-attr"]).toEqual(["'unsafe-inline'"]);
    expect(policy["connect-src"]).toEqual(["'self'"]);
    expect(policy["font-src"]).toEqual(["'self'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["report-uri"]).toEqual(["/api/v1/security/csp-report"]);
    expect("upgrade-insecure-requests" in policy).toBe(true);
    const serialized = pageCsp({ nonce: "abc123", isDev: false });
    expect(serialized).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(serialized).not.toMatch(/googleapis|gstatic|https?:\/\//);
  });

  it("môi trường phát triển: thêm unsafe-eval cho React và nguồn API ở cổng khác", () => {
    const policy = directives(pageCsp({ nonce: "n", isDev: true, apiBaseUrl: "http://localhost:4000/api/v1" }));
    expect(policy["script-src"]).toContain("'unsafe-eval'");
    expect(policy["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy["connect-src"]).toEqual(["'self'", "http://localhost:4000"]);
    expect(policy["report-uri"]).toEqual(["http://localhost:4000/api/v1/security/csp-report"]);
    expect("upgrade-insecure-requests" in policy).toBe(false);
  });

  it("trang HTML tĩnh: không có nonce, không cho script nội tuyến, không gọi mạng", () => {
    const policy = directives(staticHtmlCsp({ isDev: false }));
    expect(policy["script-src"]).toEqual(["'self'"]);
    expect(policy["connect-src"]).toEqual(["'none'"]);
    expect(policy["form-action"]).toEqual(["'none'"]);
    expect(isStaticHtmlPath("/huong-dan-truong-ban-qlkh.html")).toBe(true);
    expect(isStaticHtmlPath("/dashboard")).toBe(false);
    expect(isStaticHtmlPath("/a/b.html")).toBe(false);
  });

  it("chế độ: mặc định chặn; report-only dùng header chỉ báo cáo; off tắt", () => {
    expect(cspMode(undefined)).toBe("enforce");
    expect(cspMode("bất kỳ")).toBe("enforce");
    expect(cspMode(" Report-Only ")).toBe("report-only");
    expect(cspMode("off")).toBe("off");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
  });

  it("nguồn API chỉ lấy từ địa chỉ đầy đủ", () => {
    expect(apiOrigin("/api/v1")).toBeNull();
    expect(apiOrigin(undefined)).toBeNull();
    expect(apiOrigin("https://docmans.hvqy.edu.vn/api/v1")).toBe("https://docmans.hvqy.edu.vn");
  });
});
