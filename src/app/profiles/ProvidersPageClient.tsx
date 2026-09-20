'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, BadgeCheck, Star, UserCheck, MapPin, Layers, ShieldCheck, Users, Package, Plus } from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { providerProfileSlug } from '@/lib/seo';

// Decorative background — 20% opacity map graphic behind the whole page,
// sitting under a sky-blue → sunset-orange tint so it stays subtle and the
// provider cards on top stay readable.
const PROVIDERS_BG_IMAGE_URL =
  'https://img.magnific.com/premium-photo/beautiful-indian-map-location-pin_1156689-17182.jpg?semt=ais_hybrid&w=740&q=80';

interface ProviderLink {
  label: string;
  url: string;
}

interface Provider {
  id: string;
  // Pretty share-link handle (migration 011) — when set, profile links use
  // this instead of the raw UUID, e.g. /profiles/chemparathi.
  username?: string | null;
  name: string;
  bio?: string;
  // Longer "About Me" copy, and the small list of external links the
  // provider wants surfaced (portfolio, price list, booking page, etc) —
  // both come from the `providers.description` / `providers.internal_links`
  // columns added in migration 005. `bio` stays the short card teaser.
  description?: string;
  internal_links?: ProviderLink[];
  avatar_url?: string;
  specialty: string[];
  instagram_handle?: string | null;
  rating?: number;
  is_verified?: boolean;
  followers_count?: number;
  listings_count?: number;
}

