import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminPassword, passwordMatches, tokenFor } from '@/lib/auth';
import { readJson } from '@/lib/http';

export async function POST(req: Request) {
  const { password } = await readJson<{ password: string }>(req).catch(() => ({ password: '' }));
  if (!adminPassword()) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not set on the server. Add it in Vercel → Settings → Environment Variables.' }, { status: 500 });
  }
  if (!passwordMatches(String(password ?? ''))) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, tokenFor(adminPassword()!), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
