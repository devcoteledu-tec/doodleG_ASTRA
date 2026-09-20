'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BadgeCheck, Star, Share2, Link2, Sparkles, Loader2, Package,
  ArrowUpRight, Send, Camera, ShoppingBag, Layers, Palette, Film, Gift,
  Flower2, Hammer, Cake, Candy, Grid3x3, MoreHorizontal, Briefcase,
  MapPin, CalendarDays, UserCheck, Search, X,
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { mapProductBoxRow, ProductBoxRow, Product } from '@/lib/products';
import { providerProfileSlug } from '@/lib/seo';
import ReelsShowcase from '@/components/ReelsShowcase';

// lucide-react dropped brand/social glyphs, so X + WhatsApp marks are small
// inline SVGs here rather than imports (matches src/app/profiles/page.tsx).

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.81-.11-.42-.13-.95-.31-1.65-.6-2.9-1.25-4.79-4.17-4.94-4.36-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.26-.28.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.64.49.24.57.81 1.98.88 2.12.07.15.12.32.02.51-.1.2-.15.32-.29.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.03 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.76-.89.96-1.19.2-.3.4-.25.68-.15.28.1 1.78.84 2.08 1 .3.15.5.22.57.35.08.13.08.75-.16 1.43z" />
    </svg>
  );
}

interface ProviderLink {
  label: string;
  url: string;
}

interface Provider {
  id: string;
  name: string;
  bio?: string;
  description?: string;
  internal_links?: ProviderLink[];
  avatar_url?: string;
  specialty: string[];
  instagram_handle?: string | null;
  rating?: number;
  is_verified?: boolean;
  // New profile-template fields (see supabase_migration_011).
  username?: string | null;
  cover_url?: string | null;
  title?: string | null;
  location?: string | null;
  website_url?: string | null;
  founded_date?: string | null;
  created_at?: string;
  followers_count?: number;
  // providers.reels: up to 6 { url, thumbnail?, caption?, posted_at? } (Instagram reel or direct .mp4/.webm link).
  // instagram_reels is the older plain-URL column, kept as a fallback.
  reels?: unknown[] | null;
  instagram_reels?: string[] | null;
}

// Small, deterministic icon + accent per specialty tag so the "What I Do"
// boxes feel designed rather than generated — falls back to a generic gift
// icon/amber accent for tags outside this list.
const SPECIALTY_STYLES: Record<string, { icon: React.ElementType; accent: string }> = {
  flowers: { icon: Flower2, accent: 'from-rose-400 to-pink-500' },
  bouquets: { icon: Flower2, accent: 'from-rose-400 to-pink-500' },
  woodwork: { icon: Hammer, accent: 'from-amber-600 to-orange-700' },
  engraving: { icon: Layers, accent: 'from-amber-500 to-yellow-600' },
  home: { icon: Gift, accent: 'from-teal-400 to-emerald-500' },
  bakery: { icon: Cake, accent: 'from-fuchsia-400 to-pink-500' },
  desserts: { icon: Candy, accent: 'from-fuchsia-400 to-purple-500' },
  candles: { icon: Sparkles, accent: 'from-orange-400 to-amber-500' },
  wellness: { icon: Sparkles, accent: 'from-emerald-400 to-teal-500' },
  illustration: { icon: Palette, accent: 'from-indigo-400 to-blue-500' },
  design: { icon: Grid3x3, accent: 'from-sky-400 to-cyan-500' },
  motion: { icon: Film, accent: 'from-violet-400 to-indigo-500' },
};

function specialtyStyle(tag: string) {
  return SPECIALTY_STYLES[tag.toLowerCase()] || { icon: Gift, accent: 'from-amber-400 to-orange-500' };
}