export default function ProvidersPage({ initialProviders = [] }: { initialProviders?: Provider[] }) {
  const [providers, setProviders] = useState<Provider[]>(initialProviders);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const { cartCount, state } = useCart();
  const { user } = useAuth();
  const router = useRouter();

  // Provider IDs the signed-in user follows, plus a per-provider "request
  // in flight" set so double-clicks can't fire duplicate toggles.
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followPending, setFollowPending] = useState<Set<string>>(new Set());

  // Same pattern as the provider-list effect below: everything that can set
  // state runs only after an `await`, so nothing fires synchronously within
  // the effect body itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setFollowingIds(new Set());
        return;
      }
      try {
        const res = await fetch('/api/providers/follow');
        const data = await res.json();
        if (!cancelled) setFollowingIds(new Set<string>(data.following ?? []));
      } catch (err) {
        console.error('Error fetching followed providers:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleFollow = async (providerId: string) => {
    if (!user) {
      router.push('/auth');
      return;
    }
    if (followPending.has(providerId)) return;

    setFollowPending(prev => new Set(prev).add(providerId));
    // Optimistic update, reconciled with the server response below.
    const wasFollowing = followingIds.has(providerId);
    setFollowingIds(prev => {
      const next = new Set(prev);
      if (wasFollowing) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });

    try {
      const res = await fetch('/api/providers/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });

      // A 401 here means the session cookie was invalid/missing at the
      // server by the time this request arrived, even though the client
      // thought it had a signed-in user (e.g. the session expired, or a
      // mobile in-app browser dropped the cookie mid-session). Send them
      // to sign in with a clear reason instead of silently reverting the
      // button with no explanation.
      if (res.status === 401) {
        setFollowingIds(prev => {
          const next = new Set(prev);
          if (wasFollowing) next.add(providerId); else next.delete(providerId);
          return next;
        });
        router.push(`/auth?redirect=${encodeURIComponent('/profiles')}&reason=session_expired`);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update follow status');

      setFollowingIds(prev => {
        const next = new Set(prev);
        if (data.following) {
          next.add(providerId);
        } else {
          next.delete(providerId);
        }
        return next;
      });
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert the optimistic update on failure.
      setFollowingIds(prev => {
        const next = new Set(prev);
        if (wasFollowing) {
          next.add(providerId);
        } else {
          next.delete(providerId);
        }
        return next;
      });
    } finally {
      setFollowPending(prev => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  };

  const fetchProviders = async (query = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/providers?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.providers) {
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('Error fetching providers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial mount fetch is written inline (rather than calling the shared
  // fetchProviders helper above) so nothing sets state synchronously within
  // the effect body itself — `loading` already starts `true`, so all we
  // need here is to update state from the async response once it resolves.
  // fetchProviders (with its synchronous setLoading(true)) is reserved for
  // user-triggered refetches from the search form, which run from an event
  // handler rather than an effect.
  // When the server passes initialProviders (SSR), skip the client fetch —
  // provider cards are already in the HTML for crawlers. Only fetch
  // client-side as a fallback when no SSR data was provided.
  useEffect(() => {
    if (initialProviders.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/providers?q=');
        const data = await res.json();
        if (!cancelled && data.providers) {
           
          setProviders(data.providers);
        }
      } catch (err) {
        console.error('Error fetching providers:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialProviders]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProviders(searchQuery);
  };

  // Signature header data — a small "route" of real numbers pulled from the
  // loaded directory (not placeholder stats), plus the handful of specialty
  // tags that show up most often, offered as one-tap search shortcuts.
  const headerStats = useMemo(() => {
    const specialtySet = new Set<string>();
    let verifiedCount = 0;
    providers.forEach(p => {
      p.specialty.forEach(s => specialtySet.add(s));
      if (p.is_verified) verifiedCount += 1;
    });
    return {
      providerCount: providers.length,
      specialtyCount: specialtySet.size,
      verifiedCount,
    };
  }, [providers]);

  const topSpecialties = useMemo(() => {
    const counts = new Map<string, number>();
    providers.forEach(p => {
      p.specialty.forEach(s => counts.set(s, (counts.get(s) ?? 0) + 1));
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [providers]);

  const runSpecialtySearch = (tag: string) => {
    setSearchQuery(tag);
    fetchProviders(tag);
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-white overflow-hidden">
      {/* ── Decorative background: light-blue wash with the map graphic
          sitting at ~20% opacity underneath the page content. Fixed +
          pointer-events-none so it never interferes with layout or clicks;
          the provider grid below sits on white cards with a transparent border. */}
      <div className="fixed inset-0 -z-10 bg-sky-100" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-overlay"
          style={{ backgroundImage: `url('${PROVIDERS_BG_IMAGE_URL}')` }}
        />
        <div className="absolute inset-0 bg-sky-50/60" />
      </div>

      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="relative flex-1 max-w-7xl mx-auto px-4 md:px-8 py-10 w-full">
        {/* Header Section — clean badge, headline, real subtitle copy, and a
            row of compact stat pills (replacing the old dashed "route"
            strip, which read as cluttered/half-finished). */}
        <div className="max-w-2xl mx-auto text-center mb-8">
          {/* Stat pills — compact, self-contained badges rather than a
              dashed line joining loose numbers. */}
          <div className="flex items-center justify-center flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-150 shadow-sm px-3.5 py-2 rounded-full">
              <MapPin className="w-3.5 h-3.5 text-[#2f8fd6]" />
              {headerStats.providerCount} Providers
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-150 shadow-sm px-3.5 py-2 rounded-full">
              <Layers className="w-3.5 h-3.5 text-[#f78c3c]" />
              {headerStats.specialtyCount} Specialties
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 bg-white border border-gray-150 shadow-sm px-3.5 py-2 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {headerStats.verifiedCount} Verified
            </span>
          </div>
        </div>

        {/* Search Station — single pill combining the input and submit
            button, so it reads as one control instead of a boxy panel. */}
        <div className="max-w-lg mx-auto mb-10">
          <form onSubmit={handleSearchSubmit} className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name or specialty..."
              className="w-full bg-white border border-gray-200 shadow-sm rounded-full pl-11 pr-28 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-md transition-all"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-gray-900 text-white font-bold px-5 py-2.5 rounded-full text-xs tracking-wide hover:bg-black active:scale-95 transition-all shadow-sm hover:shadow-md"
            >
              Search
            </button>
          </form>

          {/* Quick-search chips — the specialties that actually show up most
              in the current directory, not a fixed placeholder list. */}
          {topSpecialties.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-0.5">Popular</span>
              {topSpecialties.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => runSpecialtySearch(tag)}
                  className="text-xs font-semibold bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full hover:border-[#2f8fd6]/50 hover:text-[#2f8fd6] transition-colors"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Grid List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-black" />
            <p className="text-sm text-gray-400">Loading gift providers...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border border-gray-100 max-w-lg mx-auto space-y-4">
            <span className="text-4xl">🏪</span>
            <h3 className="font-display text-lg font-semibold text-gray-900">No Providers Found</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto">
              We couldn&apos;t find providers matching &quot;{searchQuery}&quot;. Try a broader term like &quot;flowers&quot; or leave it blank to list everyone.
            </p>
            <button
              onClick={() => { setSearchQuery(''); fetchProviders(''); }}
              className="text-black text-xs font-semibold hover:underline"
            >
              Reset Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 pt-4">
            <AnimatePresence mode="popLayout">
              {providers.map((provider, i) => {
                const profileHref = `/profiles/${providerProfileSlug(provider)}`;
                return (
                  <motion.div
                    key={provider.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => router.push(profileHref)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') router.push(profileHref);
                    }}
                    className="relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group overflow-hidden cursor-pointer"
                  >
                    {/* Photo — compact portrait fill at the top of the card */}
                    <div className="relative w-full aspect-[4/5] bg-gray-100 overflow-hidden">
                      <Image
                        src={provider.avatar_url || 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80'}
                        alt={provider.name}
                        fill
                        unoptimized
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {typeof provider.rating === 'number' && (
                        <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-white bg-black/50 backdrop-blur px-2 py-0.5 rounded-full">
                          <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          {provider.rating.toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div className="p-3 space-y-1.5 text-left">
                      {/* Name + verified badge */}
                      <h4 className="font-display font-bold text-gray-900 leading-snug flex items-center gap-1 text-sm truncate">
                        <span className="truncate">{provider.name}</span>
                        {provider.is_verified && (
                          <BadgeCheck className="w-3.5 h-3.5 text-white fill-sky-500 shrink-0" aria-label="Verified provider" />
                        )}
                      </h4>

                      {/* Bio — sits right under the name */}
                      {(provider.description || provider.bio) && (
                        <p className="text-xs text-gray-500 leading-snug line-clamp-2">
                          {provider.description || provider.bio}
                        </p>
                      )}

                      {/* Specialty tags — one, so the card stays compact */}
                      {provider.specialty.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {provider.specialty.slice(0, 2).map(tag => (
                            <span
                              key={tag}
                              className="text-[9px] font-semibold bg-gray-50 border border-gray-200 text-gray-700 px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Stats row + Follow button */}
                      <div className="flex items-center justify-between pt-1.5">
                        <div className="flex items-center gap-2.5 text-[11px] text-gray-600">
                          <span className="flex items-center gap-1" title="Followers">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-semibold">{provider.followers_count ?? 0}</span>
                          </span>
                          <span className="flex items-center gap-1" title="Listings">
                            <Package className="w-3.5 h-3.5 text-gray-400" />
                            <span className="font-semibold">{provider.listings_count ?? 0}</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            toggleFollow(provider.id);
                          }}
                          disabled={followPending.has(provider.id)}
                          aria-pressed={followingIds.has(provider.id)}
                          className={
                            followingIds.has(provider.id)
                              ? 'inline-flex items-center gap-0.5 text-[10px] font-bold pl-2.5 pr-2 py-1.5 rounded-full border border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-all disabled:opacity-60 shrink-0'
                              : 'inline-flex items-center gap-0.5 text-[10px] font-bold pl-2.5 pr-2 py-1.5 rounded-full text-white bg-gray-900 hover:bg-black transition-all disabled:opacity-60 shrink-0'
                          }
                        >
                          {followPending.has(provider.id) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : followingIds.has(provider.id) ? (
                            <>
                              Following
                              <UserCheck className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              Follow
                              <Plus className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
}
