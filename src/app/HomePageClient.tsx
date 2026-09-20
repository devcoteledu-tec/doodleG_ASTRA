'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  ChevronLeft, ChevronRight,
  Truck, Headphones, Shield
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import HomeMobileFeed from '@/components/HomeMobileFeed';
import { useCart } from '@/lib/CartContext';
import { Product } from '@/lib/products';

/* ── Badge Pill ── */
function BadgePill({ badge, discount }: { badge?: string; discount?: number }) {
  if (!badge) return null;
  const styles: Record<string, string> = {
    NEW:     'bg-emerald-50  text-emerald-700  border-emerald-200',
    HOT:     'bg-red-50      text-red-600      border-red-200',
    SALE:    'bg-black/5     text-black        border-black/20',
    LIMITED: 'bg-purple-50   text-purple-700   border-purple-200',
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-widest uppercase ${styles[badge] || ''}`}>
      {badge === 'SALE' && discount ? `-${discount}%` : badge}
    </span>
  );
}

/* ── Shop-by-Category showcase ──────────────────────────────────
   A row of borderless, white "tiles" — one per product category —
   each holding up to a 3×3 grid of that category's product photos,
   scrollable horizontally via the left/right arrows. */
const SHOWCASE_CATEGORIES: { label: string; match: string[] }[] = [
  { label: 'Flowers',      match: ['flower'] },
  { label: 'Hampers',      match: ['hamper'] },
  { label: 'Frames',       match: ['frame'] },
  { label: 'Jewelry',      match: ['jewel', 'jewellery'] },
  { label: 'Tech',         match: ['tech', 'tec', 'gizmo', 'electronic'] },
  { label: 'Wellness',     match: ['wellness', 'health'] },
  { label: 'Photography',  match: ['photo'] },
  { label: 'Foods',        match: ['food', 'culinary', 'cake', 'chocolate'] },
  { label: 'Candles',      match: ['candle'] },
  { label: 'Gadgets',      match: ['gadget'] },
  { label: 'Personalized', match: ['personal'] },
];

interface CategoryShowcaseGroup {
  label: string;
  categoryValue: string;
  products: Product[];
}

function CategoryShowcaseTile({ group }: { group: CategoryShowcaseGroup }) {
  const tiles = Array.from({ length: 9 }, (_, i) => group.products[i]);
  return (
    <div data-showcase-tile className="snap-start flex-shrink-0 w-[78vw] max-w-[300px] sm:w-[320px] sm:max-w-none md:w-[360px] lg:w-[420px] xl:w-[460px] rounded-2xl sm:rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300 p-4 sm:p-5 md:p-6 group">
      <Link
        href={`/shop?category=${encodeURIComponent(group.categoryValue)}`}
        className="font-display font-bold text-gray-900 text-base sm:text-lg mb-3 sm:mb-4 flex items-center justify-between"
      >
        {group.label}
        <span className="text-xs font-semibold text-gray-400 group-hover:text-black transition-colors">
          See more →
        </span>
      </Link>
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        {tiles.map((p, i) => (
          <div
            key={p?.id ?? i}
            className="relative aspect-square rounded-lg overflow-hidden bg-gray-50"
          >
            {p ? (
              <Link
                href={`/shop/${p.slug || p.id}`}
                aria-label={p.name}
                className="absolute inset-0 block"
              >
                {p.images?.[0] ? (
                  <Image
                    src={p.images[0]}
                    alt={p.name}
                    fill
                    unoptimized
                    className="object-cover hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl">{p.emoji}</div>
                )}
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryShowcase({ groups }: { groups: CategoryShowcaseGroup[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (groups.length === 0) return null;

  const scrollByCard = (dir: number) => {
    const card = scrollRef.current?.querySelector('[data-showcase-tile]') as HTMLElement | null;
    const step = card ? card.offsetWidth + 24 : 320;
    scrollRef.current?.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <section id="categories" className="bg-white py-8 sm:py-10 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-black rounded-full" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Shop by</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-gray-900">Category</h2>
          </div>
          <div className="hidden sm:flex gap-1">
            <button
              onClick={() => scrollByCard(-1)}
              aria-label="Scroll categories left"
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollByCard(1)}
              aria-label="Scroll categories right"
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-4 sm:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 no-scrollbar"
        >
          {groups.map(group => (
            <CategoryShowcaseTile key={group.label} group={group} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function ShopPage({ initialProducts = [] }: { initialProducts?: Product[] }) {
  const [productsList, setProductsList] = useState<Product[]>(initialProducts);
  const [, setActiveTab]       = useState('All Products');
  const [, setSelectedCategory] = useState('all');
  const { cartCount, state } = useCart();

  // When the server passes initialProducts (SSR), skip the client fetch —
  // products are already in the HTML for crawlers. Only fetch client-side
  // as a fallback when no SSR data was provided (e.g. client-side nav).
  useEffect(() => {
    if (initialProducts.length > 0) return; // SSR data already present
    async function fetchProducts() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.products && data.products.length > 0) {
          interface ShopProductRow {
            id: string;
            slug?: string | null;
            product_name: string;
            price_in_rupees: number | string;
            saving_percentage?: number | string | null;
            star_count?: number | string | null;
            total_reviews?: number | string | null;
            category: string;
            status?: Product['badge'] | null;
            product_description?: string | null;
            shipping_and_products?: string | null;
            available_qty?: number | string | null;
            total_likes?: number | string | null;
            emoji?: string | null;
            gradient?: string | null;
            product_images?: string[] | null;
          }
          const mapped = (data.products as ShopProductRow[]).map((p) => ({
            id: p.id,
            slug: p.slug ?? undefined,
            name: p.product_name,
            price: Number(p.price_in_rupees),
            originalPrice: Number(p.saving_percentage) > 0 
              ? Math.round(Number(p.price_in_rupees) / (1 - Number(p.saving_percentage) / 100))
              : undefined,
            rating: Number(p.star_count),
            reviews: Number(p.total_reviews),
            category: p.category,
            subcategory: 'Premium Gift',
            badge: p.status ?? undefined,
            discount: Number(p.saving_percentage) > 0 ? Number(p.saving_percentage) : undefined,
            colors: ['#0a0a0a', '#6b7280', '#e85d4a'],
            description: p.product_description || '',
            details: [
              p.shipping_and_products || 'Free express delivery',
              'Min 3 high-res photos included',
              `${p.available_qty} items left in stock`,
              `Total Likes: ${p.total_likes}`
            ],
            emoji: p.emoji || '🎁',
            gradient: p.gradient || 'from-gray-700 to-black',
            images: p.product_images ?? undefined,
          }));
           
          setProductsList(mapped);
        } else {
           
          setProductsList([]);
        }
      } catch (err) {
        console.error('Error loading Supabase products:', err);
         
        setProductsList([]);
      }
    }
    fetchProducts();
  }, [initialProducts]);

  // Deep-link support: /shop?category=Cakes (used by the homepage's emoji
  // scroller and the pink/blue/green category cards) pre-selects a category
  // and scrolls straight to the category pills. Read via window.location
  // instead of useSearchParams so this client page never needs a Suspense
  // boundary just to support an optional query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    if (cat) {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only URL param read; no cascade risk
      setSelectedCategory(cat);
       
      setActiveTab('All Products');
      requestAnimationFrame(() => {
        document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  const displayPrice = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  const newArrivalsList = useMemo(() => productsList.filter(p => p.badge === 'NEW'), [productsList]);

  // Group live products into the "Shop by Category" showcase tiles —
  // one tile per category, holding up to 9 of that category's product
  // images, and only shown when the database actually has matches.
  const categoryShowcaseGroups = useMemo<CategoryShowcaseGroup[]>(() => {
    return SHOWCASE_CATEGORIES.map(cat => {
      const matched = productsList.filter(p =>
        cat.match.some(m => p.category?.toLowerCase().includes(m))
      );
      return {
        label: cat.label,
        categoryValue: matched[0]?.category ?? cat.label,
        products: matched.slice(0, 9),
      };
    }).filter(group => group.products.length > 0);
  }, [productsList]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      {/* ════════════ HOME FEED (doodle_G, Uber-app-styled) ════════════ */}
      <HomeMobileFeed productsList={productsList} />

      {/* ════════════ SHOP BY CATEGORY ════════════ */}
      <CategoryShowcase groups={categoryShowcaseGroups} />

      {/* ════════════ LOOKING FOR BUSINESS SOLUTIONS ════════════ */}
      <section className="bg-black">
        <div className="max-w-md md:max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center">
            <div className="space-y-4 md:space-y-5">
              <h2 className="text-white font-bold text-xl md:text-3xl leading-snug">
                Looking for business solutions?
              </h2>
              <p className="text-white/70 text-xs md:text-sm max-w-sm">
                Get information about how companies leverage doodle_G for business.
              </p>
              <ul className="space-y-2.5">
                {[
                  { label: 'Providers', href: '/profiles' },
                  { label: 'Add your profile', href: 'mailto:support@doodleg.in' },
                  { label: 'Terms and conditions', href: '/legal/terms' },
                  { label: 'Delivery', href: '/support?tab=shipping' },
                ].map(item => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="flex items-center gap-2.5 text-white text-xs md:text-sm font-medium hover:underline w-fit"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-300 flex-shrink-0" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href="mailto:support@doodleg.in"
                  className="bg-white text-black font-semibold px-5 py-2.5 md:px-6 md:py-3 rounded-xl hover:bg-white/90 transition-colors text-xs md:text-sm"
                >
                  Get started
                </a>
                <Link
                  href="/support"
                  className="border border-white/30 text-white font-semibold px-5 py-2.5 md:px-6 md:py-3 rounded-xl hover:bg-white/10 transition-colors text-xs md:text-sm"
                >
                  Check out our solutions
                </Link>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden h-48 sm:h-64 md:h-80">
              <Image
                src="https://i.pinimg.com/originals/e6/4e/3a/e64e3a90bed85a0b2b59d155b5c84e1c.gif"
                alt="Business solutions"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ HOW CAN I HELP YOU — yellow WhatsApp CTA band ════════════ */}
      <section className="bg-yellow-400">
        <div className="max-w-md md:max-w-7xl mx-auto px-4 md:px-8 py-10 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center">
            <div className="space-y-4 md:space-y-5 text-center md:text-left">
              <h2 className="text-black font-extrabold text-xl md:text-3xl leading-snug">
                HOW CAN I HELP YOU ?
              </h2>
              <div>
                <a
                  href="https://wa.me/917593038781"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-black text-white font-semibold px-6 py-2.5 md:px-8 md:py-3 rounded-xl hover:bg-gray-900 transition-colors text-xs md:text-sm"
                >
                  Connect now
                </a>
              </div>
            </div>

            <div className="relative h-56 sm:h-72 md:h-80 mx-auto w-full max-w-xs md:max-w-sm">
              <Image
                src="https://cdn.displate.com/artwork/270x380/2024-11-09/0ae1be21-6ed8-4f81-8680-b179fb3c747a.jpg"
                alt="How can I help you"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ TRUST / BENEFITS STRIP ════════════ */}
      <section className="bg-white py-8 md:py-14 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="flex flex-col items-center gap-2 md:gap-4">
              <div className="w-10 h-10 sm:w-16 sm:h-16 bg-black border-[4px] sm:border-[8px] border-gray-200 rounded-full flex items-center justify-center text-white shadow-sm">
                <Truck className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <h4 className="text-[10px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider leading-tight">Free and Fast Delivery</h4>
                <p className="text-[9px] sm:text-xs text-gray-500">Free delivery for all orders over ₹1,500</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col items-center gap-2 md:gap-4">
              <div className="w-10 h-10 sm:w-16 sm:h-16 bg-black border-[4px] sm:border-[8px] border-gray-200 rounded-full flex items-center justify-center text-white shadow-sm">
                <Headphones className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <h4 className="text-[10px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider leading-tight">24/7 Customer Service</h4>
                <p className="text-[9px] sm:text-xs text-gray-500">Friendly 24/7 customer support</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col items-center gap-2 md:gap-4">
              <div className="w-10 h-10 sm:w-16 sm:h-16 bg-black border-[4px] sm:border-[8px] border-gray-200 rounded-full flex items-center justify-center text-white shadow-sm">
                <Shield className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <h4 className="text-[10px] sm:text-sm font-bold text-gray-900 uppercase tracking-wider leading-tight">Money Back Guarantee</h4>
                <p className="text-[9px] sm:text-xs text-gray-500">We return money within 30 days</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ NEW ARRIVALS BANNER ════════════ */}
      <section className="bg-gray-50 border-t border-gray-100 py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Wide promo card */}
            <div className="md:col-span-2 bg-black rounded-2xl p-8 flex items-center justify-between overflow-hidden relative">
              <div className="space-y-3 z-10">
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">New Arrival</span>
                <h3 className="font-display text-3xl font-bold text-white">
                  {newArrivalsList[0]?.name || 'Fresh Picks'}
                </h3>
                <p className="text-sm text-white/60 max-w-xs">
                  {(() => {
                    const desc = newArrivalsList[0]?.description || 'Handmade gifts curated just for you.';
                    const words = desc.split(/\s+/).slice(0, 15);
                    return words.join(' ') + (desc.split(/\s+/).length > 15 ? '…' : '');
                  })()}
                </p>
                <Link
                  href={newArrivalsList[0] ? `/shop/${newArrivalsList[0].slug || newArrivalsList[0].id}` : '/shop'}
                  className="inline-flex items-center gap-2 text-sm text-white font-semibold hover:underline"
                >
                  Shop Now <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="text-8xl z-10 opacity-90">{newArrivalsList[0]?.emoji || '🎁'}</div>
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
            </div>

            {/* Stack of new arrivals */}
            <div className="space-y-4">
              {newArrivalsList.slice(0, 2).map(p => (
                <Link key={p.id} href={`/shop/${p.slug || p.id}`}>
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:border-black/20 flex items-center gap-4 transition-all group shadow-sm hover:shadow-md">
                    <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden text-3xl flex-shrink-0">
                      {p.images && p.images[0] ? (
                        <Image
                          src={p.images[0]}
                          alt={p.name}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        p.emoji
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 group-hover:text-black transition-colors">
                        {p.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-black font-bold text-sm">{displayPrice(p.price)}</span>
                        <BadgePill badge={p.badge} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ FOOTER ════════════ */}
      <ShopFooter />
    </div>
  );
}
