import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "golf-scoring-admin";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

const signatureFor = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

const secureEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export const verifyAdminPassword = (password: string, expectedPassword: string | undefined) => {
  if (!expectedPassword) return false;
  return secureEqual(password, expectedPassword);
};

export const createAdminSessionToken = (secret: string, now = Date.now()) => {
  const expiresAt = now + SESSION_DURATION_MS;
  const payload = `${randomBytes(18).toString("base64url")}.${expiresAt}`;
  return `${payload}.${signatureFor(payload, secret)}`;
};

export const verifyAdminSessionToken = (token: string | undefined, secret: string | undefined, now = Date.now()) => {
  if (!token || !secret) return false;
  const [nonce, expiresAtValue, signature, ...extra] = token.split(".");
  const expiresAt = Number(expiresAtValue);
  if (!nonce || !signature || extra.length || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const payload = `${nonce}.${expiresAtValue}`;
  return secureEqual(signature, signatureFor(payload, secret));
};
