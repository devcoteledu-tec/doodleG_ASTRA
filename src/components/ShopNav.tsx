'use client';
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Hexagon, Heart, Menu, X, ChevronDown, Users, LogOut, User, UserCircle } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import { SOCIAL_LINKS } from '@/lib/socialLinks';

// Custom SVG Social Icons for maximum safety against library version differences
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const YoutubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const socialNavItems = [
  { Icon: InstagramIcon, href: SOCIAL_LINKS.instagram, label: 'Instagram' },
  { Icon: FacebookIcon,  href: SOCIAL_LINKS.facebook,  label: 'Facebook' },
  { Icon: YoutubeIcon,   href: SOCIAL_LINKS.youtube,   label: 'Youtube' },
  { Icon: XIcon,         href: SOCIAL_LINKS.x,         label: 'X (Twitter)' },
];

interface NavProps {
  cartCount?: number;
  wishlistCount?: number;
}

const navLinks = [
  { label: 'Home',       href: '/' },
  { label: 'Shop',       href: '/shop' },
  { label: 'Tailoring',  href: '/tailoring' },
  { label: 'Providers',  href: '/profiles' },
  { label: 'Cart',       href: '/cart' },
];

export default function ShopNav({ cartCount = 0, wishlistCount = 0 }: NavProps) {
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut = () => {
    signOut();
    setUserMenuOpen(false);
    router.push('/');
  };

  return (
    <>
      {/* ── Announcement bar ── */}
      <div className="bg-black text-white text-center text-xs font-semibold py-2 px-4 tracking-wider">
        🎁 Free Express Delivery on Surprise Gifts · Use code <strong>DOODLEG20</strong> for 20% OFF · Limited Time
      </div>

      {/* ── Main nav ── */}
      <header className="bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-black/8 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16 gap-6">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
            <Image
              src="https://i.postimg.cc/05MQmBLc/Chat-GPT-Image-Aug-6-2026-03-29-20-PM.png"
              alt="doodle_G Logo"
              width={32}
              height={32}
              unoptimized
              className="w-8 h-8 object-contain rounded-md"
            />
            <span className="font-display text-xl font-bold tracking-wider text-black">
              doodle_<span className="text-[#002f6c]">G</span>
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <div key={link.label} className="relative group">
                <Link
                  href={link.href}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    pathname === link.href
                      ? 'text-black bg-black/6 font-semibold'
                      : 'text-gray-600 hover:text-black hover:bg-black/5'
                  }`}
                >
                  {link.label}
                </Link>
              </div>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <Link
              href="/onboarding"
              className="p-2 rounded-lg text-gray-500 hover:text-black hover:bg-black/5 transition-all"
            >
              <Hexagon className="w-5 h-5" />
            </Link>

            <Link
              href="/wishlist"
              className={`relative p-2 rounded-lg transition-all ${
                pathname === '/wishlist'
                  ? 'text-rose-500 bg-rose-50'
                  : 'text-gray-500 hover:text-rose-500 hover:bg-rose-50'
              }`}
            >
              <Heart className={`w-5 h-5 ${pathname === '/wishlist' ? 'fill-rose-500' : ''}`} />
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {wishlistCount}
                </span>
              )}
            </Link>

            <Link
              href="/cart"
              className="relative p-2 rounded-lg text-gray-500 hover:text-black hover:bg-black/5 transition-all"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-black text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>

            {/* ── Auth section ── */}
            {user ? (
              /* Logged in — avatar + dropdown */
              <div className="relative hidden md:block" ref={menuRef}>
                <button
                  id="user-menu-btn"
                  onClick={() => setUserMenuOpen(p => !p)}
                  className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl hover:bg-black/5 transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-bold uppercase flex-shrink-0">
                    {user.user_name.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 hidden lg:block max-w-[80px] truncate">
                    {user.user_name}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-white border border-black/8 rounded-2xl shadow-xl py-2 z-50"
                    >
                      {/* User info header */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-bold text-gray-900">@{user.user_name}</p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                      <div className="py-1">
                        <Link
                          href="/my-profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:text-black hover:bg-gray-50 transition-colors"
                        >
                          <UserCircle className="w-4 h-4" />
                          My Profile
                        </Link>
                        <Link
                          href="/wishlist"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Heart className="w-4 h-4" />
                          My Wishlist
                          {wishlistCount > 0 && (
                            <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                              {wishlistCount}
                            </span>
                          )}
                        </Link>
                        <Link
                          href="/profiles"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:text-black hover:bg-gray-50 transition-colors"
                        >
                          <Users className="w-4 h-4" />
                          Providers
                        </Link>
                        <Link
                          href="/cart"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:text-black hover:bg-gray-50 transition-colors"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          My Cart
                          {cartCount > 0 && (
                            <span className="ml-auto bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                              {cartCount}
                            </span>
                          )}
                        </Link>
                      </div>
                      <div className="border-t border-gray-100 py-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* Not logged in — Sign In button */
              <Link
                href="/auth"
                id="nav-signin-btn"
                className="hidden md:flex items-center gap-1.5 bg-black text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-gray-900 transition-all"
              >
                <User className="w-3.5 h-3.5" />
                Sign In
              </Link>
            )}

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen(p => !p)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-black hover:bg-black/5 transition-all"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/30 z-40 md:hidden"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 right-0 w-72 bg-white z-50 p-6 space-y-6 flex flex-col shadow-2xl md:hidden"
            >
              <div className="flex justify-between items-center">
                <span className="font-display text-lg font-bold text-black">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="text-gray-500 hover:text-black">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile user info */}
              {user ? (
                <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
                  <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center text-sm font-bold uppercase">
                    {user.user_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">@{user.user_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
              ) : (
                <Link
                  href="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 bg-black text-white font-bold py-3 rounded-xl text-sm"
                >
                  <User className="w-4 h-4" /> Sign In / Create Account
                </Link>
              )}

              <nav className="space-y-1 flex-1">
                {navLinks.map(link => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      pathname === link.href
                        ? 'bg-black text-white font-semibold'
                        : 'text-gray-600 hover:text-black hover:bg-gray-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {user && (
                  <>
                    <Link
                      href="/my-profile"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:text-black hover:bg-gray-50 transition-all"
                    >
                      <UserCircle className="w-4 h-4" /> My Profile
                    </Link>
                    <Link
                      href="/wishlist"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:text-rose-600 hover:bg-rose-50 transition-all"
                    >
                      <Heart className="w-4 h-4" /> My Wishlist
                      {wishlistCount > 0 && (
                        <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{wishlistCount}</span>
                      )}
                    </Link>
                    <button
                      onClick={() => { handleSignOut(); setMobileOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                )}
              </nav>
              {/* Social links */}
              <div className="border-t border-gray-100 pt-4 flex items-center justify-center gap-3">
                {socialNavItems.map(({ Icon, href, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 hover:text-black hover:bg-gray-100 transition-all"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>

              <div className="pt-1 text-xs text-gray-400 text-center">
                doodle_G · Frictionless Sentimentality
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
