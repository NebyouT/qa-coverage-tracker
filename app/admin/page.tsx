import type { Metadata } from 'next';
import { isAdmin } from '@/lib/auth';
import AdminApp from './AdminApp';
import Login from './Login';

export const metadata: Metadata = { title: 'QA Admin · Course Coverage' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  return (await isAdmin()) ? <AdminApp /> : <Login />;
}
