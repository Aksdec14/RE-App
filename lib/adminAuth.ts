import crypto from "node:crypto";
import { cookies } from "next/headers";
import { AppError } from "./errors";

const COOKIE_NAME = "sg_cloud_admin";
const SESSION_SECONDS = 60 * 60 * 8;

function secret(): string {
  return process.env.ADMIN_SECRET ?? "restaurant-cloud-dev-secret";
}

function safeEqual(left: string, right: string): boolean {
  const leftHash = crypto.createHash("sha256").update(left).digest();
  const rightHash = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

function createToken(): string {
  const expiry = String(Date.now() + SESSION_SECONDS * 1000);
  return `${expiry}.${sign(expiry)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expiry, signature] = token.split(".");
  if (!expiry || !signature || !/^\d+$/.test(expiry)) return false;
  if (Number(expiry) < Date.now()) return false;
  return safeEqual(sign(expiry), signature);
}

export function assertAdminConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.ADMIN_PASSWORD) {
    throw new AppError(
      "ADMIN_PASSWORD is not set. Add it before running the cloud console in production.",
      503,
    );
  }
  if (!process.env.ADMIN_SECRET) {
    throw new AppError(
      "ADMIN_SECRET is not set. Add a long random value before running the cloud console in production.",
      503,
    );
  }
}

export function checkAdminPassword(password: string): boolean {
  return safeEqual(password, process.env.ADMIN_PASSWORD ?? "admin123");
}

export async function hasAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) {
    throw new AppError("Super admin login required", 401);
  }
}

export async function startAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
    secure: process.env.NODE_ENV === "production" && process.env.VERCEL === "1",
  });
}

export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