export default function ProviderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  // The route segment is really "identifier" — it can be the provider's
  // raw UUID (old share links) or their username handle (new pretty share
  // links, e.g. /profiles/chemparathi). /api/providers/[id] resolves
  // either form to the actual provider row; once `provider` has loaded,
  // follow/unfollow calls below use provider.id (the real UUID), never
  // this route param, since `follows.provider_id` is a UUID column.
  const { id: identifier } = use(params);
  const { cartCount, state } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'about'>('products');
  const [productSearch, setProductSearch] = useState('');
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Follow state — same pattern as the /profiles directory list
  // (src/app/profiles/page.tsx): optimistic toggle reconciled with the
  // server response, single in-flight guard against double-clicks.
  const [isFollowing, setIsFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !provider) {
        if (!cancelled) setIsFollowing(false);
        return;
      }
      try {
        const res = await fetch('/api/providers/follow');
        const data = await res.json();
        if (!cancelled) setIsFollowing((data.following ?? []).includes(provider.id));
      } catch (err) {
        console.error('Error fetching follow status:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- provider?.id is the intentional narrow dep; re-running on the full object would fire on every render
  }, [user, provider?.id]);

  const toggleFollow = async () => {
    if (!user) {
      router.push('/auth');
      return;
    }
    if (followPending || !provider) return;

    setFollowPending(true);
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);

    try {
      const res = await fetch('/api/providers/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: provider.id }),
      });

      // See ProvidersPageClient.tsx for why this needs its own branch: a
      // redirect here (instead of a clean 401) would make fetch() follow
      // it to the /auth HTML page and crash on res.json(), silently
      // reverting the button with no explanation to the user.
      if (res.status === 401) {
        setIsFollowing(wasFollowing);
        router.push(`/auth?redirect=${encodeURIComponent(`/profiles/${identifier}`)}&reason=session_expired`);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update follow status');
      setIsFollowing(!!data.following);
      setProvider(prev => prev
        ? { ...prev, followers_count: (prev.followers_count ?? 0) + (data.following ? 1 : -1) }
        : prev);
    } catch (err) {
      console.error('Error toggling follow:', err);
      setIsFollowing(wasFollowing);
    } finally {
      setFollowPending(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/providers/${identifier}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setProvider(data.provider ?? null);
          setProducts((data.products ?? []).map((p: ProductBoxRow) => mapProductBoxRow(p)));
        }
      } catch (err) {
        console.error('Error fetching provider profile:', err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [identifier]);

  // Clicking a "What I Do" box filters this provider's own products down to
  // ones that plausibly match that specialty tag (category or name match).
  // If nothing matches, we don't leave the person staring at an empty grid —
  // we fall back to showing everything with a short note instead.
  const specialtyFilteredProducts = useMemo(() => {
    if (!activeSpecialty) return products;
    const tag = activeSpecialty.toLowerCase();
    const matches = products.filter(p =>
      p.category.toLowerCase().includes(tag) ||
      tag.includes(p.category.toLowerCase()) ||
      p.name.toLowerCase().includes(tag)
    );
    return matches.length > 0 ? matches : products;
  }, [products, activeSpecialty]);

  const noExactMatch = !!activeSpecialty && specialtyFilteredProducts.length === products.length && products.length > 0 &&
    !products.some(p => p.category.toLowerCase().includes(activeSpecialty.toLowerCase()) || p.name.toLowerCase().includes(activeSpecialty.toLowerCase()));

  // Free-text search on top of whatever the specialty filter already narrowed
  // down to, so the two filters compose rather than override each other.
  const searchTerm = productSearch.trim().toLowerCase();
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return specialtyFilteredProducts;
    return specialtyFilteredProducts.filter(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      p.category.toLowerCase().includes(searchTerm)
    );
  }, [specialtyFilteredProducts, searchTerm]);

  const noSearchMatch = !!searchTerm && filteredProducts.length === 0 && specialtyFilteredProducts.length > 0;

  // Prefer the pretty username slug for the share link once the provider
  // has loaded — but only if it's actually a valid single-segment URL
  // slug (see providerProfileSlug in @/lib/seo): a stray "/" or space in
  // the DB value would otherwise turn /profiles/[id] into a 404. Falls
  // back to whatever identifier brought us here (UUID or username) so
  // there's still a usable link during the initial load.
  const shareSlug = provider ? providerProfileSlug(provider) : identifier;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/profiles/${shareSlug}` : `/profiles/${shareSlug}`;
  const shareText = provider ? `Check out ${provider.name} on doodle_G ✨` : 'Check out this gift provider on doodle_G ✨';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — link is still visible in the address bar.
    }
  };
  const handleWhatsAppShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
    setShowShareMenu(false);
  };
  const handleXShare = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer');
    setShowShareMenu(false);
  };
  const handleTelegramShare = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
    setShowShareMenu(false);
  };
  const handleInstagramShare = async () => {
    // Instagram has no web share intent for arbitrary links — copy the link
    // so the person can paste it into a DM, Story, or bio themselves.
    await handleCopyLink();
  };
  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: provider?.name, text: shareText, url: shareUrl });
        setShowShareMenu(false);
      } catch {
        // Person dismissed the native share sheet — no action needed.
      }
    }
  };

  const igUrl = provider?.instagram_handle ? `https://instagram.com/${provider.instagram_handle.replace(/^@/, '')}` : null;

  const formatMonthYear = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
  const formatFullDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const displayWebsite = (url?: string | null) =>
    url ? url.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  // Providers sometimes save their website without a protocol (e.g.
  // "mystore.com"). Without one, the browser treats the href as a relative
  // path (like "/profiles/mystore.com") instead of opening the real site —
  // so make sure a scheme is always present before it's used as a link.
  const normalizeWebsiteUrl = (url?: string | null) => {
    if (!url) return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-32">
          <Loader2 className="w-8 h-8 animate-spin text-black" />
          <p className="text-sm text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (notFound || !provider) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-32 text-center px-4">
          <span className="text-4xl">🏪</span>
          <h1 className="font-display text-xl font-semibold text-gray-900">Provider Not Found</h1>
          <p className="text-sm text-gray-500 max-w-xs">We couldn&apos;t find that profile. It may have been removed.</p>
          <Link href="/profiles" className="text-sm font-semibold text-black hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Providers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* Top bar — back arrow, name + badge, product count                */}
        {/* ---------------------------------------------------------------- */}
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100">
          <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center gap-4">
            <Link href="/profiles" className="text-gray-700 hover:text-black transition-colors shrink-0" aria-label="Back to providers">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 leading-tight flex items-center gap-1 truncate">
                {provider.name}
                {provider.is_verified && <BadgeCheck className="w-4 h-4 text-white fill-sky-500 shrink-0" aria-label="Verified provider" />}
              </h1>
              <p className="text-xs text-gray-500">{products.length} product{products.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          {/* -------------------------------------------------------------- */}
          {/* Banner + avatar                                                 */}
          {/* -------------------------------------------------------------- */}
          <div className="relative">
            <div className="relative w-full h-40 sm:h-52 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200 overflow-hidden">
              {provider.cover_url && (
                <Image
                  src={provider.cover_url}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                />
              )}
            </div>
            <div className="absolute -bottom-12 left-4 sm:left-6 w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
              <Image
                src={provider.avatar_url || 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80'}
                alt={provider.name}
                width={112}
                height={112}
                unoptimized
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Actions — more menu, message, Follow                            */}
          {/* -------------------------------------------------------------- */}
          <div className="px-4 sm:px-6 pt-3 flex items-center justify-end gap-2">
            <div className="relative">
              <button
                onClick={() => setShowShareMenu(s => !s)}
                aria-label="More actions"
                className="w-9 h-9 rounded-full border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showShareMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowShareMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-20 text-left"
                    >
                      <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Share Profile</p>
                      <button onClick={handleWhatsAppShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                        <span className="w-8 h-8 rounded-full bg-green-50 border border-green-100 flex items-center justify-center text-green-600">
                          <WhatsAppIcon className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-medium text-gray-800">WhatsApp</span>
                      </button>
                      <button onClick={handleXShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                        <span className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-900">
                          <XIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className="text-sm font-medium text-gray-800">X (Twitter)</span>
                      </button>
                      <button onClick={handleTelegramShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                        <span className="w-8 h-8 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                          <Send className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-medium text-gray-800">Telegram</span>
                      </button>
                      <button onClick={handleInstagramShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                        <span className="w-8 h-8 rounded-full bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600">
                          <Camera className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-medium text-gray-800">{linkCopied ? 'Link copied!' : 'Instagram'}</span>
                      </button>
                      {typeof navigator !== 'undefined' && !!navigator.share && (
                        <button onClick={handleNativeShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                          <span className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600">
                            <Share2 className="w-4 h-4" />
                          </span>
                          <span className="text-sm font-medium text-gray-800">More apps…</span>
                        </button>
                      )}
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={handleCopyLink} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-all text-left">
                        <span className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-600">
                          <Link2 className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-medium text-gray-800">{linkCopied ? 'Copied!' : 'Copy link'}</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {igUrl && (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on Instagram"
                className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- external URL, not in remotePatterns */}
                <img src="https://png.pngtree.com/element_our/sm/20180509/sm_5af2b7f45ec78.jpg" alt="Instagram" className="w-7 h-7 rounded-full object-cover" />
              </a>
            )}

            <button
              type="button"
              onClick={toggleFollow}
              disabled={followPending}
              aria-pressed={isFollowing}
              className={
                isFollowing
                  ? 'inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 transition-all disabled:opacity-60'
                  : 'inline-flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-full text-white bg-gray-900 hover:bg-black transition-all disabled:opacity-60'
              }
            >
              {followPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isFollowing ? (
                <UserCheck className="w-3.5 h-3.5" />
              ) : null}
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Name, handle, bio, meta row, joined date, stats                 */}
          {/* -------------------------------------------------------------- */}
          <div className="px-4 sm:px-6 pt-3 pb-4 space-y-3">
            <div>
              <h2 className="font-display text-xl font-bold text-gray-900 flex items-center gap-1.5">
                {provider.name}
                {provider.is_verified && <BadgeCheck className="w-5 h-5 text-white fill-sky-500 shrink-0" aria-label="Verified provider" />}
              </h2>
              {provider.username && <p className="text-sm text-gray-500">@{provider.username}</p>}
            </div>

            {(provider.bio || provider.description) && (
              <p className="text-sm text-gray-900 leading-relaxed">{provider.bio || provider.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-500">
              {provider.title && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-gray-400" /> {provider.title}
                </span>
              )}
              {provider.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400" /> {provider.location}
                </span>
              )}
              {provider.website_url && (
                <span className="flex items-center gap-1.5">
                  <Link2 className="w-4 h-4 text-gray-400" />
                  <a
                    href={normalizeWebsiteUrl(provider.website_url) || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline"
                  >
                    {displayWebsite(provider.website_url)}
                  </a>
                </span>
              )}
              {provider.founded_date && (
                <span className="flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-gray-400" /> Founded {formatFullDate(provider.founded_date)}
                </span>
              )}
            </div>

            {provider.created_at && (
              <p className="flex items-center gap-1.5 text-sm text-gray-500">
                <CalendarDays className="w-4 h-4 text-gray-400" /> Joined {formatMonthYear(provider.created_at)}
              </p>
            )}

            <div className="flex items-center gap-4 text-sm pt-1">
              <span className="text-gray-900"><span className="font-bold">{products.length}</span> <span className="text-gray-500">Products</span></span>
              <span className="text-gray-900"><span className="font-bold">{provider.followers_count ?? 0}</span> <span className="text-gray-500">Followers</span></span>
              {typeof provider.rating === 'number' && (
                <span className="flex items-center gap-1 text-gray-900">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="font-bold">{provider.rating.toFixed(1)}</span> <span className="text-gray-500">Rating</span>
                </span>
              )}
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Tabs — Products (default) / About                               */}
          {/* -------------------------------------------------------------- */}
          <div className="border-b border-gray-100 px-4 sm:px-6">
            <nav className="flex gap-6" role="tablist">
              {([
                { key: 'products', label: 'Products' },
                { key: 'about', label: 'About' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative py-3 text-sm transition-colors ${
                    activeTab === tab.key ? 'font-bold text-gray-900' : 'font-medium text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute left-0 right-0 -bottom-px h-[3px] rounded-full bg-gray-900" aria-hidden="true" />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-12">
          {activeTab === 'about' ? (
            <>
              {/* -------------------------------------------------------------- */}
              {/* What I Do — clickable specialty boxes                          */}
              {/* -------------------------------------------------------------- */}
              {provider.specialty.length > 0 && (
                <section>
                  <div className="mb-6 space-y-1">
                    <h2 className="font-display text-xl font-bold text-gray-900">What I Do</h2>
                    <p className="text-xs text-gray-400">Tap a specialty to see the products {provider.name.split(' ')[0]} makes in that category, over on the Products tab.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {provider.specialty.map(tag => {
                      const { icon: Icon, accent } = specialtyStyle(tag);
                      const isActive = activeSpecialty === tag;
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setActiveSpecialty(isActive ? null : tag);
                            setActiveTab('products');
                          }}
                          className={`text-left rounded-2xl p-5 border transition-all group ${
                            isActive
                              ? 'bg-gray-900 border-gray-900 shadow-lg scale-[1.02]'
                              : 'bg-white border-gray-100 hover:border-gray-300 hover:shadow-md'
                          }`}
                        >
                          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center mb-4 shadow-sm`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <h3 className={`font-display font-bold capitalize mb-1 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                            {tag}
                          </h3>
                          <p className={`text-xs leading-relaxed ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                            {`See what ${provider.name.split(' ')[0]} offers in ${tag}.`}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* -------------------------------------------------------------- */}
              {/* About Me                                                       */}
              {/* -------------------------------------------------------------- */}
              {(provider.description || provider.bio) && (
                <section className="space-y-3">
                  <h2 className="font-display text-xl font-bold text-gray-900">About Me</h2>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {provider.description || provider.bio}
                  </p>
                </section>
              )}

              {/* -------------------------------------------------------------- */}
              {/* Internal links (portfolio, price list, booking page, etc.)      */}
              {/* -------------------------------------------------------------- */}
              {!!provider.internal_links?.length && (
                <section>
                  <div className="flex flex-wrap gap-3">
                    {provider.internal_links.map(link => (
                      <a
                        key={link.label}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 text-gray-800 text-sm font-semibold hover:border-black hover:bg-gray-50 transition-all"
                      >
                        <Link2 className="w-4 h-4 text-amber-600" /> {link.label} <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            /* -------------------------------------------------------------- */
            /* Products grid — filtered by the clicked specialty box, this     */
            /* provider's own products only (products_box.provider_id = id)    */
            /* -------------------------------------------------------------- */
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <h2 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" /> Products by {provider.name}
                </h2>
                {activeSpecialty && (
                  <button
                    onClick={() => setActiveSpecialty(null)}
                    className="self-start sm:self-auto text-xs font-semibold text-gray-500 hover:text-black flex items-center gap-1"
                  >
                    Showing: <span className="capitalize text-gray-900">#{activeSpecialty}</span> · Clear filter
                  </button>
                )}
              </div>

              {products.length > 0 && (
                <div className="relative mb-5">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder={`Search ${provider.name}'s products...`}
                    className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                  />
                  {productSearch && (
                    <button
                      onClick={() => setProductSearch('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {noExactMatch && !searchTerm && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-5">
                  No products are tagged specifically as &quot;{activeSpecialty}&quot; yet — showing everything from {provider.name} instead.
                </p>
              )}

              {products.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-3xl border border-gray-100 space-y-3">
                  <Package className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">This provider hasn&apos;t listed any products yet.</p>
                </div>
              ) : noSearchMatch ? (
                <div className="text-center py-16 bg-gray-50 rounded-3xl border border-gray-100 space-y-3">
                  <Search className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">
                    No products match &quot;{productSearch.trim()}&quot;.
                  </p>
                  <button
                    onClick={() => setProductSearch('')}
                    className="text-xs font-semibold text-gray-700 hover:text-black underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {filteredProducts.map(product => (
                    <Link
                      key={product.id}
                      href={`/shop/${product.slug || product.id}`}
                      className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all"
                    >
                      <div className={`aspect-square bg-gradient-to-br ${product.gradient} flex items-center justify-center relative overflow-hidden`}>
                        {product.images?.[0] ? (
                          <Image
                            src={product.images[0]}
                            alt={product.name}
                            fill
                            unoptimized
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <span className="text-4xl">{product.emoji}</span>
                        )}
                        {typeof product.discount === 'number' && product.discount > 0 && (
                          <span className="absolute top-2 left-2 inline-flex items-center text-[10px] font-bold text-white bg-red-600 px-2 py-0.5 rounded-full shadow-sm">
                            {product.discount}% OFF
                          </span>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="text-xs font-semibold text-gray-900 line-clamp-1">{product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-gray-900">₹{product.price}</span>
                          {typeof product.originalPrice === 'number' && product.originalPrice > product.price && (
                            <span className="text-[11px] text-gray-400 line-through">₹{product.originalPrice}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          {typeof product.discount === 'number' && product.discount > 0 ? (
                            <span className="text-[10px] font-bold text-red-600">Save {product.discount}%</span>
                          ) : (
                            <span />
                          )}
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {product.rating.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Reels — shown below the products box on the Products tab. */}
          {activeTab === 'products' && (
            <ReelsShowcase
              reels={provider.reels?.length ? provider.reels : provider.instagram_reels}
              providerName={provider.name}
              providerAvatarUrl={provider.avatar_url}
              verified={provider.is_verified}
              instagramHandle={provider.instagram_handle}
            />
          )}
        </div>
      </main>

      <ShopFooter />
    </div>
  );
}
