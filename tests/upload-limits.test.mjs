import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readMaxUploadBytes, uploadInterceptorOptions } from "../dist/apps/api/modules/files/upload-limits.js";

const controllers = [
  new URL("../apps/api/src/modules/files/files.controller.ts", import.meta.url),
  new URL("../apps/api/src/scientific-documents/scientific-documents.controller.ts", import.meta.url)
];

describe("upload size limits are enforced while streaming, before the file is buffered", () => {
  it("reads FILE_MAX_UPLOAD_BYTES and falls back to 10 MB for missing or invalid values", () => {
    assert.equal(readMaxUploadBytes("5242880"), 5 * 1024 * 1024);
    assert.equal(readMaxUploadBytes(undefined), 10 * 1024 * 1024);
    assert.equal(readMaxUploadBytes("abc"), 10 * 1024 * 1024);
    assert.equal(readMaxUploadBytes("-1"), 10 * 1024 * 1024);
  });

  it("caps file size, file count and form fields for multer", () => {
    const { limits } = uploadInterceptorOptions(1234);
    assert.equal(limits.fileSize, 1234);
    assert.equal(limits.files, 1);
    assert.ok(limits.fields > 0 && limits.fieldSize > 0 && limits.parts > 0);
  });

  it("every FileInterceptor in the API uses the shared limits", async () => {
    for (const url of controllers) {
      const source = await readFile(url, "utf8");
      const interceptors = source.match(/FileInterceptor\([^)]*\)/g) ?? [];
      assert.ok(interceptors.length > 0, url.pathname);
      for (const call of interceptors) assert.match(call, /uploadInterceptorOptions\(\)/, `${url.pathname}: ${call}`);
    }
  });
});
