'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Heart, ShoppingCart, ArrowRight, ArrowUpRight,
  ChevronLeft, ChevronRight, Check, Search,
  Loader2, Plus
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { buildCategories, Product } from '@/lib/products';

/* ── Star Row ── */
function StarRating({
  rating,
  small = false,
  starColor = 'fill-black text-black',
  starOffColor = 'fill-black/10 text-black/10',
}: {
  rating: number;
  small?: boolean;
  starColor?: string;
  starOffColor?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`${small ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${
            i <= Math.round(rating) ? starColor : starOffColor
          }`}
        />
      ))}
    </div>
  );
}

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


function FlashProductCard({ product }: { product: Product }) {
  const { addItem, toggleWishlist, state } = useCart();
  const isWished = state.wishlist.includes(product.id);
  const [added, setAdded]   = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ product, quantity: 1, selectedColor: product.colors[0] });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="relative rounded-2xl bg-white border-0 overflow-hidden flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300 cursor-pointer group"
    >
      <Link href={`/shop/${product.slug || product.id}`} className="relative">
        {/* Product image on a light, borderless backdrop */}
        <div className="h-36 sm:h-44 flex items-center justify-center relative overflow-hidden bg-gray-50">
          {product.images && product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              unoptimized
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <motion.span
              className="text-6xl sm:text-7xl drop-shadow-lg"
              whileHover={{ scale: 1.15, rotate: [-3, 3, -3, 0] }}
              transition={{ duration: 0.4 }}
            >
              {product.emoji}
            </motion.span>
          )}
        </div>

        {/* Wishlist top-right */}
        <button
          onClick={e => { e.preventDefault(); toggleWishlist(product.id); }}
          className={`absolute top-2 right-2 p-1.5 rounded-lg border transition-all ${
            isWished
              ? 'bg-red-50 border-red-200 text-red-500 scale-110'
              : 'bg-white/90 border-gray-200 text-gray-500 hover:bg-white'
          }`}
        >
          <Heart className="w-3.5 h-3.5" fill={isWished ? 'currentColor' : 'none'} />
        </button>
      </Link>

      {/* Card body */}
      <div className="p-3 sm:p-4 flex flex-col gap-1.5 flex-1">
        {/* Red "X% off" badge + "Limited time deal" — matches the reference deal-card template */}
        {product.discount ? (
          <div className="space-y-0.5">
            <span className="inline-block text-xs font-bold text-white bg-[#CC0C39] px-2 py-0.5 rounded-[3px]">
              {product.discount}% off
            </span>
            <p className="text-[11px] font-bold text-[#CC0C39]">Limited time deal</p>
          </div>
        ) : product.badge ? (
          <span className="inline-block w-fit text-[10px] font-bold text-white bg-sky-600 px-2 py-0.5 rounded-[3px] uppercase tracking-wide">
            {product.badge}
          </span>
        ) : null}

        <Link href={`/shop/${product.slug || product.id}`}>
          <h3 className="font-display font-semibold text-gray-900 text-sm leading-snug line-clamp-2 hover:text-gray-600 transition-colors">
            {product.name}
          </h3>
        </Link>

        {/* Stars */}
        <div className="flex items-center gap-1.5">
          <StarRating rating={product.rating} small starColor="fill-amber-400 text-amber-400" starOffColor="fill-gray-200 text-gray-200" />
          <span className="text-[10px] text-gray-400">({product.reviews})</span>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="font-bold text-lg text-gray-900">
              {product.price > 999 ? `₹${product.price.toLocaleString('en-IN')}` : `₹${product.price}`}
            </span>
            {product.originalPrice && (
              <span className="text-xs line-through text-gray-400">
                {product.originalPrice > 999 ? `₹${product.originalPrice.toLocaleString('en-IN')}` : `₹${product.originalPrice}`}
              </span>
            )}
          </div>
          <button
            onClick={handleAdd}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-semibold text-xs transition-all ${
              added ? 'bg-emerald-600 text-white' : 'bg-black hover:bg-gray-900 text-white'
            }`}
          >
            {added ? (
              <><Check className="w-3 h-3" strokeWidth={3} /> Added!</>
            ) : (
              <><ShoppingCart className="w-3 h-3" /> Add</>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Stock Product Card ────────────────────────────────────────────
   Amazon-style deal card used in the "Product in Stocks" section:
   image fully visible (object-contain, no cropping) on a light
   backdrop, a yellow circular quick-add button overlapping the
   image's bottom-right corner, a red discount pill + price row,
   and a "bought in past month" social-proof line derived from the
   review count. Grid-safe at any width — no fixed pixel sizing. */
function StockProductCard({ product }: { product: Product }) {
  const { addItem, toggleWishlist, state } = useCart();
  const isWished = state.wishlist.includes(product.id);
  const [added, setAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ product, quantity: 1, selectedColor: product.colors[0] });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const boughtLabel = (() => {
    const n = product.reviews || 0;
    if (n >= 1000) return `${Math.floor(n / 1000)}K+ bought in past month`;
    if (n >= 100) return `${Math.floor(n / 100) * 100}+ bought in past month`;
    if (n > 0) return `${n}+ bought in past month`;
    return null;
  })();

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      className="relative rounded-xl sm:rounded-2xl bg-white overflow-hidden flex flex-col shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300 cursor-pointer group min-w-0"
    >
      <Link href={`/shop/${product.slug || product.id}`} className="relative block">
        {/* Image area — object-contain so the full product is always visible, never cropped */}
        <div className="relative w-full aspect-square bg-gray-50 overflow-hidden">
          {product.images && product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              unoptimized
              className="object-contain p-3 sm:p-4 group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl sm:text-6xl">
              {product.emoji}
            </div>
          )}

          {/* Discount badge, overlaid top-left on the image */}
          {product.discount ? (
            <span className="absolute top-2 left-2 text-[10px] sm:text-xs font-bold text-white bg-[#CC0C39] px-1.5 sm:px-2 py-0.5 rounded-[3px]">
              -{product.discount}%
            </span>
          ) : null}

          {/* Wishlist / like button, top-right on the image */}
          <button
            onClick={e => { e.preventDefault(); toggleWishlist(product.id); }}
            aria-label={isWished ? 'Remove from wishlist' : 'Add to wishlist'}
            className={`absolute top-2 right-2 p-1.5 rounded-lg border transition-all ${
              isWished
                ? 'bg-red-50 border-red-200 text-red-500 scale-110'
                : 'bg-white/90 border-gray-200 text-gray-500 hover:bg-white'
            }`}
          >
            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill={isWished ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Yellow quick-add circle, overlapping the image's bottom-right corner */}
        <button
          onClick={handleAdd}
          aria-label={added ? 'Added to cart' : 'Add to cart'}
          className={`absolute -bottom-3.5 right-3 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-md border-2 border-white transition-colors ${
            added ? 'bg-emerald-500' : 'bg-amber-400 hover:bg-amber-500'
          }`}
        >
          {added ? <Check className="w-4 h-4 text-white" strokeWidth={3} /> : <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-black" strokeWidth={2.5} />}
        </button>
      </Link>

      {/* Card body */}
      <div className="p-3 sm:p-4 pt-4 sm:pt-5 flex flex-col gap-1 flex-1 min-w-0">
        <Link href={`/shop/${product.slug || product.id}`}>
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 leading-snug line-clamp-2 hover:text-gray-600 transition-colors">
            {product.name}
          </h3>
        </Link>

        {product.description && (
          <p className="text-[10px] sm:text-xs text-gray-500 leading-snug line-clamp-1">
            {product.description.trim().split(/\s+/).slice(0, 5).join(' ')}
            {product.description.trim().split(/\s+/).length > 5 ? '…' : ''}
          </p>
        )}

        <div className="flex items-center gap-1.5">
          <StarRating rating={product.rating} small starColor="fill-amber-400 text-amber-400" starOffColor="fill-gray-200 text-gray-200" />
          <span className="text-[10px] sm:text-[11px] text-gray-400">({product.reviews})</span>
        </div>

        <div className="flex items-baseline gap-1.5 sm:gap-2 mt-1 flex-wrap">
          {product.discount ? (
            <span className="text-[10px] sm:text-xs font-bold text-white bg-[#CC0C39] px-1.5 py-0.5 rounded-[3px]">
              -{product.discount}%
            </span>
          ) : null}
          <span className="font-bold text-base sm:text-lg text-gray-900">
            {product.price > 999 ? `₹${product.price.toLocaleString('en-IN')}` : `₹${product.price}`}
          </span>
          {product.originalPrice && (
            <span className="text-[11px] sm:text-xs line-through text-gray-400">
              {product.originalPrice > 999 ? `₹${product.originalPrice.toLocaleString('en-IN')}` : `₹${product.originalPrice}`}
            </span>
          )}
        </div>

        {product.badge === 'LIMITED' && (
          <p className="text-[10px] sm:text-[11px] font-bold text-[#CC0C39]">Limited time deal</p>
        )}

        {boughtLabel && (
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{boughtLabel}</p>
        )}
      </div>
    </motion.div>
  );
}

/* ── Premium Fan Carousel ──────────────────────────────────────────
   A swipeable deck of product cards: the card nearest the center of
   the viewport sits upright and slightly raised, while its neighbours
   tilt away to either side — like a fanned hand of cards. Built with
   native horizontal scroll + scroll-snap (so it swipes naturally on
   touch, no drag-handling code needed) and an IntersectionObserver
   that tracks which card is centered so the fan angles update live
   as the user swipes. */
function PremiumFanCarousel({ products }: { products: Product[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || products.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      { root: container, threshold: [0.6] }
    );

    cardRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [products.length]);

  if (products.length === 0) return null;

  const scrollByCard = (dir: number) => {
    const card = cardRefs.current[activeIndex] || cardRefs.current[0];
    const step = card ? card.offsetWidth + 24 : 260;
    containerRef.current?.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <div className="relative pt-6">
      <div
        ref={containerRef}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar py-10"
        style={{ scrollPaddingLeft: '50%', scrollPaddingRight: '50%' }}
      >
        {/* Spacers so the first/last cards can scroll to center */}
        <div className="flex-shrink-0 w-[calc(50%-110px)] sm:w-[calc(50%-125px)]" aria-hidden />

        {products.map((p, i) => {
          const offset = i - activeIndex;
          const rotate = Math.max(-14, Math.min(14, offset * 10));
          const isActive = offset === 0;
          const scale = isActive ? 1 : 0.88;
          const translateY = isActive ? -6 : 16;
          const opacity = Math.abs(offset) > 2 ? 0 : 1;

          return (
            <motion.div
              key={p.id}
              data-index={i}
              ref={el => { cardRefs.current[i] = el; }}
              animate={{ rotate, scale, y: translateY, opacity }}
              transition={{ type: 'spring', stiffness: 260, damping: 24 }}
              style={{ zIndex: 20 - Math.abs(offset) }}
              className="snap-center flex-shrink-0 w-[220px] sm:w-[250px]"
            >
              <Link
                href={`/shop/${p.slug || p.id}`}
                className={`group relative block rounded-[28px] overflow-hidden bg-white transition-shadow duration-300 ${
                  isActive ? 'shadow-[0_20px_45px_rgba(0,0,0,0.25)]' : 'shadow-[0_10px_25px_rgba(0,0,0,0.15)]'
                }`}
              >
                <div className="relative w-full aspect-[4/3] bg-gray-100">
                  {p.images?.[0] ? (
                    <Image src={p.images[0]} alt={p.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-5xl">{p.emoji}</div>
                  )}
                  <button
                    onClick={e => { e.preventDefault(); }}
                    aria-label="Add to wishlist"
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/40 backdrop-blur-md border border-white/60 flex items-center justify-center text-white hover:bg-white/70 hover:text-black transition-colors"
                  >
                    <Heart className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{p.name}</h4>
                    <p className="text-sm font-bold text-amber-500 mt-0.5">
                      {p.price > 999 ? `₹${p.price.toLocaleString('en-IN')}` : `₹${p.price}`}
                    </p>
                  </div>
                  <span className="flex-shrink-0 w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 group-hover:bg-black group-hover:text-white transition-colors">
                    <ArrowUpRight className="w-5 h-5" />
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}

        <div className="flex-shrink-0 w-[calc(50%-110px)] sm:w-[calc(50%-125px)]" aria-hidden />
      </div>

      {/* Dot pagination */}
      <div className="flex items-center justify-center gap-1.5 mt-2">
        {products.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === activeIndex ? 'w-5 bg-black' : 'w-1.5 bg-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Arrow nav — desktop/mouse only, swipe carries mobile */}
      <button
        onClick={() => scrollByCard(-1)}
        aria-label="Previous product"
        className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-10 h-10 rounded-full bg-white shadow-md border border-gray-100 items-center justify-center text-gray-600 hover:text-black transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => scrollByCard(1)}
        aria-label="Next product"
        className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-10 h-10 rounded-full bg-white shadow-md border border-gray-100 items-center justify-center text-gray-600 hover:text-black transition-colors"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
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
    <div className="flex-shrink-0 w-[280px] sm:w-[300px] rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow duration-300 p-4 group">
      <Link
        href={`/shop?category=${encodeURIComponent(group.categoryValue)}`}
        className="font-display font-bold text-gray-900 text-sm mb-3 flex items-center justify-between"
      >
        {group.label}
        <span className="text-[10px] font-semibold text-gray-400 group-hover:text-black transition-colors">
          See more →
        </span>
      </Link>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((p, i) =>
          p ? (
            <Link
              key={p.id}
              href={`/shop/${p.slug || p.id}`}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-50 block"
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
          ) : (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-50" />
          )
        )}
      </div>
    </div>
  );
}

function CategoryShowcase({ groups }: { groups: CategoryShowcaseGroup[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (groups.length === 0) return null;

  const scrollByCard = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section className="bg-white py-10 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-black rounded-full" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Shop by</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-gray-900">Category</h2>
          </div>
          <div className="flex gap-1">
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

        <div ref={scrollRef} className="flex gap-5 overflow-x-auto scroll-smooth pb-2 no-scrollbar">
          {groups.map(group => (
            <CategoryShowcaseTile key={group.label} group={group} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Product Card ── */
function FlashTimer() {
  const [time, setTime] = useState({ h: 3, m: 23, s: 19 });
  React.useEffect(() => {
    const t = setInterval(() => {
       
      setTime(prev => {
        if (prev.s > 0) return { ...prev, s: prev.s - 1 };
        if (prev.m > 0) return { ...prev, m: prev.m - 1, s: 59 };
        if (prev.h > 0) return { h: prev.h - 1, m: 59, s: 59 };
        return prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="flex items-center gap-2">
      {(['h', 'm', 's'] as const).map((label, idx) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center">
            <span className="bg-black text-white rounded-lg px-2.5 py-1 font-mono font-bold text-base w-12 text-center">
              {pad(time[label])}
            </span>
            <span className="text-[9px] text-gray-400 mt-0.5 uppercase">{label}</span>
          </div>
          {idx < 2 && <span className="text-black font-bold text-lg mb-4">:</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function ShopPage({ initialProducts = [] }: { initialProducts?: Product[] }) {
  const [productsList, setProductsList] = useState<Product[]>(initialProducts);
  const [, setActiveTab]       = useState('All Products');
  const [_selectedCategory, setSelectedCategory] = useState('all');
  const [flashIdx,        setFlashIdx]        = useState(0);
  const [searchQuery,     setSearchQuery]     = useState('');
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
            provider_id?: string | null;
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
            providerId: p.provider_id ?? undefined,
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
  // and scrolls straight to the collection grid. Read via window.location
  // instead of useSearchParams so this client page never needs a Suspense
  // boundary just to support an optional query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    if (cat) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setSelectedCategory(cat);
       
      setActiveTab('All Products');
      requestAnimationFrame(() => {
        document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  // Deep-link support: /shop?search=candles (used by the homepage's hero
  // search bar). Matches against product name, category, subcategory and
  // description, then scrolls straight to the collection grid.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('search');
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setSearchQuery(q);
      requestAnimationFrame(() => {
        document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }, []);

  // Matches the hero/collection search box against product name, category,
  // subcategory and description — so a query can find products either by
  // exact name or by a related category/keyword.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return productsList.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.subcategory?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }, [searchQuery, productsList]);

  const displayPrice = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  const flashDealsList = useMemo(() => productsList.filter(p => p.badge === 'SALE' || p.badge === 'LIMITED' || p.discount), [productsList]);
  const newArrivalsList = useMemo(() => productsList.filter(p => p.badge === 'NEW'), [productsList]);
  const bestSellersList = useMemo(() => [...productsList].sort((a, b) => b.reviews - a.reviews).slice(0, 4), [productsList]);

  const dynamicCategories = useMemo(() => {
    return buildCategories(productsList);
  }, [productsList]);

  const flashVisible = flashDealsList.slice(flashIdx, flashIdx + 4);

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

  // Shuffling with Math.random() is impure and must not run during render
  // (see https://react.dev/reference/rules/components-and-hooks-must-be-pure).
  // Do it in an effect instead, storing the result in state.
  const [randomNineProducts, setRandomNineProducts] = useState<Product[]>([]);
  useEffect(() => {
    (async () => {
      if (productsList.length === 0) {
         
        setRandomNineProducts([]);
        return;
      }
       
      setRandomNineProducts([...productsList].sort(() => 0.5 - Math.random()).slice(0, 12));
    })();
  }, [productsList]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      {/* ════════════ HERO BANNER ════════════ */}
      <section className="relative overflow-hidden bg-white-500">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-0 min-h-[540px] items-end">

            {/* Person image — left */}
            <div className="md:col-span-4 flex flex-col items-center justify-end relative z-10 gap-0 pt-4 md:flex-row md:items-end md:justify-center md:gap-0 md:pt-0">
              {/* Search bar (mobile only) — sits above the happy shopper image on small screens */}
              <div className="relative w-full max-w-sm z-20 md:hidden">
                <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg overflow-hidden">
                  <Search className="w-4 h-4 text-gray-400 ml-4 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search gifts, categories..."
                    value={searchQuery}
                    className="flex-1 bg-transparent px-3 py-3.5 text-sm text-black placeholder:text-black/40 focus:outline-none"
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  />
                  <button
                    onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}
                    className="m-1.5 bg-white rounded-xl p-2.5 hover:bg-white/80 transition-all"
                  >
                    <Search className="w-4 h-4 text-black" />
                  </button>
                </div>
              </div>

              <motion.img
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                src="https://static.vecteezy.com/system/resources/previews/041/930/971/non_2x/ai-generated-magic-butterfly-isolated-on-transparent-background-free-png.png"
                alt="Happy shopper"
                className="-mt-16 md:mt-0 h-[580px] w-auto object-contain object-bottom select-none rounded-2xl"
                style={{ maxWidth: 420 }}
              />
            </div>

            {/* Center headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="md:col-span-5 pb-14 pt-10 space-y-5 z-10"
            >
              <div className="flex items-center gap-2">
                <span className="badge-pulse text-[12px] font-bold bg-red-600 text-white px-3 py-1.5 rounded-sm uppercase tracking-widest">
                  Best Selling
                </span>
                <span className="text-sm text-black/70">Up to 31% OFF collections</span>
              </div>
              
              <h1 className="hidden md:block font-display text-6xl md:text-[66px] font-extrabold text-black leading-[1.05]">
                Gift with{' '}
                <span className="font-extrabold text-red-400">LOVE.</span>
               </h1>


              <p className="hidden md:block text-base text-black/70 leading-relaxed max-w-md">
                AI-curated surprise packages mapped to your loved one&apos;s passions, quirks, and relationship dynamic. Every gift tells a story.
              </p>

              {/* Search bar (desktop) — filters by product name, category, subcategory
                   or description; matches jump straight to the collection grid */}
              <div className="relative max-w-sm mt-2 hidden md:block">
                <div className="flex items-center bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 shadow-lg overflow-hidden">
                  <Search className="w-4 h-4 text-gray-400 ml-4 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search gifts, categories..."
                    value={searchQuery}
                    className="flex-1 bg-transparent px-3 py-3.5 text-sm text-black placeholder:text-black/40 focus:outline-none"
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  />
                  <button
                    onClick={() => document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' })}
                    className="m-1.5 bg-white rounded-xl p-2.5 hover:bg-white/80 transition-all"
                  >
                    <Search className="w-4 h-4 text-black" />
                  </button>
                </div>
              </div>

              {/* Category chips */}
              <div className="hidden md:flex gap-2 flex-wrap pt-1">
                <button
                  onClick={() => { setSelectedCategory('all'); setActiveTab('All Products'); }}
                  className="text-xs font-semibold px-3.5 py-1.5 rounded-full bg-black text-white shadow-sm"
                >
                  Show All
                </button>
                {dynamicCategories.filter(c => c.value !== 'all').slice(0, 4).map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => { setSelectedCategory(cat.value); setActiveTab('All Products'); const el = document.getElementById('collection'); el?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="text-xs font-medium px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-black/80 hover:bg-white/20 hover:text-white transition-all border border-white/20 flex items-center gap-1"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    <ArrowRight className="w-2.5 h-2.5 opacity-50" />
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Right — mini product cards */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="md:col-span-3 pb-14 pt-10 space-y-3 z-10 hidden md:flex flex-col justify-end"
            >
              {/* Best selling badge card */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20 shadow-md text-xs space-y-1 flex items-center gap-3">
                <div className="bg-red-600 text-white text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm self-start mt-0.5 whitespace-nowrap">Best Active</div>
                <div>
                  <p className="font-semibold text-black text-[11px] leading-tight">Why Our Products<br />Make You Happy</p>
                  <Link href="#collection" className="text-[10px] text-red-600 font-bold hover:underline mt-0.5 block">Shop Now →</Link>
                </div>
              </div>

              {/* Mini product cards */}
              {productsList.slice(0, 2).map((p) => (
                <Link key={p.id} href={`/shop/${p.slug || p.id}`}>
                  <motion.div
                    whileHover={{ y: -3, scale: 1.02 }}
                    className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20 shadow-md hover:shadow-lg hover:bg-white/15 cursor-pointer transition-all flex items-center gap-3"
                  >
                    <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {p.images?.[0] ? (
                        <Image src={p.images[0]} alt={p.name} fill unoptimized className="object-cover" />
                      ) : (
                        <span className="text-2xl">{p.emoji}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-[11px] font-semibold text-black line-clamp-1">{p.name}</h4>
                      <p className="text-[10px] text-blue/50 line-clamp-1">{p.category}</p>
                      <span className="text-xs font-bold text-black">{displayPrice(p.price)}</span>
                    </div>
                  </motion.div>
                </Link>
              ))}
            </motion.div>

          </div>
        </div>

        {/* subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
      </section>

      {/* ════════════ FLASH SALES ════════════ */}
      <section className="bg-white py-10 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 bg-red-500 rounded-full" />
                <span className="text-xs font-bold uppercase tracking-widest text-red-500">Today&apos;s</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900">Flash Deals</h2>
            </div>
            <div className="flex items-center gap-4">
              <FlashTimer />
              <div className="flex gap-1">
                <button
                  onClick={() => setFlashIdx(Math.max(0, flashIdx - 1))}
                  disabled={flashIdx === 0}
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition-all disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setFlashIdx(Math.min(flashDealsList.length - 4, flashIdx + 1))}
                  disabled={flashIdx >= flashDealsList.length - 4}
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black transition-all disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {flashVisible.map((p, i) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <FlashProductCard product={p} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => setActiveTab('Flash Sales')}
              className="border border-gray-200 text-gray-700 font-semibold px-6 py-2.5 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all text-sm flex items-center gap-2"
            >
              View All Flash Deals <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ════════════ SHOP BY CATEGORY ════════════ */}
      <CategoryShowcase groups={categoryShowcaseGroups} />

      {/* ════════════ MAIN COLLECTION ════════════ */}
      <section id="collection" className="flex-1 bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 md:px-8 space-y-8">

          {/* Header */}
          <div className="text-center max-w-xl mx-auto space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {searchResults ? 'Search Results' : 'Available Now'}
            </span>
            <h2 className="font-display text-3xl font-bold text-gray-900 leading-tight">
              {searchResults ? `Results for "${searchQuery}"` : 'Product in Stocks'}
            </h2>
            <p className="text-xs text-gray-500">
              {searchResults
                ? `${searchResults.length} product${searchResults.length === 1 ? '' : 's'} matched by name, category or description.`
                : 'Browse products currently in stock below, or click below to view the full bucket with advanced filters.'}
            </p>
            {searchResults && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-semibold text-gray-500 underline hover:text-black transition-colors"
              >
                Clear search
              </button>
            )}
          </div>

          {/* Product grid — search results when a query is active,
              otherwise up to 12 random featured products: 10 shown on
              mobile, all 12 from md (tablet/desktop) up. 2 columns on
              phones, scaling up to 4 columns on large screens. */}
          {searchResults ? (
            searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                <p className="text-sm font-semibold text-gray-700">No products matched &quot;{searchQuery}&quot;</p>
                <p className="text-xs text-gray-400">Try a different product name, category, or keyword.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {searchResults.map(p => (
                  <StockProductCard key={p.id} product={p} />
                ))}
              </div>
            )
          ) : randomNineProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-black" />
              <p className="text-sm text-gray-400">Loading products...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
              {randomNineProducts.map((p, i) => (
                <div key={p.id} className={i >= 10 ? 'hidden md:block' : ''}>
                  <StockProductCard product={p} />
                </div>
              ))}
            </div>
          )}

          {/* Premium swipeable product carousel — replaces the old
              "View the Bucket" button with a fanned card deck the
              user can swipe through on mobile. */}
          <PremiumFanCarousel products={randomNineProducts} />

        </div>
      </section>

      {/* ════════════ BEST SELLERS ════════════ */}
      <section className="bg-white py-14 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Header */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-4 h-9 bg-[#db4444] rounded-md" /> {/* Red bar */}
              <span className="text-[#db4444] text-xs font-bold uppercase tracking-wider">
                Featured
              </span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <h2 className="font-display text-4xl font-extrabold text-black tracking-tight">Best Sellers</h2>
              <Link
                href="/shop"
                onClick={() => setActiveTab('Best Sellers')}
                className="text-xs text-gray-500 font-semibold hover:text-black flex items-center gap-1 transition-colors"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Bento Grid */}
          {bestSellersList.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* LEFT — Tall Hero card (bestSellersList[0]) */}
              {bestSellersList[0] && (
                <Link
                  href={`/shop/${bestSellersList[0].slug || bestSellersList[0].id}`}
                  className="lg:col-span-2 relative rounded-2xl overflow-hidden group block bg-[#0d0d0d] min-h-[480px] lg:h-[600px] border border-white/10 shadow-xl"
                >
                  {bestSellersList[0].images?.[0] ? (
                    <Image
                      src={bestSellersList[0].images[0]}
                      alt={bestSellersList[0].name}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-750 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-9xl bg-gradient-to-br from-gray-900 to-black">
                      {bestSellersList[0].emoji}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-8 space-y-2">
                    <h3 className="font-display text-2xl font-bold text-white tracking-tight">
                      {bestSellersList[0].name}
                    </h3>
                    <p className="text-xs text-gray-300 max-w-sm line-clamp-2 leading-relaxed">
                      {bestSellersList[0].description}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-xs text-white font-bold border-b border-white pb-0.5 group-hover:border-transparent transition-all mt-2">
                      Shop Now
                    </span>
                  </div>
                </Link>
              )}

              {/* RIGHT — Spans 2 columns, holds top wide horizontal card and bottom two square cards */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                
                {/* Right Top — Wide horizontal card (bestSellersList[1]) */}
                {bestSellersList[1] && (
                  <Link
                    href={`/shop/${bestSellersList[1].slug || bestSellersList[1].id}`}
                    className="relative rounded-2xl overflow-hidden group block bg-[#0d0d0d] h-[288px] border border-white/10 shadow-xl"
                  >
                    {bestSellersList[1].images?.[0] && (
                      <div className="absolute right-0 top-0 bottom-0 w-1/2 h-full z-0 overflow-hidden">
                        <Image
                          src={bestSellersList[1].images[0]}
                          alt={bestSellersList[1].name}
                          fill
                          unoptimized
                          className="object-cover transition-transform duration-750 group-hover:scale-105"
                        />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent z-10" />
                    <div className="absolute inset-y-0 left-0 w-3/5 p-6 flex flex-col justify-end z-20 space-y-2">
                      <h3 className="font-display text-lg font-bold text-white tracking-tight">
                        {bestSellersList[1].name}
                      </h3>
                      <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed">
                        {bestSellersList[1].description}
                      </p>
                      <span className="inline-flex items-center gap-1.5 text-xs text-white font-bold border-b border-white pb-0.5 group-hover:border-transparent transition-all w-fit mt-1">
                        Shop Now
                      </span>
                    </div>
                  </Link>
                )}

                {/* Right Bottom — Two square cards side by side (bestSellersList[2] and bestSellersList[3]) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[bestSellersList[2], bestSellersList[3]].map((p) => (
                    p ? (
                      <Link
                        key={p.id}
                        href={`/shop/${p.slug || p.id}`}
                        className="relative rounded-2xl overflow-hidden group block bg-[#0d0d0d] h-[288px] border border-white/10 shadow-xl"
                      >
                        {p.images?.[0] ? (
                          <Image
                            src={p.images[0]}
                            alt={p.name}
                            fill
                            unoptimized
                            className="object-cover transition-transform duration-750 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-7xl bg-gradient-to-br from-gray-900 to-black">
                            {p.emoji}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent z-10" />
                        <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1.5 z-20">
                          <h4 className="font-display text-base font-bold text-white tracking-tight">
                            {p.name}
                          </h4>
                          <p className="text-[11px] text-gray-300 line-clamp-2 leading-normal">
                            {p.description}
                          </p>
                          <span className="inline-flex items-center gap-1.5 text-xs text-white font-bold border-b border-white pb-0.5 group-hover:border-transparent transition-all w-fit mt-1">
                            Shop Now
                          </span>
                        </div>
                      </Link>
                    ) : null
                  ))}
                </div>

              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-400 text-sm">No products available yet.</div>
          )}
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
