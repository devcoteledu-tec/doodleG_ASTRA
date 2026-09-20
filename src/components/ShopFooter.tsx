'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { SOCIAL_LINKS } from '@/lib/socialLinks';

// Custom SVG Social Icons for maximum safety against library version differences
const InstagramIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const FacebookIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const YoutubeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export default function ShopFooter() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-neutral-900 border-t border-white/5 py-16 text-gray-300">
      
      {/* Decorative Diagonal Light Effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div className="absolute top-0 left-0 w-full h-full bg-[linear-gradient(135deg,rgba(255,255,255,1)_0%,rgba(255,255,255,0)_50%,rgba(255,255,255,1)_100%)]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 text-sm">
          
          {/* Brand Info */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <Image
                src="https://i.postimg.cc/05MQmBLc/Chat-GPT-Image-Aug-6-2026-03-29-20-PM.png"
                alt="Logo"
                width={28}
                height={28}
                unoptimized
                className="w-7 h-7 object-contain rounded-md"
              />
              <span className="font-display font-bold text-white text-lg tracking-wider">
                doodle_<span className="text-[#3b82f6]">G</span>
              </span>
            </Link>
            <p className="text-xs leading-relaxed text-gray-400">
              Frictionless Sentimentality. AI-curated gift packages mapped to your loved one&apos;s passions, quirks, and relationship dynamic.
            </p>
            
            {/* Social Icons */}
            <div className="flex items-center gap-3.5 pt-2">
              {[
                { Icon: InstagramIcon, href: SOCIAL_LINKS.instagram, label: 'Instagram' },
                { Icon: FacebookIcon,  href: SOCIAL_LINKS.facebook,  label: 'Facebook' },
                { Icon: YoutubeIcon,   href: SOCIAL_LINKS.youtube,   label: 'Youtube' },
                { Icon: XIcon,         href: SOCIAL_LINKS.x,         label: 'X (Twitter)' }
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Links Column 1: Shop */}
          <div className="space-y-4">
            <h5 className="text-white font-bold text-xs uppercase tracking-widest">Shop</h5>
            <ul className="space-y-2.5 text-xs text-gray-400">
              <li>
                <Link href="/shop/collection?tab=new-arrivals" className="hover:text-white transition-colors">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link href="/shop/collection?tab=flash-sales" className="hover:text-white transition-colors">
                  Flash Sales
                </Link>
              </li>
              <li>
                <Link href="/shop/collection?tab=best-sellers" className="hover:text-white transition-colors">
                  Best Sellers
                </Link>
              </li>
              <li>
                <Link href="/shop/collection" className="hover:text-white transition-colors">
                  All Products
                </Link>
              </li>
            </ul>
          </div>

          {/* Links Column 2: Support */}
          <div className="space-y-4">
            <h5 className="text-white font-bold text-xs uppercase tracking-widest">Support</h5>
            <ul className="space-y-2.5 text-xs text-gray-400">
              <li>
                <Link href="/support?tab=faq" className="hover:text-white transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/support?tab=shipping" className="hover:text-white transition-colors">
                  Shipping Policy
                </Link>
              </li>
              <li>
                <Link href="/support?tab=returns" className="hover:text-white transition-colors">
                  30-Day Returns
                </Link>
              </li>
              <li>
                <Link href="/support?tab=contact" className="hover:text-white transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-white transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/refund" className="hover:text-white transition-colors">
                  Refund &amp; Cancellation
                </Link>
              </li>
            </ul>
          </div>

          {/* Links Column 3: Account */}
          <div className="space-y-4">
            <h5 className="text-white font-bold text-xs uppercase tracking-widest">Account</h5>
            <ul className="space-y-2.5 text-xs text-gray-400">
              <li>
                <Link href="/auth" className="hover:text-white transition-colors">
                  Sign In / Register
                </Link>
              </li>
              <li>
                <Link href="/my-profile" className="hover:text-white transition-colors">
                  My Orders & Profile
                </Link>
              </li>
              <li>
                <Link href="/wishlist" className="hover:text-white transition-colors">
                  My Wishlist
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-white transition-colors">
                  doodle_G Hub
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* Divider */}
        <div className="border-t border-white/5 my-10" />

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-gray-400">
          <div className="space-y-1 text-center md:text-left">
            <p className="flex flex-wrap items-center justify-center md:justify-start gap-x-2">
              <span>© {new Date().getFullYear()} doodle_G. All rights reserved.</span>
              <span className="text-gray-600">•</span>
              <Link href="/legal/terms" className="hover:text-white hover:underline transition-colors">
                Terms &amp; Conditions
              </Link>
              <span className="text-gray-600">•</span>
              <Link href="/legal/privacy" className="hover:text-white hover:underline transition-colors">
                Privacy Policy
              </Link>
            </p>
            <p className="text-[10px] text-gray-500">
              Powered by{' '}
              <a 
                href="https://www.devcotel.com" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white hover:underline transition-colors font-medium"
              >
                www.devcotel.com
              </a>
            </p>
          </div>

          <div className="flex items-center gap-5 text-gray-500">
            <span className="flex items-center gap-1.5">🚚 Express Delivery</span>
            <span className="flex items-center gap-1.5">🛡️ Secure Checkout</span>
            <span className="flex items-center gap-1.5">↩️ 30-Day Returns</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
