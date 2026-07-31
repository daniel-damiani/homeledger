import { NextResponse } from "next/server";
import { isAuthenticated, setPin, verifyPin } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const currentPin = String(body.currentPin || "");
  const newPin = String(body.newPin || "");
  if (newPin.length < 4) {
    return NextResponse.json({ error: "New PIN must be at least 4 characters" }, { status: 400 });
  }
  if (!(await verifyPin(currentPin))) {
    return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
  }
  await setPin(newPin);
  return NextResponse.json({ ok: true });
}