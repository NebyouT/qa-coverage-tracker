import 'server-only';
import { NextResponse } from 'next/server';
import { isAdmin } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown) => NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  const msg = e instanceof Error ? e.message : 'Unexpected error';
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Invalid request body');
  }
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new HttpError(401, 'Please sign in again.');
}

export function bad(message: string): never {
  throw new HttpError(400, message);
}
