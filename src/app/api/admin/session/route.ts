import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, verifyAdminPassword, verifyAdminSessionToken } from "@/lib/admin-session";

export const runtime = "nodejs";

const cookieOptions = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" };
const password = () => process.env.GOLF_SCORING_ADMIN_PASSWORD;

export async function GET() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  return NextResponse.json({ admin: verifyAdminSessionToken(token, password()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let passwordAttempt = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "password" in body && typeof body.password === "string") passwordAttempt = body.password;
  } catch { /* Treat malformed input as an invalid password. */ }
  const configuredPassword = password();
  if (!configuredPassword || !verifyAdminPassword(passwordAttempt, configuredPassword)) return NextResponse.json({ admin: false, error: "Invalid admin credentials." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const response = NextResponse.json({ admin: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ ...cookieOptions, name: ADMIN_SESSION_COOKIE, value: createAdminSessionToken(configuredPassword) });
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ admin: false }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({ ...cookieOptions, name: ADMIN_SESSION_COOKIE, value: "", maxAge: 0 });
  return response;
}
