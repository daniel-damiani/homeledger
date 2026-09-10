import { NextResponse } from "next/server";
import {
  createSessionCookie,
  IDLE_LOCK_MINUTES,
  isAuthenticated,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Slide the 15-minute JWT while the user is active. */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await createSessionCookie();
  const res = NextResponse.json({ ok: true, idleMinutes: IDLE_LOCK_MINUTES });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
