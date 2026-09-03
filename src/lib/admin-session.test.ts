import assert from "node:assert/strict";
import test from "node:test";
import { createAdminSessionToken, verifyAdminPassword, verifyAdminSessionToken } from "./admin-session.ts";

test("admin sessions validate only the configured password and an untampered unexpired token", () => {
  const secret = "test-only-admin-password";
  assert.equal(verifyAdminPassword(secret, secret), true);
  assert.equal(verifyAdminPassword("incorrect", secret), false);
  assert.equal(verifyAdminPassword(secret, undefined), false);
  const issuedAt = 1_000;
  const token = createAdminSessionToken(secret, issuedAt);
  assert.equal(verifyAdminSessionToken(token, secret, issuedAt + 1), true);
  assert.equal(verifyAdminSessionToken(`${token}x`, secret, issuedAt + 1), false);
  assert.equal(verifyAdminSessionToken(token, secret, issuedAt + 12 * 60 * 60 * 1000 + 1), false);
});
