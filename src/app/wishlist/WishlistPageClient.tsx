'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ShoppingCart, ArrowLeft, LogIn, Star, Gift, ArrowRight } from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { Product, ProductBoxRow, mapProductBoxRow } from '@/lib/products';

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`}
        />
      ))}
    </div>
  );
}

export default function WishlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { state, toggleWishlist, addItem, cartCount } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [fetching, setFetching] = useState(true);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Fetch all products then filter to wishlist
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (data.products) {
          const mapped = (data.products as ProductBoxRow[]).map(mapProductBoxRow);
          setProducts(mapped);
        } else {
          setProducts([]);
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setFetching(false));
  }, []);

  const likedProducts = products.filter(p => state.wishlist.includes(p.id));

  const handleAddToCart = (product: Product) => {
    addItem({ product, quantity: 1, selectedColor: product.colors?.[0] ?? 'Default' });
    setAddedIds(prev => new Set(prev).add(product.id));
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1800);
  };

  if (authLoading || fetching) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Heart className="w-10 h-10 animate-pulse text-rose-300" />
            <p className="text-sm">Loading your wishlist…</p>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <ShopNav cartCount={cartCount} />
        <div className="flex-1 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-3xl shadow-xl border border-gray-100 p-12 max-w-md w-full text-center space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-rose-50 border-2 border-rose-100 flex items-center justify-center mx-auto">
              <Heart className="w-9 h-9 text-rose-400" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Your Wishlist</h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                Sign in to save your favourite gift packages and access them from any device.
              </p>
            </div>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 bg-black text-white font-bold px-8 py-3.5 rounded-xl text-sm hover:bg-gray-900 transition-all shadow-md"
            >
              <LogIn className="w-4 h-4" />
              Sign In to View Wishlist
            </Link>
            <Link href="/shop" className="block text-xs text-gray-400 hover:text-gray-700 transition-colors">
              Continue browsing →
            </Link>
          </motion.div>
        </div>
        <ShopFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ShopNav cartCount={cartCount} wishlistCount={likedProducts.length} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
          <div className="space-y-1.5">
            <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Shop
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Heart className="w-7 h-7 text-rose-500 fill-rose-500" />
              My Wishlist
            </h1>
            <p className="text-sm text-gray-500">
              {likedProducts.length === 0
                ? 'No liked products yet — start browsing!'
                : `${likedProducts.length} gift package${likedProducts.length !== 1 ? 's' : ''} saved`}
            </p>
          </div>

          {likedProducts.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-white border border-gray-100 rounded-xl px-4 py-2 shadow-sm">
              <Gift className="w-4 h-4 text-rose-400" />
              <span>@{user.user_name}&apos;s curated picks</span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {likedProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center justify-center py-24 gap-5 text-center"
          >
            <div className="w-24 h-24 rounded-full bg-rose-50 border-2 border-rose-100 flex items-center justify-center">
              <Heart className="w-11 h-11 text-rose-200" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h2 className="text-xl font-bold text-gray-700">Nothing liked yet</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                Tap the ❤️ on any gift package to save it here for later.
              </p>
            </div>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-black text-white font-bold px-7 py-3 rounded-xl text-sm hover:bg-gray-900 transition-all shadow-md group"
            >
              Explore Gifts
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
          >
            <AnimatePresence>
              {likedProducts.map(product => (
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden group flex flex-col"
                >
                  {/* Image */}
                  <Link href={`/shop/${product.slug || product.id}`} className="relative block overflow-hidden">
                    <div className="relative h-48 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {product.images?.[0] ? (
                        <Image
                          src={product.images[0]}
                          alt={product.name}
                          fill
                          unoptimized
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <span className="text-6xl">{product.emoji}</span>
                      )}
                    </div>

                    {/* Remove heart overlay */}
                    <button
                      onClick={e => { e.preventDefault(); toggleWishlist(product.id); }}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 flex items-center justify-center shadow-sm hover:bg-rose-50 hover:border-rose-200 transition-all group/btn"
                      title="Remove from wishlist"
                    >
                      <Heart className="w-4 h-4 fill-rose-500 text-rose-500 group-hover/btn:scale-110 transition-transform" />
                    </button>

                    {/* Discount badge */}
                    {product.discount && (
                      <span className="absolute top-3 left-3 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        -{product.discount}%
                      </span>
                    )}
                  </Link>

                  {/* Details */}
                  <div className="p-4 flex flex-col flex-1 gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                      {product.category}
                    </span>
                    <Link href={`/shop/${product.slug || product.id}`}>
                      <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 hover:text-gray-700 transition-colors">
                        {product.name}
                      </h3>
                    </Link>

                    <div className="flex items-center gap-1.5">
                      <StarRating rating={product.rating} />
                      <span className="text-[10px] text-gray-400">({product.reviews})</span>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-2 gap-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-gray-900 text-base">
                          {product.price > 999 ? `₹${product.price.toLocaleString('en-IN')}` : `₹${product.price}`}
                        </span>
                        {product.originalPrice && (
                          <span className="text-xs line-through text-gray-400">
                            {product.originalPrice > 999 ? `₹${product.originalPrice.toLocaleString('en-IN')}` : `₹${product.originalPrice}`}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddToCart(product)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-xs transition-all ${
                          addedIds.has(product.id)
                            ? 'bg-emerald-600 text-white'
                            : 'bg-black text-white hover:bg-gray-800'
                        }`}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {addedIds.has(product.id) ? 'Added!' : 'Add'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Bottom CTA */}
        {likedProducts.length > 0 && (
          <div className="mt-10 flex justify-center">
            <Link
              href="/shop/collection"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors font-medium group"
            >
              <Gift className="w-4 h-4" />
              Explore more gift packages
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        )}
      </main>
      <ShopFooter />
    </div>
  );
}
