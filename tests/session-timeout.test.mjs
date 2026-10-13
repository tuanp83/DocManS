import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthStore } from "../dist/apps/api/auth/auth.store.js";
import { createSessionCookie } from "../dist/apps/api/auth/session-cookie.js";
import { AdminConfigService } from "../dist/apps/api/admin/admin-config.service.js";

function storeWith(parameterValue) {
  const tx = {
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ id: "u1", status: "active", credentialVersion: 1 }) },
    systemParameter: { findUnique: async () => (parameterValue === undefined ? null : { key: "session_timeout_minutes", value: parameterValue }) },
    session: { create: async ({ data }) => ({ id: "s1", createdAt: new Date(), revokedAt: null, ...data }) }
  };
  return new AuthStore({ $transaction: async (work) => work(tx) });
}

const minutesUntil = (iso) => Math.round((Date.parse(iso) - Date.now()) / 60000);

test("session lifetime follows session_timeout_minutes, falling back to 12 hours when missing or out of range", async () => {
  assert.equal(minutesUntil((await storeWith("60").createSession("u1", 1)).expiresAt), 60);
  assert.equal(minutesUntil((await storeWith(undefined).createSession("u1", 1)).expiresAt), 720);
  assert.equal(minutesUntil((await storeWith("5").createSession("u1", 1)).expiresAt), 720);
  assert.equal(minutesUntil((await storeWith("abc").createSession("u1", 1)).expiresAt), 720);
});

test("the session cookie expires together with the stored session", () => {
  const cookie = createSessionCookie("s1", true, new Date(Date.now() + 30 * 60 * 1000));
  const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)[1]);
  assert.ok(maxAge > 1790 && maxAge <= 1800, cookie);
  assert.match(createSessionCookie("s1", false), /Max-Age=43200/);
});

test("config definitions list only the parameters and templates the system actually uses", () => {
  const definitions = new AdminConfigService({}, {}).definitions();
  assert.deepEqual(definitions.parameters.map((item) => item.key), ["session_timeout_minutes"]);
  assert.deepEqual(definitions.templates.map((item) => item.key), ["researcher_account_activation"]);
  assert.deepEqual(definitions.templates[0].placeholders, ["displayName", "activationUrl", "expiresAt"]);
});
