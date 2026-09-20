'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Filter, Grid3X3, List, Star, Heart, ShoppingCart, Zap,
  SlidersHorizontal, Eye, ArrowLeft, Loader2
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { CATEGORIES, Product } from '@/lib/products';

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

/* ── Product Card ── */
function ProductCard({ product, view = 'grid', activeTab = 'All Products' }: { product: Product; view?: 'grid' | 'list'; activeTab?: string }) {
  const { addItem, toggleWishlist, state } = useCart();
  const router = useRouter();
  const isWished = state.wishlist.includes(product.id);
  const [added, setAdded] = useState(false);
  const { user } = useAuth();

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ product, quantity: 1, selectedColor: product.colors[0] });
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem({ product, quantity: 1, selectedColor: product.colors[0] });
    router.push('/cart');
  };

  const getTabStyles = () => {
    switch (activeTab) {
      case 'New Arrivals':
        return {
          bgClass: 'bg-red-600 border border-red-700 text-white shadow-md',
          titleClass: 'text-white hover:text-red-100 font-bold',
          categoryClass: 'text-red-200/90',
          reviewsClass: 'text-red-200',
          priceClass: 'text-white font-bold',
          originalPriceClass: 'text-red-200/60 line-through',
          colorsBorderClass: 'border-red-300',
          starColor: 'fill-yellow-400 text-yellow-400',
          starOffColor: 'fill-white/20 text-white/20',
          wishlistClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          wishlistActive: 'bg-red-800/40 border-red-400/50 text-white',
          eyeClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          cartBtnClass: 'bg-white text-red-600 hover:bg-red-50',
          cartBtnAddedClass: 'bg-red-800 text-white border border-red-700',
          buyNowBtnClass: 'border-white/60 text-white hover:bg-white/10'
        };
      case 'Flash Sales':
        return {
          bgClass: 'bg-violet-600 border border-violet-700 text-white shadow-md',
          titleClass: 'text-white hover:text-violet-100 font-bold',
          categoryClass: 'text-violet-200/90',
          reviewsClass: 'text-violet-200',
          priceClass: 'text-white font-bold',
          originalPriceClass: 'text-violet-200/60 line-through',
          colorsBorderClass: 'border-violet-300',
          starColor: 'fill-yellow-400 text-yellow-400',
          starOffColor: 'fill-white/20 text-white/20',
          wishlistClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          wishlistActive: 'bg-violet-800/40 border-violet-400/50 text-white',
          eyeClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          cartBtnClass: 'bg-white text-violet-600 hover:bg-violet-50',
          cartBtnAddedClass: 'bg-violet-800 text-white border border-violet-700',
          buyNowBtnClass: 'border-white/60 text-white hover:bg-white/10'
        };
      case 'Best Sellers':
        return {
          bgClass: 'bg-emerald-600 border border-emerald-700 text-white shadow-md',
          titleClass: 'text-white hover:text-emerald-100 font-bold',
          categoryClass: 'text-emerald-200/90',
          reviewsClass: 'text-emerald-200',
          priceClass: 'text-white font-bold',
          originalPriceClass: 'text-emerald-200/60 line-through',
          colorsBorderClass: 'border-emerald-300',
          starColor: 'fill-yellow-400 text-yellow-400',
          starOffColor: 'fill-white/20 text-white/20',
          wishlistClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          wishlistActive: 'bg-emerald-800/40 border-emerald-400/50 text-white',
          eyeClass: 'bg-white/20 border-white/30 text-white hover:bg-white/30',
          cartBtnClass: 'bg-white text-emerald-600 hover:bg-emerald-50',
          cartBtnAddedClass: 'bg-emerald-800 text-white border border-emerald-700',
          buyNowBtnClass: 'border-white/60 text-white hover:bg-white/10'
        };
      case 'All Products':
      default:
        return {
          bgClass: 'bg-black border border-gray-900 text-white shadow-md',
          titleClass: 'text-white hover:text-gray-200 font-bold',
          categoryClass: 'text-gray-400',
          reviewsClass: 'text-gray-400',
          priceClass: 'text-white font-bold',
          originalPriceClass: 'text-gray-500 line-through',
          colorsBorderClass: 'border-gray-800',
          starColor: 'fill-yellow-400 text-yellow-400',
          starOffColor: 'fill-white/10 text-white/10',
          wishlistClass: 'bg-white/10 border-white/20 text-white hover:bg-white/20',
          wishlistActive: 'bg-red-500/30 border-red-400/50 text-white',
          eyeClass: 'bg-white/10 border-white/20 text-white hover:bg-white/20',
          cartBtnClass: 'bg-white text-black hover:bg-gray-100',
          cartBtnAddedClass: 'bg-emerald-600 text-white border border-emerald-500',
          buyNowBtnClass: 'border-white/60 text-white hover:bg-white/10'
        };
    }
  };

  const st = getTabStyles();

  if (view === 'list') {
    return (
      <motion.div
        layout
        className={`product-card rounded-2xl flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 group transition-all duration-300 ${st.bgClass}`}
      >
        <Link
          href={`/shop/${product.slug || product.id}`}
          className="relative w-full h-44 sm:w-32 sm:h-32 sm:flex-shrink-0 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/15 flex items-center justify-center overflow-hidden text-5xl"
        >
          {product.images && product.images[0] ? (
            <Image src={product.images[0]} alt={product.name} fill unoptimized className="object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            product.emoji
          )}
        </Link>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1 gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase tracking-wider ${st.categoryClass}`}>{product.category}</span>
              <BadgePill badge={product.badge} discount={product.discount} />
            </div>
            <Link href={`/shop/${product.slug || product.id}`}>
              <h3 className={`font-display font-semibold transition-colors leading-tight ${st.titleClass}`}>
                {product.name}
              </h3>
            </Link>
            <StarRating rating={product.rating} starColor={st.starColor} starOffColor={st.starOffColor} />
            <p className="text-xs line-clamp-2 leading-relaxed opacity-85">{product.description}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-lg font-bold ${st.priceClass}`}>
                {product.price > 999 ? `₹${product.price.toLocaleString('en-IN')}` : `₹${product.price}`}
              </span>
              {product.originalPrice && (
                <span className={`text-xs line-through ${st.originalPriceClass}`}>
                  {product.originalPrice > 999 ? `₹${product.originalPrice.toLocaleString('en-IN')}` : `₹${product.originalPrice}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {user ? (
                <>
                  <button
                    onClick={handleBuyNow}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs border transition-all ${st.buyNowBtnClass}`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Buy Now
                  </button>
                  <button
                    onClick={handleAdd}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs transition-all ${
                      added ? st.cartBtnAddedClass : st.cartBtnClass
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    {added ? 'Added!' : 'Add to Cart'}
                  </button>
                </>
              ) : (
                <Link
                  href={`/auth?redirect=/shop/collection`}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-xs bg-white text-black hover:bg-gray-100 transition-all border border-gray-200"
                >
                  Sign In to Buy
                </Link>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className={`product-card rounded-2xl overflow-hidden group flex flex-col transition-all duration-300 ${st.bgClass}`}
    >
      <Link href={`/shop/${product.slug || product.id}`} className="relative overflow-hidden">
        <div className="relative h-52 bg-gradient-to-br from-white/10 to-white/5 border-b border-white/10 flex items-center justify-center overflow-hidden text-6xl transition-transform duration-500 group-hover:scale-105">
          {product.images && product.images[0] ? (
            <Image src={product.images[0]} alt={product.name} fill unoptimized className="object-cover" />
          ) : (
            <span className="text-6xl">{product.emoji}</span>
          )}
        </div>

        <div className="product-actions absolute inset-x-0 bottom-0 p-3 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent">
          <button
            onClick={e => { e.preventDefault(); toggleWishlist(product.id); }}
            className={`p-2 rounded-lg backdrop-blur-sm border transition-all ${
              isWished ? st.wishlistActive : st.wishlistClass
            }`}
          >
            <Heart className="w-4 h-4" fill={isWished ? 'currentColor' : 'none'} />
          </button>
          <Link
            href={`/shop/${product.slug || product.id}`}
            onClick={e => e.stopPropagation()}
            className={`p-2 rounded-lg backdrop-blur-sm transition-all border ${st.eyeClass}`}
          >
            <Eye className="w-4 h-4" />
          </Link>
          {user ? (
            <button
              onClick={handleAdd}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs transition-all ${
                added ? st.cartBtnAddedClass : st.cartBtnClass
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {added ? '✓ Added!' : 'Add to Cart'}
            </button>
          ) : (
            <Link
              href={`/auth?redirect=/shop/collection`}
              onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs bg-white text-black hover:bg-gray-100 transition-all text-center"
            >
              Sign In to Buy
            </Link>
          )}
        </div>

        <div className="absolute top-3 left-3">
          <BadgePill badge={product.badge} discount={product.discount} />
        </div>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <span className={`text-[10px] uppercase tracking-wider ${st.categoryClass}`}>
          {product.category} · {product.subcategory}
        </span>
        <Link href={`/shop/${product.slug || product.id}`}>
          <h3 className={`font-display font-semibold transition-colors mt-1 leading-tight line-clamp-2 ${st.titleClass}`}>
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <StarRating rating={product.rating} small starColor={st.starColor} starOffColor={st.starOffColor} />
          <span className={`text-[10px] ${st.reviewsClass}`}>({product.reviews})</span>
        </div>
        <div className="flex items-center gap-2 mt-auto pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className={`font-bold text-lg ${st.priceClass}`}>
              {product.price > 999 ? `₹${product.price.toLocaleString('en-IN')}` : `₹${product.price}`}
            </span>
            {product.originalPrice && (
              <span className={`text-xs line-through ${st.originalPriceClass}`}>
                {product.originalPrice > 999 ? `₹${product.originalPrice.toLocaleString('en-IN')}` : `₹${product.originalPrice}`}
              </span>
            )}
          </div>
          <div className="flex gap-1 ml-auto">
            {product.colors.slice(0, 3).map(c => (
              <div key={c} className={`w-3.5 h-3.5 rounded-full border shadow-sm ${st.colorsBorderClass}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        {user && (
          <button
            onClick={handleBuyNow}
            className={`mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-semibold text-xs border transition-all ${st.buyNowBtnClass}`}
          >
            <Zap className="w-3.5 h-3.5" />
            Buy Now
          </button>
        )}
      </div>
    </motion.div>
  );
}

const TABS = ['New Arrivals', 'Flash Sales', 'Best Sellers', 'All Products'];

function CollectionPageContent() {
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState('All Products');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 60000]);
  const [sortBy, setSortBy] = useState('popular');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { cartCount, state } = useCart();

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch('/api/products');
        const data = await res.json();
        if (data.products && data.products.length > 0) {
          interface CollectionProductRow {
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
          const mapped = (data.products as CollectionProductRow[]).map((p) => ({
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
        }
      } catch (err) {
        console.error('Error fetching collection products:', err);
      }
    }
    fetchProducts();
  }, []);

  const flashDealsList = useMemo(() => productsList.filter(p => p.badge === 'SALE' || p.badge === 'LIMITED' || p.discount), [productsList]);
  const newArrivalsList = useMemo(() => productsList.filter(p => p.badge === 'NEW'), [productsList]);
  const bestSellersList = useMemo(() => [...productsList].sort((a, b) => b.reviews - a.reviews).slice(0, 4), [productsList]);

  // Build the category filter from whatever is actually sitting in the
  // `category` column of products_box, instead of the old static CATEGORIES
  // list. That list only ever had 8 fixed labels ('Cakes', 'Gift Kits', …),
  // so any category text an admin added to the database that didn't match
  // one of those 8 strings exactly (case included) had no filter button and
  // could never be selected — the filter silently ignored real data.
  // A lookup of known icons (falls back to a generic tag for anything new).
  const CATEGORY_ICON_LOOKUP: Record<string, string> = useMemo(() => {
    const lookup: Record<string, string> = {};
    CATEGORIES.forEach(cat => {
      if (cat.value !== 'all') lookup[cat.value.toLowerCase()] = cat.icon;
    });
    return lookup;
  }, []);

  const dynamicCategories = useMemo(() => {
    const counts = new Map<string, number>();
    productsList.forEach(p => {
      const key = p.category?.trim();
      if (!key) return;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const liveCategories = Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({
        label: value,
        value,
        icon: CATEGORY_ICON_LOOKUP[value.toLowerCase()] ?? '🏷️',
        count,
      }));

    return [
      { label: 'All', value: 'all', icon: '✨', count: productsList.length },
      ...liveCategories,
    ];
  }, [productsList, CATEGORY_ICON_LOOKUP]);

  const tabProducts = useMemo(() => {
    if (activeTab === 'Flash Sales')   return flashDealsList;
    if (activeTab === 'New Arrivals')  return newArrivalsList;
    if (activeTab === 'Best Sellers')  return bestSellersList;
    return productsList;
  }, [activeTab, productsList, flashDealsList, newArrivalsList, bestSellersList]);

  const filtered = useMemo(() => {
    return tabProducts
      // Case/whitespace-insensitive match — the category column is free
      // text, so 'Photography', 'photography ', etc. should all match.
      .filter(p => selectedCategory === 'all' || p.category?.trim().toLowerCase() === selectedCategory.trim().toLowerCase())
      .filter(p => p.price >= priceRange[0] && p.price <= priceRange[1])
      .sort((a, b) => {
        if (sortBy === 'price-asc')  return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'rating')     return b.rating - a.rating;
        return b.reviews - a.reviews;
      });
  }, [tabProducts, selectedCategory, priceRange, sortBy]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1 max-w-7xl mx-auto px-4 md:px-8 py-10 w-full">
        {/* Header */}
        <div className="mb-8">
          <Link href="/shop" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Shop Main
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-4 h-9 bg-black rounded-md" />
            <h1 className="font-display text-4xl font-extrabold text-black tracking-tight">The doodle_G Bucket</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 pl-7">Explore our entire catalogue of hand-curated and AI-matched surprise packages.</p>
        </div>

        {/* Tabs + Controls */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto shadow-sm">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab ? 'bg-black text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-black/40 shadow-sm"
            >
              <option value="popular">Most Popular</option>
              <option value="rating">Top Rated</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
            </select>

            <button
              onClick={() => setSidebarOpen(p => !p)}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${
                sidebarOpen ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
            </button>

            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <button
                onClick={() => setView('grid')}
                className={`p-2 transition-colors ${view === 'grid' ? 'bg-black text-white' : 'text-gray-400 hover:text-gray-900'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-2 transition-colors ${view === 'list' ? 'bg-black text-white' : 'text-gray-400 hover:text-gray-900'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="hidden md:block flex-shrink-0 overflow-hidden"
              >
                <div className="w-60 space-y-4">
                  {/* Category */}
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5" /> Category
                    </h4>
                    <div className="space-y-0.5">
                      {dynamicCategories.map(cat => (
                        <button
                          key={cat.value}
                          onClick={() => setSelectedCategory(cat.value)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                            selectedCategory === cat.value ? 'bg-black text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </span>
                          <span className={`text-[10px] ${selectedCategory === cat.value ? 'opacity-70' : 'opacity-40'}`}>
                            {cat.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price range */}
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Price Range</h4>
                    <div className="space-y-3">
                      <input
                        type="range"
                        min={0}
                        max={60000}
                        value={priceRange[1]}
                        onChange={e => setPriceRange([priceRange[0], Number(e.target.value)])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>₹{priceRange[0].toLocaleString('en-IN')}</span>
                        <span className="font-bold text-black">₹{priceRange[1].toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Product grid */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-gray-500">
                Showing <span className="text-gray-900 font-semibold">{filtered.length}</span> products
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20 space-y-3">
                <span className="text-5xl">🔍</span>
                <p className="text-gray-500 text-sm">No products found matching your filters.</p>
                <button
                  onClick={() => { setSelectedCategory('all'); setPriceRange([0, 60000]); }}
                  className="text-black text-xs font-semibold hover:underline"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <motion.div
                layout
                className={view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-4'}
              >
                {filtered.map(p => (
                  <ProductCard key={p.id} product={p} view={view} activeTab={activeTab} />
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </main>
      <ShopFooter />
    </div>
  );
}

export default function CollectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-black" />
      </div>
    }>
      <CollectionPageContent />
    </Suspense>
  );
}
