import type { Metadata } from 'next';
import RecoveryClient from './RecoveryClient';
export const metadata: Metadata = { title: 'Recover checkout', robots: { index: false, follow: false } };
export default function Page() { return <RecoveryClient />; }
