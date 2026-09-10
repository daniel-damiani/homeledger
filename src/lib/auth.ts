import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "hl_session";
/** Sliding session length; cookie is session-scoped so quitting the browser usually locks. */
export const IDLE_LOCK_MINUTES = 15;
const SESSION_TTL = `${IDLE_LOCK_MINUTES}m`;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be set (min 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function ensureSettings() {
  let settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    const pin = process.env.APP_PIN || "1234";
    const pinHash = await bcrypt.hash(pin, 10);
    settings = await prisma.appSettings.create({
      data: {
        id: 1,
        pinHash,
        currency: process.env.CURRENCY || "USD",
        monthStartDay: 1,
        onboarded: false,
      },
    });
  }
  return settings;
}

export async function createSessionCookie(): Promise<string> {
  const token = await new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
  return token;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export async function requireAuth(): Promise<boolean> {
  return isAuthenticated();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const settings = await ensureSettings();
  return bcrypt.compare(pin, settings.pinHash);
}

export async function setPin(newPin: string): Promise<void> {
  const pinHash = await bcrypt.hash(newPin, 10);
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      pinHash,
      currency: process.env.CURRENCY || "USD",
    },
    update: { pinHash },
  });
}

/** Session cookie: no maxAge, so it dies when the browser session ends. */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
};