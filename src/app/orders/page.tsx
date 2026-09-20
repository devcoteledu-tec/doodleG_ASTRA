import type { Metadata } from 'next';
import OrdersClient from './OrdersClient';
export const metadata: Metadata = { title: 'Your orders', robots: { index: false, follow: false } };
export default function Page() { return <OrdersClient />; }
