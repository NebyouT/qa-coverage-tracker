import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'qa_admin';

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  // Local development only: default password "admin". In production a password must be set.
  return process.env.NODE_ENV === 'production' ? null : 'admin';
}

export function tokenFor(password: string): string {
  return crypto.createHmac('sha256', password).update('qa-coverage-admin-v1').digest('hex');
}

export function passwordMatches(input: string): boolean {
  const p = adminPassword();
  if (!p) return false;
  const a = Buffer.from(tokenFor(input));
  const b = Buffer.from(tokenFor(p));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const p = adminPassword();
  if (!p) return false;
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === tokenFor(p);
}
