import { NextResponse } from "next/server";
import {
  createSessionCookie,
  ensureSettings,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPin,
} from "@/lib/auth";

export async function POST(req: Request) {
  await ensureSettings();
  const body = await req.json().catch(() => ({}));
  const pin = String(body.pin ?? "");
  if (!pin || !(await verifyPin(pin))) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }
  const token = await createSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}