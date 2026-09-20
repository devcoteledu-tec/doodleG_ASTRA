'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Heart, ShoppingCart, ChevronRight, Minus, Plus,
  RotateCcw, Shield, Truck, Sparkles, Check, Loader2,
  Send, XCircle, X, ZoomIn,
  ChevronLeft, ChevronDown, ChevronUp, Store, BadgeCheck, Wallet
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { Product, ProductBoxRow } from '@/lib/products';

interface Review {
  id: string;
  author: string;
  date: string;
  rating: number;
  avatar: string;
  text: string;
  userId: string | null;
}

/** Raw shape of a single product row from `/api/products/[id]` — a superset of ProductBoxRow. */
interface FullProductRow extends ProductBoxRow {
  saving_percentage?: number | string | null;
  shipping_and_products?: string | null;
  available_qty?: number | string | null;
  total_likes?: number | string | null;
  sizes?: string[] | null;
}

function StarRow({ rating, interactive = false, onRate }: { rating: number; interactive?: boolean; onRate?: (r: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-4 h-4 transition-colors cursor-pointer ${
            i <= (interactive ? hover || rating : rating)
              ? 'fill-black text-black'
              : 'fill-black/10 text-black/10'
          }`}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onRate?.(i)}
        />
      ))}
    </div>
  );
}

// Ordered list of specification keys to surface as product highlights.
// Module-level so the reference is stable across renders (avoids useMemo dep churn).
const HIGHLIGHT_KEY_ORDER = [
  'Material', 'Material Composition', 'Fit Type', 'Fit', 'Sleeve Type', 'Sleeve',
  'Collar Style', 'Collar', 'Length', 'Neck Style', 'Neck', 'Pattern',
  'Country of Origin', 'Fabric', 'Wash Care',
];

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<Product[]>([]);

  const { addItem, toggleWishlist, state, cartCount } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const isWished = product ? state.wishlist.includes(product.id) : false;

  const [selectedColor, setSelectedColor] = useState('#000000');
  const [selectedSize,  setSelectedSize]  = useState('');
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [quantity,      setQuantity]      = useState(1);
  const [_activeTab,    _setActiveTab]    = useState('Details');
  const [added,         setAdded]         = useState(false);

  // Check if this product is already in the cart (e.g. user navigated back
  // to the product page after adding it earlier in this session).
  const isInCart = state.items.some(i => i.product.id === product?.id);
  const [imgIdx,        setImgIdx]        = useState(0);
  const [userRating,    setUserRating]    = useState(0);
  const [reviewText,    setReviewText]    = useState('');
  const [_showForm,     setShowForm]      = useState(false);
  const [reviewError,   setReviewError]   = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [linkCopied,    setLinkCopied]    = useState(false);
  const [zoomOpen,      setZoomOpen]      = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);

  const views = useMemo(
    () => (product?.images && product.images.length >= 3 ? product.images : [product?.emoji || '🎁', '📦', '🎀', '🌟']),
    [product]
  );

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomOpen(false);
      if (e.key === 'ArrowRight') setImgIdx(i => (i + 1) % views.length);
      if (e.key === 'ArrowLeft') setImgIdx(i => (i - 1 + views.length) % views.length);
    };
    window.addEventListener('keydown', onKey);
    // Prevent the page behind the zoom overlay from scrolling.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // `views` is derived from `product` each render, not a stable ref — the
    // arrow-key handlers below close over `views.length` at bind time, so
    // this only needs to react to zoomOpen actually opening/closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOpen]);

  // ── Delivery PIN checker ──
  // Standalone widget (not tied to the cart/checkout PIN) — lets a shopper
  // check estimated shipping for THIS product before adding it to cart.
  // Calls /api/products/[id]/delivery-check, which reuses the exact same
  // computeCartShipping() the cart/order routes charge from, so this
  // number is never a separate guess.
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState<'idle' | 'checking' | 'done' | 'error'>('idle');
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryResult, setDeliveryResult] = useState<{
    district: string | null; state: string | null; estimatedShipping: number; resolved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!/^\d{6}$/.test(deliveryPincode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setDeliveryStatus('idle');
       
      setDeliveryResult(null);
       
      setDeliveryError('');
      return;
    }
     
    setDeliveryStatus('checking');
    const t = setTimeout(async () => {
      // Captured at schedule time — used below to detect and discard a
      // stale response (e.g. the person retyped the PIN before this
      // request finished, and an older in-flight request resolves after
      // the newer one — without this guard the older response can
      // overwrite the newer, correct result on screen).
      const requestedPincode = deliveryPincode;
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(id)}/delivery-check?pincode=${encodeURIComponent(requestedPincode)}`);
        const data = await res.json();
        if (requestedPincode !== deliveryPincode) return; // superseded by a newer request — ignore
        if (!res.ok) {
          // Surface the server's actual reason (bad PIN format, product not
          // found, rate limited, etc.) instead of always claiming the PIN
          // itself was invalid — those are different problems and telling
          // someone their correct PIN is wrong is actively misleading.
           
          setDeliveryStatus('error');
           
          setDeliveryResult(null);
           
          setDeliveryError(data.error || 'Something went wrong. Please try again.');
          return;
        }
         
        setDeliveryResult({ district: data.district, state: data.state, estimatedShipping: data.estimatedShipping, resolved: data.resolved });
         
        setDeliveryStatus('done');
      } catch {
         
        setDeliveryStatus('error');
         
        setDeliveryResult(null);
         
        setDeliveryError("Couldn't check delivery right now. Please try again.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [deliveryPincode, id]);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/shop/${id}` : `/shop/${id}`;
  const shareText = product ? `Check out ${product.name} on doodle_G ✨` : 'Check out this gift on doodle_G ✨';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently ignore, the link is still visible in the address bar.
    }
  };

  const _handleWhatsAppShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank', 'noopener,noreferrer');
  };

  const _handleTelegramShare = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank', 'noopener,noreferrer');
  };

  const _handleInstagramShare = async () => {
    // Instagram has no web share intent, so we copy the link and let the
    // person paste it into a DM, Story, or bio themselves.
    await handleCopyLink();
  };

  const _handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: product?.name, text: shareText, url: shareUrl });
      } catch {
        // Person dismissed the native share sheet — no action needed.
      }
    }
  };

  // The signed-in caller's own review for this product, if they've already
  // left one. Used to switch the form into "edit my review" mode instead of
  // letting them create a second one — the API also enforces this, this is
  // just what makes the UI reflect that same one-review-per-user rule.
  const myReview = useMemo(
    () => (user ? reviews.find(r => r.userId === user.id) ?? null : null),
    [reviews, user]
  );

  const _ratingBreakdown = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => {
      const ratingVal = Math.round(Number(r.rating));
      if (counts[ratingVal] !== undefined) {
        counts[ratingVal]++;
      }
    });
    const total = reviews.length || 1;
    return [5, 4, 3, 2, 1].map(stars => ({
      stars,
      pct: reviews.length > 0 ? Math.round((counts[stars] / total) * 100) : 0,
    }));
  }, [reviews]);

  // Preferred order for the "Top Highlights" box — a fashion-listing style
  // spec breakdown. Matched case-insensitively against whatever keys the
  // provider actually filled into `specifications` (see migration 021);
  // any of these absent just don't render — never invented. Falls back to
  // showing the product's other specification entries (if any) so a
  // provider who used different field names still gets *something* useful
  // shown up-front rather than an empty box.
  const highlightEntries = useMemo(() => {
    const specs = product?.specifications;
    if (!specs) return [] as [string, string][];
    const entries = Object.entries(specs);
    const preferred = HIGHLIGHT_KEY_ORDER
      .map(wanted => entries.find(([k]) => k.toLowerCase() === wanted.toLowerCase()))
      .filter((e): e is [string, string] => !!e);
    // Dedupe (e.g. both 'Fit' and 'Fit Type' present would otherwise show twice)
    const seen = new Set<string>();
    const deduped = preferred.filter(([k]) => {
      const norm = k.toLowerCase();
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
    if (deduped.length > 0) return deduped.slice(0, 8);
    // No known clothing keys matched — fall back to whatever specs exist.
    return entries.slice(0, 8);
  }, [product]);

  const fetchProductDetails = async () => {
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.product) {
        const p = data.product as FullProductRow;
        const mappedProduct: Product = {
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
          sizes: p.sizes && p.sizes.length > 0 ? p.sizes : undefined,
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
          specifications: p.specifications && Object.keys(p.specifications).length > 0 ? p.specifications : undefined,
          shippingPolicy: p.shipping_policy ?? undefined,
          returnPolicy: p.return_policy ?? undefined,
          warranty: p.warranty ?? undefined,
          productCode: p.product_code ?? undefined,
          providerName: p.provider_name ?? undefined,
          paymentOption: p.payment_option ?? 'both',
          advancePercentage: p.payment_option === 'advance' ? (Number(p.advance_percentage) || 36) : undefined,
        };

        setProduct(mappedProduct);
        setSelectedColor(mappedProduct.colors[0]);
        if (mappedProduct.sizes) {
          setSelectedSize(mappedProduct.sizes[0]);
        }

        // Map reviews
        interface ReviewRow {
          id: string;
          user_name: string;
          user_id: string | null;
          date_of_posted: string;
          rating: number;
          description_of_product: string;
        }
        const mappedReviews: Review[] = (data.reviews || []).map((r: ReviewRow) => ({
          id: r.id,
          author: r.user_name,
          date: new Date(r.date_of_posted).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          rating: r.rating,
          avatar: '👤',
          text: r.description_of_product,
          userId: r.user_id,
        }));
        setReviews(mappedReviews);

        // Load related products from Supabase
        try {
          const relRes = await fetch('/api/products');
          const relData = await relRes.json();
          if (relData.products) {
            const filtered: Product[] = relData.products
              .filter((item: ProductBoxRow) => item.id !== p.id && item.category === p.category)
              .slice(0, 4)
              .map((item: ProductBoxRow) => ({
                id: item.id,
                slug: item.slug ?? undefined,
                name: item.product_name,
                price: Number(item.price_in_rupees),
                rating: Number(item.star_count),
                reviews: 0,
                category: item.category,
                subcategory: 'Premium Gift',
                colors: ['#0a0a0a', '#6b7280', '#e85d4a'],
                description: '',
                details: [],
                emoji: item.emoji || '🎁',
                gradient: item.gradient || 'from-gray-700 to-black',
                images: item.product_images || undefined,
                providerId: item.provider_id ?? undefined,
              }));
            setRelated(filtered);
          }
        } catch (err) {
          console.error('Error fetching related products:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching product details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchProductDetails();
    })();
    // fetchProductDetails intentionally omitted: it's a plain function
    // recreated every render, not memoized, and this effect should only
    // re-run when the product `id` in the URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [sizeError, setSizeError] = useState(false);

  const sizeRequiredButMissing = () => !!(product?.sizes && product.sizes.length > 0 && !selectedSize);

  const handleAddToCart = () => {
    if (!product) return;
    if (sizeRequiredButMissing()) {
      setSizeError(true);
      return;
    }
    if (added || isInCart) {
      // Already added — "GO TO CART" mode: navigate to cart.
      router.push('/cart');
      return;
    }
    addItem({ product, quantity, selectedColor, selectedSize: selectedSize || undefined });
    setAdded(true);
  };

  const _handleBuyNow = () => {
    if (!product) return;
    if (sizeRequiredButMissing()) {
      setSizeError(true);
      return;
    }
    addItem({ product, quantity, selectedColor, selectedSize: selectedSize || undefined });
    router.push('/cart');
  };

  const _openReviewForm = () => {
    // Pre-fill with the caller's existing review (if any) so re-opening the
    // form edits it rather than presenting a blank "new review" state.
    if (myReview) {
      setUserRating(myReview.rating);
      setReviewText(myReview.text);
    } else {
      setUserRating(0);
      setReviewText('');
    }
    setReviewError('');
    setShowForm(p => !p);
  };

  const submitReview = async () => {
    if (!reviewText || !userRating || !product || !user) return;
    setSubmitting(true);
    setReviewError('');
    try {
      // Note: no `userName` is sent — the server always resolves the
      // display name from the caller's own signed-in session, and it uses
      // that same session to decide whether this is a new review or an
      // edit of the one review this user is allowed to have per product.
      const res = await fetch(`/api/products/${encodeURIComponent(id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: userRating,
          descriptionOfProduct: reviewText,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReviewText('');
        setUserRating(0);
        setShowForm(false);
        fetchProductDetails();
      } else {
        setReviewError(data.error || 'Failed to submit review.');
      }
    } catch (err) {
      console.error('Error submitting review:', err);
      setReviewError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayPrice = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-black" />
          <p className="text-sm text-gray-400">Loading product blueprint...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-2">
          <span className="text-4xl">⚠️</span>
          <h2 className="font-display text-2xl font-bold text-gray-900">Product Not Found</h2>
          <Link href="/shop" className="text-black font-semibold hover:underline text-sm mt-2">
            Back to Collection
          </Link>
        </div>
      </div>
    );
  }

  const avgRating = reviews.length > 0 
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length 
    : product.rating;
  const _TABS = product.specifications
    ? ['Details', 'Specifications', 'Reviews', 'Shipping and Returns']
    : ['Details', 'Reviews', 'Shipping and Returns'];

  // Rating distribution for the bar chart
  const ratingDist = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }));
  const maxDistCount = Math.max(...ratingDist.map(d => d.count), 1);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50/80">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-2 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/shop" className="hover:text-gray-900 transition-colors">Shop</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-600 truncate max-w-[200px]">{product.name}</span>
        </div>
      </div>

      <main className="flex-1">
        {/* ── PRODUCT HERO ── */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

            {/* ── Gallery — fixed/sticky on desktop so the image stays in
                view while the (long) details panel scrolls past it, like
                the reference template. Mobile keeps normal document flow
                since there's no room to pin anything on a small screen. ── */}
            <div className="lg:sticky lg:top-20 lg:self-start flex flex-col-reverse md:flex-row gap-4">
              {/* Thumbnails — vertical strip on desktop, horizontal on mobile */}
              <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto md:max-h-[520px] pb-2 md:pb-0 md:pr-1 scrollbar-none">
                {views.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    onDoubleClick={() => { setImgIdx(i); setZoomOpen(true); }}
                    className={`relative flex-shrink-0 w-16 h-16 md:w-[72px] md:h-[72px] rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all duration-200 cursor-pointer ${
                      imgIdx === i ? 'border-black shadow-md scale-105' : 'border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {v.startsWith('http') ? (
                      <Image src={v} alt={`${product.name} ${i + 1}`} fill unoptimized className="object-cover" />
                    ) : (
                      <span className="text-2xl">{v}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Main image */}
              <motion.div
                key={imgIdx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                onDoubleClick={() => setZoomOpen(true)}
                className={`group relative flex-1 aspect-square md:h-[520px] rounded-2xl border border-gray-100 flex items-center justify-center bg-gradient-to-br ${product.gradient} overflow-hidden cursor-zoom-in`}
              >
                {views[imgIdx].startsWith('http') ? (
                  <Image src={views[imgIdx]} alt={product.name} fill unoptimized className="object-contain transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <span className="text-9xl transition-transform duration-500 group-hover:scale-110">{views[imgIdx]}</span>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <span className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5" /> Double-click to zoom
                  </span>
                </div>
                {product.badge && (
                  <span className={`absolute top-4 left-4 text-[10px] font-bold px-2.5 py-1 rounded-lg border backdrop-blur-sm tracking-widest uppercase ${
                    product.badge === 'NEW'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    product.badge === 'SALE' ? 'bg-white/90 text-black border-black/20' :
                    product.badge === 'HOT'  ? 'bg-red-50 text-red-600 border-red-200' :
                                               'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>
                    {product.badge}{product.discount ? ` −${product.discount}%` : ''}
                  </span>
                )}
              </motion.div>
            </div>

            {/* ── Info Panel — normal flow now (image column is the one
                that's pinned; see above) ── */}
            <div className="space-y-5">
              {/* Seller line */}
              {product.providerName && (
                <Link
                  href={product.providerId ? `/profiles/${product.providerId}` : '#'}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-black hover:underline transition-colors"
                >
                  <Store className="w-4 h-4" /> {product.providerName}
                </Link>
              )}

              {/* Title */}
              <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-900 leading-snug">{product.name}</h1>

              {/* Quick spec summary (color, material, dimensions — pulled from specifications) */}
              {product.specifications && (
                <p className="text-sm text-gray-500">
                  {['Color', 'Colour', 'Material', 'Dimensions', 'Size', 'Weight'].map(key => {
                    const match = Object.entries(product.specifications!).find(([k]) => k.toLowerCase() === key.toLowerCase());
                    return match ? match[1] : null;
                  }).filter(Boolean).join(' · ')}
                </p>
              )}

              {/* Rating badge */}
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-sm font-bold px-2.5 py-1 rounded-md shadow-sm">
                  {avgRating.toFixed(1)} <Star className="w-3.5 h-3.5 fill-white" />
                </span>
                <span className="text-sm text-gray-500">{product.reviews} Ratings</span>
              </div>

              {/* Price block */}
              <div className="space-y-1 border-t border-gray-100 pt-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-3xl font-bold text-gray-900">{displayPrice(product.price)}</span>
                  {product.originalPrice && (
                    <>
                      <span className="text-lg text-gray-400 line-through">MRP {displayPrice(product.originalPrice)}</span>
                      {product.discount && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                          className="text-sm font-extrabold text-red-600 bg-red-50 px-2 py-0.5 rounded-md"
                        >
                          −{product.discount}%
                        </motion.span>
                      )}
                      <span className="text-sm font-bold text-emerald-700">
                        (Save {displayPrice(product.originalPrice - product.price)})
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-emerald-600 font-medium">inclusive of all taxes</p>
              </div>

              {/* ── Trust badges — small, evenly-sized square boxes in one
                  tight row (was a bulky 2×2 grid; shrunk icon/text/padding
                  so up to 4 fit cleanly side by side and stay square at
                  any width via aspect-square). ── */}
              <div className="pt-2">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: Shield,    text: '100% Original Products',             sub: 'Verified by doodle_G',    iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
                    (() => {
                      switch (product.paymentOption) {
                        case 'cod':
                          return { icon: Truck, text: 'Cash on Delivery Only', sub: 'No online payment needed', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' };
                        case 'prepaid':
                          return { icon: Wallet, text: 'Prepaid Only', sub: 'Pay online at checkout', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' };
                        case 'advance':
                          return { icon: Wallet, text: `${product.advancePercentage ?? 36}% Advance + COD`, sub: 'Rest paid on delivery', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' };
                        default:
                          return { icon: Truck, text: 'Cash on Delivery Available', sub: 'Or pay online at checkout', iconBg: 'bg-blue-100', iconColor: 'text-blue-600' };
                      }
                    })(),
                    ...(product.warranty
                      ? [{ icon: BadgeCheck, text: 'Warranty included',            sub: product.warranty.split('\n')[0], iconBg: 'bg-purple-100', iconColor: 'text-purple-600' }]
                      : []),
                    ...(product.returnPolicy
                      ? [{ icon: RotateCcw, text: 'Returns accepted',              sub: product.returnPolicy.split('\n')[0], iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }]
                      : [{ icon: XCircle,   text: 'No Return & No Refund Policy',  sub: 'Contact seller for details',        iconBg: 'bg-red-100',   iconColor: 'text-red-500' }]),
                  ].map(({ icon: Icon, text, sub, iconBg, iconColor }, i) => (
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.05 * i }}
                      whileHover={{ scale: 1.03 }}
                      className="aspect-square flex flex-col items-center justify-center text-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1.5 cursor-default hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className={`w-7 h-7 rounded-md ${iconBg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                      </div>
                      <div className="min-w-0 w-full">
                        <p className="text-[9px] font-semibold text-gray-800 leading-[1.15]">{text}</p>
                        <p className="text-[8px] text-gray-400 leading-[1.15] mt-0.5">{sub}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Sizes */}
              {product.sizes && product.sizes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Size:</span>{' '}
                      {selectedSize ? (
                        <span className="text-gray-900 font-bold">{selectedSize}</span>
                      ) : (
                        <span className="text-gray-400 italic">not selected</span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSizeChartOpen(true)}
                      className="text-xs font-semibold text-gray-500 hover:text-black underline underline-offset-2 transition-colors"
                    >
                      Size Chart
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map(s => (
                      <motion.button
                        key={s}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => { setSelectedSize(s); setSizeError(false); }}
                        aria-pressed={selectedSize === s}
                        className={`min-w-[48px] px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all duration-200 ${
                          selectedSize === s
                            ? 'border-black bg-black text-white shadow-md scale-105'
                            : 'border-gray-200 text-gray-700 hover:border-gray-400 active:scale-95'
                        }`}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {sizeError && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs font-semibold text-red-500"
                      >
                        Please select a size to continue.
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Quantity */}
              <div className="flex items-center gap-4 pt-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Qty</p>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors active:bg-gray-100"><Minus className="w-4 h-4" /></button>
                  <span className="px-4 py-2 text-sm font-bold text-gray-900 min-w-[40px] text-center border-x border-gray-200">{quantity}</span>
                  <button onClick={() => setQuantity(q => q + 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors active:bg-gray-100"><Plus className="w-4 h-4" /></button>
                </div>
              </div>

              {/* CTA buttons — black → yellow-orange after adding to cart */}
              <div className="flex gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddToCart}
                  className={`flex-1 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg transition-all duration-500 ${
                    added || isInCart
                      ? 'bg-amber-400 text-black shadow-amber-200/40 hover:bg-amber-500'
                      : 'bg-black text-white shadow-black/10 hover:bg-gray-900'
                  }`}
                >
                  {added || isInCart ? (
                    <><Check className="w-4 h-4" /> GO TO CART</>
                  ) : (
                    <><ShoppingCart className="w-4 h-4" /> ADD TO BAG</>
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => toggleWishlist(product.id)}
                  className={`px-5 py-3.5 rounded-xl border-2 font-bold text-sm flex items-center gap-2 transition-all duration-200 ${
                    isWished
                      ? 'bg-red-50 border-red-300 text-red-600'
                      : 'border-gray-200 text-gray-700 hover:border-black hover:text-black'
                  }`}
                >
                  <Heart className="w-4 h-4" fill={isWished ? 'currentColor' : 'none'} />
                  {isWished ? 'WISHLISTED' : 'WISHLIST'}
                </motion.button>
              </div>

              {/* Price + Seller line */}
              <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                <span>{displayPrice(product.price)} {product.originalPrice ? <><s>{displayPrice(product.originalPrice)}</s> ({displayPrice(product.originalPrice - product.price)} OFF)</> : ''}</span>
                {product.providerName && <span>Seller: <span className="font-semibold text-gray-600">{product.providerName}</span></span>}
              </div>

              {/* ── Top Highlights — sized/clothing-style products get a
                  prominent spec table up front (like a fashion listing's
                  material/fit/sleeve breakdown), sourced from whatever the
                  provider filled into `specifications`. Shown whenever the
                  product has sizes (the real signal that it's a wearable —
                  more reliable than a category label, since a provider can
                  file a shirt under any category), not gated to one exact
                  category string. Nothing renders if the provider hasn't
                  filled in any of these fields — never fabricated. ── */}
              {product.sizes && product.sizes.length > 0 && highlightEntries.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.1 }}
                  className="border-t border-gray-100 pt-5 space-y-3"
                >
                  <p className="text-sm font-bold text-gray-900 uppercase tracking-wider">Top Highlights</p>
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-x-6 gap-y-2.5 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3.5">
                    {highlightEntries.map(([key, value], i) => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.12 + i * 0.04 }}
                        className="min-w-0"
                      >
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">{key}</p>
                        <p className="text-sm text-gray-800 font-medium truncate">{String(value)}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Delivery Options ── */}
              <div className="border-t border-gray-100 pt-5 space-y-4">
                <p className="text-sm font-bold text-gray-900 uppercase tracking-wider">Delivery Options <Truck className="inline w-4 h-4 ml-1 text-gray-400" /></p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={deliveryPincode}
                    onChange={e => setDeliveryPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter pincode"
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black transition-colors"
                  />
                  <button
                    onClick={() => { /* trigger by typing — auto-fires via useEffect */ }}
                    className="px-4 py-2.5 text-sm font-bold text-black hover:text-black/70 transition-colors"
                  >
                    {deliveryStatus === 'checking' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check'}
                  </button>
                </div>
                {deliveryStatus === 'done' && deliveryResult && (
                  <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-sm space-y-1">
                    {deliveryResult.district && deliveryResult.state && (
                      <p className="text-emerald-600 font-medium flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Delivers to {deliveryResult.district}, {deliveryResult.state}
                      </p>
                    )}
                    <p className="text-gray-600">
                      Estimated shipping: <span className="font-bold text-gray-900">{displayPrice(deliveryResult.estimatedShipping)}</span>
                      {!deliveryResult.resolved && <span className="text-gray-400 text-xs ml-1">(standard rate)</span>}
                    </p>
                  </motion.div>
                )}
                {deliveryStatus === 'error' && (
                  <p className="text-xs text-red-500">{deliveryError}</p>
                )}
                <p className="text-[11px] text-gray-400">Please enter PIN code to check delivery time &amp; Pay on Delivery Availability</p>
              </div>

              {/* ── Share (always visible, platform icons) ── */}
              <div className="border-t border-gray-100 pt-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Share this product</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'WhatsApp',  iconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQyYgDrsG53p53Iey4hW4IlxbDPnTcd1oKkbtkNE8AATA&s=10', bg: 'bg-white hover:bg-[#25D366]/10 border-gray-200 hover:border-[#25D366]/40',
                      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(product.name + ' ' + window.location.href)}`, '_blank') },
                    { label: 'Telegram',  iconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRnYrpwLTmU4XedNUe02vv2k5g0wXHmUPtUGZ6VnBvIng&s=10', bg: 'bg-white hover:bg-[#0088cc]/10 border-gray-200 hover:border-[#0088cc]/40',
                      action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(product.name)}`, '_blank') },
                    { label: 'Facebook',  iconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRol_wBuPqmAeCJJkfQFYOyBBpXeh2HDq1VHRG6Q55-gg&s=10', bg: 'bg-white hover:bg-[#1877F2]/10 border-gray-200 hover:border-[#1877F2]/40',
                      action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank') },
                    { label: 'Instagram', iconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQuBz3kcFGtyRGog_MJQEytXUbme-YeqqBO7YW_JlLErg&s=10', bg: 'bg-white hover:bg-[#E4405F]/10 border-gray-200 hover:border-[#E4405F]/40',
                      action: () => { navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); } },
                    { label: 'More',      iconUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTkwXcOylt1hQCcBMDlaZnDXYGI7JrctJCFVGpUJZCICA&s=10', bg: 'bg-white hover:bg-gray-100 border-gray-200',
                      action: () => {
                        if (navigator.share) navigator.share({ title: product.name, url: window.location.href }).catch(() => {});
                        else { navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }
                      } },
                    { label: linkCopied ? 'Copied!' : 'Copy Link', icon: '🔗', bg: 'bg-black/5 hover:bg-black/10 border-black/10',
                      action: () => { navigator.clipboard.writeText(window.location.href); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); } },
                  ].map(s => (
                    <motion.button
                      key={s.label}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={s.action}
                      className={`flex items-center gap-2 text-xs font-bold text-gray-800 ${s.bg} border px-3 py-2 rounded-lg transition-all shadow-sm`}
                    >
                      {'iconUrl' in s ? (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic external URL from provider data
                        <img src={s.iconUrl} alt={s.label} className="w-4 h-4 object-contain rounded-sm flex-shrink-0" />
                      ) : (
                        <span className="text-sm flex-shrink-0">{s.icon}</span>
                      )}
                      <span className="whitespace-nowrap">{s.label}</span>
                    </motion.button>
                  ))}
                </div>
                {linkCopied && (
                  <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-emerald-600 font-medium">
                    Link copied to clipboard — paste it anywhere to share!
                  </motion.p>
                )}
              </div>
            </div>
          </div>

          {/* ── About this item — 2-line teaser pulled straight from the
              full Product Details description below, so a shopper gets a
              taste of it without having to scroll past the whole hero
              first. "See more" jumps to the full section rather than
              duplicating the whole description up here. ── */}
          {product.description && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="mt-8 pt-6 border-t border-gray-100"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5">About this item</p>
              <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 max-w-3xl">{product.description}</p>
              <a
                href="#product-details"
                className="inline-block mt-1.5 text-xs font-semibold text-black hover:underline underline-offset-2"
              >
                See more
              </a>
            </motion.div>
          )}
        </div>

        {/* ── PRODUCT DETAILS (inline, not tabbed — matches reference) ── */}
        <div id="product-details" className="border-t border-gray-100 bg-gray-50/30">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-12">

            {/* Product Details */}
            <section className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-5 h-5" /> Product Details
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line max-w-3xl">{product.description}</p>
              {product.details.length > 0 && (
                <ul className="text-sm text-gray-600 space-y-1.5 max-w-3xl">
                  {product.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />{d}</li>
                  ))}
                </ul>
              )}
              {product.warranty && (
                <p className="text-sm text-gray-600"><strong>Warranty:</strong> {product.warranty}</p>
              )}
            </section>

            {/* Specifications (2-column grid with See More, matching reference) */}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Specifications</h2>
                {(() => {
                  const entries = Object.entries(product.specifications!);
                  const PREVIEW = 6;
                  const visible = specsExpanded ? entries : entries.slice(0, PREVIEW);
                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
                        {visible.map(([label, value]) => (
                          <div key={label} className="flex justify-between py-2.5 border-b border-gray-100 text-sm">
                            <span className="text-gray-400">{label}</span>
                            <span className="text-gray-900 font-medium text-right">{value}</span>
                          </div>
                        ))}
                      </div>
                      {entries.length > PREVIEW && (
                        <button
                          onClick={() => setSpecsExpanded(e => !e)}
                          className="text-sm font-bold text-black hover:underline flex items-center gap-1"
                        >
                          {specsExpanded ? <>See Less <ChevronUp className="w-4 h-4" /></> : <>See More <ChevronDown className="w-4 h-4" /></>}
                        </button>
                      )}
                    </>
                  );
                })()}
              </section>
            )}

            {/* Shipping & Returns */}
            <section className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Shipping &amp; Returns</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Truck className="w-4 h-4" /> Shipping Policy</h3>
                  {product.shippingPolicy ? (
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.shippingPolicy}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Shipping cost is calculated based on your delivery PIN code. Check above for an estimate.</p>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Return Policy</h3>
                  {product.returnPolicy ? (
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{product.returnPolicy}</p>
                  ) : (
                    <p className="text-sm text-gray-400">Contact the seller for return and exchange details.</p>
                  )}
                </div>
              </div>
            </section>

            {/* ── RATINGS (bar chart distribution, matching reference) ── */}
            <section className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                Ratings <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
              </h2>
              <div className="flex flex-col sm:flex-row gap-8 items-start">
                {/* Big number */}
                <div className="text-center sm:text-left">
                  <p className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
                  <div className="flex items-center gap-0.5 mt-1 justify-center sm:justify-start">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`w-4 h-4 ${i <= Math.round(avgRating) ? 'fill-emerald-600 text-emerald-600' : 'fill-gray-200 text-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{reviews.length} Verified Buyers</p>
                </div>
                {/* Distribution bars */}
                <div className="flex-1 space-y-1.5 w-full max-w-sm">
                  {ratingDist.map(({ star, count }) => (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-gray-500 font-medium text-right">{star}</span>
                      <Star className="w-3 h-3 fill-gray-300 text-gray-300" />
                      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(count / maxDistCount) * 100}%` }}
                          transition={{ duration: 0.6, delay: (5 - star) * 0.08, ease: 'easeOut' }}
                          className={`h-full rounded-full ${
                            star >= 4 ? 'bg-emerald-500' : star === 3 ? 'bg-yellow-400' : 'bg-red-400'
                          }`}
                        />
                      </div>
                      <span className="w-8 text-gray-400 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Customer Reviews ── */}
            <section className="space-y-6">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider">
                Customer Reviews ({reviews.length})
              </h2>

              {/* Write a review */}
              <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 max-w-2xl shadow-sm">
                <p className="text-sm font-semibold text-gray-700">Write a Review</p>
                <div className="flex items-center gap-1">
                  <StarRow rating={userRating} interactive onRate={setUserRating} />
                  <span className="text-xs text-gray-400 ml-2">{userRating}/5</span>
                </div>
                <textarea
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder="Share your experience with this product..."
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black/40 resize-none transition-colors"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{reviewText.length}/500</span>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={submitReview}
                    disabled={submitting || !reviewText.trim() || userRating === 0}
                    className="bg-black text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Submit
                  </motion.button>
                </div>
                {reviewError && <p className="text-xs text-red-500">{reviewError}</p>}
              </div>

              {/* Reviews list */}
              {reviews.length === 0 ? (
                <p className="text-sm text-gray-400">No reviews yet. Be the first to share your thoughts!</p>
              ) : (
                <div className="space-y-4 max-w-2xl">
                  {reviews.map((r, i) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-xl border border-gray-100 p-5 space-y-2 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                            {r.rating} <Star className="w-3 h-3 fill-white" />
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{r.author}</span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{r.text}</p>
                    </motion.div>
                  ))}
                </div>
              )}

              {(product.productCode || product.providerName) && (
                <div className="border-t border-gray-100 pt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400 max-w-2xl">
                  {product.productCode && <span>Product Code: <span className="text-gray-600 font-medium">{product.productCode}</span></span>}
                  {product.providerName && (
                    <span>
                      Seller: <span className="text-gray-600 font-medium">{product.providerName}</span>
                      {product.providerId && (
                        <Link href={`/profiles/${product.providerId}`} className="ml-2 text-black font-semibold hover:underline">
                          View Seller Profile
                        </Link>
                      )}
                    </span>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ── Related Products ── */}
        {related.length > 0 && (
          <div className="border-t border-gray-100">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-6">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wider">Similar Products</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {related.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Link href={`/shop/${item.slug || item.id}`} className="group block">
                      <div className={`aspect-square rounded-xl border border-gray-100 flex items-center justify-center bg-gradient-to-br ${item.gradient} overflow-hidden relative`}>
                        {item.images?.[0] ? (
                          <Image src={item.images[0]} alt={item.name} fill unoptimized className="object-cover transition-transform duration-300 group-hover:scale-105" />
                        ) : (
                          <span className="text-4xl group-hover:scale-110 transition-transform duration-300">{item.emoji}</span>
                        )}
                        {item.badge && (
                          <span className="absolute top-2 left-2 text-[9px] font-bold bg-black text-white px-1.5 py-0.5 rounded">
                            {item.discount ? `${item.discount}% OFF` : item.badge}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-0.5">
                        <p className="text-xs text-gray-900 font-medium truncate group-hover:text-black transition-colors">{item.name}</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-gray-900">{displayPrice(item.price)}</span>
                          {item.originalPrice && (
                            <span className="text-[10px] text-gray-400 line-through">{displayPrice(item.originalPrice)}</span>
                          )}
                        </div>
                        {item.rating > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                            {item.rating.toFixed(1)} <Star className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                          </span>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Zoom overlay */}
      <AnimatePresence>
        {zoomOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center"
            onClick={() => setZoomOpen(false)}
          >
            <button onClick={() => setZoomOpen(false)} className="absolute top-5 right-5 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all" aria-label="Close zoom">
              <X className="w-5 h-5" />
            </button>
            {views.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); setImgIdx(i => (i - 1 + views.length) % views.length); }} className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all" aria-label="Previous"><ChevronLeft className="w-6 h-6" /></button>
                <button onClick={e => { e.stopPropagation(); setImgIdx(i => (i + 1) % views.length); }} className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all" aria-label="Next"><ChevronRight className="w-6 h-6" /></button>
              </>
            )}
            <motion.div key={imgIdx} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-[90vw] h-[85vh] max-w-4xl" onClick={e => e.stopPropagation()}>
              {views[imgIdx].startsWith('http') ? (
                <Image src={views[imgIdx]} alt={product.name} fill unoptimized className="object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[12rem]">{views[imgIdx]}</div>
              )}
            </motion.div>
            {views.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                {views.map((_, i) => (
                  <button key={i} onClick={e => { e.stopPropagation(); setImgIdx(i); }} className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? 'bg-white w-4' : 'bg-white/40'}`} aria-label={`Image ${i + 1}`} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Size chart modal — bottom sheet on mobile (slides up, easy thumb
          reach), centered card on desktop. Generic guide, clearly labeled
          as such — there's no per-product size chart data in the catalog,
          so this deliberately doesn't pretend to be product-specific. */}
      <AnimatePresence>
        {sizeChartOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={() => setSizeChartOpen(false)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-display font-bold text-lg text-gray-900">Size Chart</h3>
                <button
                  onClick={() => setSizeChartOpen(false)}
                  className="p-1.5 rounded-full text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
                  aria-label="Close size chart"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  A general size guide in inches. Measurements can vary slightly by
                  provider and cut — check the product&apos;s Details tab for anything
                  specific to this item, or message the seller if you&apos;re between sizes.
                </p>
                <div className="overflow-x-auto -mx-5 px-5">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="border-b-2 border-gray-900">
                        {['Size', 'Chest', 'Length', 'Shoulder'].map(h => (
                          <th key={h} className="text-left py-2 font-bold text-gray-900 text-xs uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['S',  '36–38', '27', '17'],
                        ['M',  '38–40', '28', '17.5'],
                        ['L',  '40–42', '29', '18'],
                        ['XL', '42–44', '30', '18.5'],
                        ['2XL','44–46', '31', '19'],
                        ['3XL','46–48', '32', '19.5'],
                      ].map(([size, chest, length, shoulder], i) => (
                        <motion.tr
                          key={size}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.03 * i }}
                          className={`border-b border-gray-100 ${selectedSize === size ? 'bg-amber-50 font-semibold' : ''}`}
                        >
                          <td className="py-2.5 text-gray-900">{size}</td>
                          <td className="py-2.5 text-gray-600">{chest}&quot;</td>
                          <td className="py-2.5 text-gray-600">{length}&quot;</td>
                          <td className="py-2.5 text-gray-600">{shoulder}&quot;</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShopFooter />
    </div>
  );
}
