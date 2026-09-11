import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const ADMIN_COOKIE_NAME = "admin_session";

function expectedToken(): string | null {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function isAdminRequest(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const expected = expectedToken();
  if (!token || !expected) return false;
  return token === expected;
}

export function setAdminCookie(response: NextResponse) {
  const expected = expectedToken();
  if (!expected) return;
  response.cookies.set(ADMIN_COOKIE_NAME, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12시간
    path: "/",
  });
}
