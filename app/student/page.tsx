import type { Metadata } from 'next';
import StudentFlow from './StudentFlow';

export const metadata: Metadata = { title: 'Student report · Course Coverage' };

export default function Page() {
  return <StudentFlow />;
}
