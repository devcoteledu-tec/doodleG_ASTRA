'use client';

import React from 'react';
import Link from 'next/link';
import { FileText, ShieldCheck, RotateCcw, ArrowLeft } from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';

export type LegalTab = 'terms' | 'privacy' | 'refund';

const tabs: { id: LegalTab; label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'terms', label: 'Terms & Conditions', href: '/legal/terms', icon: FileText },
  { id: 'privacy', label: 'Privacy Policy', href: '/legal/privacy', icon: ShieldCheck },
  { id: 'refund', label: 'Refund & Cancellation', href: '/legal/refund', icon: RotateCcw },
];

// Last-updated date shown on every legal page. Bump this whenever policy
// copy changes materially so it stays honest — don't leave it stale.
export const LEGAL_LAST_UPDATED = 'July 2026';

export default function LegalPageClient({
  active,
  title,
  children,
}: {
  active: LegalTab;
  title: string;
  children: React.ReactNode;
}) {
  const { cartCount, state } = useCart();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-12">
        {/* Back Link */}
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Shop
        </Link>

        {/* Title */}
        <div className="mb-10 space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-sm text-gray-500">Last updated: {LEGAL_LAST_UPDATED}</p>
        </div>

        {/* Tab Buttons — real routes, not query params, so each policy is its own indexable page */}
        <div className="flex border-b border-gray-200 overflow-x-auto gap-2 mb-8 no-scrollbar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Body */}
        <div className="legal-content bg-white border border-gray-200 rounded-2xl p-6 md:p-10 text-sm md:text-[15px] leading-relaxed text-gray-600">
          {children}
        </div>
      </main>

      <ShopFooter />

      {/*
        Tailwind's typography plugin (@tailwindcss/typography) isn't
        installed in this project, so `prose` utility classes silently
        no-op. Scoped styled-jsx rules give the same result without adding
        a new dependency.
      */}
      <style jsx global>{`
        .legal-content h2 {
          font-weight: 700;
          font-size: 1.125rem;
          color: #111827;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
        }
        .legal-content h2:first-child {
          margin-top: 0;
        }
        .legal-content p {
          margin-bottom: 1rem;
        }
        .legal-content ul,
        .legal-content ol {
          margin-bottom: 1rem;
          padding-left: 1.25rem;
        }
        .legal-content ul {
          list-style: disc;
        }
        .legal-content ol {
          list-style: decimal;
        }
        .legal-content li {
          margin-bottom: 0.375rem;
        }
        .legal-content a {
          color: #2563eb;
          text-decoration: underline;
        }
        .legal-content strong {
          color: #111827;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
