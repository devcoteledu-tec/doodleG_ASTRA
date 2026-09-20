import type { Metadata } from 'next';
import GiftsClient from './GiftsClient';
export const metadata: Metadata = { title: 'Your gift plans', robots: { index: false, follow: false } };
export default function Page() { return <GiftsClient />; }
