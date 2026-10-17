import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { MinioObjectStorageService, storageReadFailure } from "../dist/apps/api/infrastructure/minio/minio-object-storage.service.js";
import { smtpRequireTls } from "../dist/apps/api/mail/smtp-tls.js";

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

function storageWith(getObject) {
  process.env.MINIO_BUCKET_NAME = "docmans-files";
  const storage = new MinioObjectStorageService();
  storage.client = { getObject };
  return storage;
}

test("an unreachable object store is reported as 503, a missing object stays 404", async () => {
  const down = storageWith(async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); });
  const outage = await down.getObject("key").catch((error) => error);
  assert.ok(outage instanceof ServiceUnavailableException);
  assert.equal(outage.getResponse().code, "STORAGE_UNAVAILABLE");
  assert.equal(storageReadFailure(outage), outage, "người dùng được báo kho tệp tạm thời không truy cập được, không phải tệp đã mất");

  const missing = storageWith(async () => { throw Object.assign(new Error("Not found"), { code: "NoSuchKey" }); });
  const absent = await missing.getObject("key").catch((error) => error);
  assert.equal(absent.code, "NoSuchKey");
  assert.ok(storageReadFailure(absent) instanceof NotFoundException);
});

test("STARTTLS is required by default except on localhost, and can be switched off for an internal relay", () => {
  delete process.env.SMTP_REQUIRE_TLS;
  assert.equal(smtpRequireTls("mail.hvqy.edu.vn"), true);
  assert.equal(smtpRequireTls("localhost"), false);
  process.env.SMTP_REQUIRE_TLS = "false";
  assert.equal(smtpRequireTls("mail.hvqy.edu.vn"), false);
  process.env.SMTP_REQUIRE_TLS = "true";
  assert.equal(smtpRequireTls("localhost"), true);
});
