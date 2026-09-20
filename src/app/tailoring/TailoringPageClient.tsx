'use client';

import React, { useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, ShoppingBag, GripVertical, PackagePlus, Grip,
  CheckCircle2, AlertTriangle, ArrowRight, LayoutGrid,
  Candy, Wine, Leaf, Flower2, NotebookPen, Gift,
  Cookie, Watch, Link2, Frame, SprayCan, Nut, Store, SlidersHorizontal,
  Loader2, type LucideIcon,
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useAuth } from '@/lib/AuthContext';

/* ════════════════════════════════════════════════════════════════════
   DESIGN TOKENS — category → icon + soft pastel palette
   Referenced from the gift-hamper / boutique-shop templates: warm cream
   hero, pastel category chips, rounded icon tiles.
   ════════════════════════════════════════════════════════════════════ */

interface CategoryStyle {
  icon: LucideIcon;
  /** Pastel background for cards/tiles in this category. */
  soft: string;
  /** Slightly deeper tone for text/icon accents on the pastel background. */
  accent: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Sweets:      { icon: Candy,       soft: 'bg-rose-50',    accent: 'text-rose-600' },
  Drinks:      { icon: Wine,        soft: 'bg-amber-50',   accent: 'text-amber-700' },
  'Self-Care': { icon: Leaf,        soft: 'bg-emerald-50', accent: 'text-emerald-700' },
  Decor:       { icon: Flower2,     soft: 'bg-purple-50',  accent: 'text-purple-700' },
  Stationery:  { icon: NotebookPen, soft: 'bg-sky-50',     accent: 'text-sky-700' },
  Chocolates:  { icon: Cookie,      soft: 'bg-orange-50',  accent: 'text-orange-700' },
  Watch:       { icon: Watch,       soft: 'bg-slate-100',  accent: 'text-slate-700' },
  Chain:       { icon: Link2,       soft: 'bg-zinc-100',   accent: 'text-zinc-700' },
  Frames:      { icon: Frame,       soft: 'bg-pink-50',    accent: 'text-pink-700' },
  Spray:       { icon: SprayCan,    soft: 'bg-fuchsia-50', accent: 'text-fuchsia-700' },
  Nuts:        { icon: Nut,         soft: 'bg-yellow-50',  accent: 'text-yellow-800' },
  Boutique:    { icon: Store,       soft: 'bg-teal-50',    accent: 'text-teal-700' },
};
const DEFAULT_CATEGORY_STYLE: CategoryStyle = { icon: Gift, soft: 'bg-gray-50', accent: 'text-gray-600' };
const getCategoryStyle = (category: string): CategoryStyle => CATEGORY_STYLES[category] ?? DEFAULT_CATEGORY_STYLE;

/* ════════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════════ */

/** A single item that can be dragged (or tapped) into the hamper. */
interface Product {
  id: string;
  name: string;
  /** Free-text category as stored in Supabase (see the CHECK constraint on
     customization_products.category) — filter tabs are derived from
     whatever categories are actually present in the fetched catalog. */
  category: string;
  price: number;
  /** How many of the box's physical slots one unit of this item takes up. */
  slots: number;
  emoji: string;
  gradient: string;
  description: string;
  imageUrl: string | null;
  /** Free-form promotional label ("20% OFF", "NEW", ...) shown on the
     yellow offer badge. Null/empty means no offer — the badge doesn't render. */
  offerTag: string | null;
}

/** One line inside the hamper: a product plus how many the user has added. */
interface HamperItem {
  product: Product;
  qty: number;
}

interface ToastMessage {
  id: number;
  text: string;
  tone: 'error' | 'success';
}

/** Shape returned by GET /api/customization-products (one row of the
   `customization_products` Supabase table — see
   supabase_migration_023_customization_products.sql). */
interface CustomizationProductRow {
  id: string;
  product_name: string;
  image_url: string | null;
  category: string;
  price_in_rupees: number;
  slots: number;
  product_description: string | null;
  emoji: string | null;
  gradient: string | null;
  offer_tag: string | null;
}

function mapRowToProduct(row: CustomizationProductRow): Product {
  return {
    id: row.id,
    name: row.product_name,
    category: row.category,
    price: row.price_in_rupees,
    slots: row.slots,
    emoji: row.emoji || '🎁',
    gradient: row.gradient || 'from-gray-500 to-gray-700',
    description: row.product_description || '',
    imageUrl: row.image_url,
    offerTag: row.offer_tag,
  };
}

/* ════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════ */

export default function TailoringPageClient() {
  const router = useRouter();
  const { user } = useAuth();

  // ── Catalog, fetched live from Supabase via /api/customization-products. ──
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [fetchNonce, setFetchNonce] = useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const res = await fetch('/api/customization-products');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load the hamper catalog.');
        if (cancelled) return;
        setCatalog(((data.products ?? []) as CustomizationProductRow[]).map(mapRowToProduct));
      } catch (err: unknown) {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : 'Failed to load the hamper catalog.');
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }

    loadCatalog();
    return () => { cancelled = true; };
  }, [fetchNonce]);

  // ── Hamper contents. Keyed implicitly by product.id inside the array. ──
  const [hamper, setHamper] = useState<HamperItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  // ── Product overview modal — opened via the 6-dot "view details" trigger
  //    on a card, shows the full image/name/description/price/offer/
  //    category for that one product. ──
  const [overviewProduct, setOverviewProduct] = useState<Product | null>(null);

  // ── Checkout modal — shipping form → real order placed via
  //    POST /api/customization-orders. Prefilled from the signed-in user
  //    where possible; the API independently re-derives every price and
  //    requires its own session check, so nothing here is trusted blindly. ──
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'form' | 'success'>('form');
  const [checkoutForm, setCheckoutForm] = useState({ name: '', email: '', phone: '', address: '', city: '', zip: '' });
  const [checkoutErrors, setCheckoutErrors] = useState<Record<string, string>>({});
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placeOrderError, setPlaceOrderError] = useState('');
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');

  // ── Catalog browsing state ──
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  // ── Filter drawer state (price range + slots) — layered on top of the
  //    category tabs and search box above. ──
  const [filterOpen, setFilterOpen] = useState(false);
  const [slotsFilter, setSlotsFilter] = useState<Set<number>>(new Set());
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);

  // The slider's min/max come from whatever's actually in the catalog, so
  // it always spans real prices instead of an arbitrary hardcoded range.
  const priceBounds = useMemo<[number, number]>(() => {
    if (catalog.length === 0) return [0, 5000];
    const prices = catalog.map(p => p.price);
    return [Math.min(...prices), Math.max(...prices)];
  }, [catalog]);

  // Once the catalog loads, the slider's active range defaults to the full
  // bounds via `effectivePriceRange` below (falls back to priceBounds when
  // priceRange hasn't been touched yet) — no effect needed to seed it.
  const effectivePriceRange = priceRange ?? priceBounds;
  const filtersActive = slotsFilter.size > 0 || (priceRange !== null && (priceRange[0] !== priceBounds[0] || priceRange[1] !== priceBounds[1]));

  const toggleSlotsFilter = useCallback((n: number) => {
    setSlotsFilter(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSlotsFilter(new Set());
    setPriceRange(priceBounds);
  }, [priceBounds]);

  // Filter tabs are derived from whatever categories actually came back
  // from Supabase, so a new category shows up automatically the moment an
  // admin adds a product in it — no frontend redeploy needed.
  const categories = useMemo(() => {
    const unique = Array.from(new Set(catalog.map(p => p.category))).sort();
    return ['All', ...unique];
  }, [catalog]);

  // ── Drag state (purely visual — the actual payload travels via dataTransfer) ──
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDropZoneActive, setIsDropZoneActive] = useState(false);

  // ── Hamper-internal drag state — for reordering items in the hamper and
  //    for the "drag out to remove" trash zone. Separate from `draggingId`
  //    above, which is only for dragging catalog cards in. ──
  const [draggingHamperId, setDraggingHamperId] = useState<string | null>(null);
  const [dragOverHamperId, setDragOverHamperId] = useState<string | null>(null);
  const [isTrashZoneActive, setIsTrashZoneActive] = useState(false);

  /* ── Derived totals. No capacity cap — the hamper can hold any number of
     items/slots, so this is purely informational (shown in the box header
     and footer), never a gate on adding more. ── */
  const currentCapacity = useMemo(
    () => hamper.reduce((sum, h) => sum + h.product.slots * h.qty, 0),
    [hamper]
  );
  const subtotal = useMemo(
    () => hamper.reduce((sum, h) => sum + h.product.price * h.qty, 0),
    [hamper]
  );

  /* ── Toast helpers ── */
  const pushToast = useCallback((text: string, tone: ToastMessage['tone']) => {
    const id = ++toastIdRef.current;
    setToasts(t => [...t, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts(t => t.filter(m => m.id !== id));
    }, 3200);
  }, []);

  /* ── Core state transition: add one unit of a product to the hamper.
     Shared by the drag-and-drop drop handler and the "+ Add" button — no
     capacity check here, the hamper has no slot limit. ── */
  const addToHamper = useCallback((product: Product) => {
    setHamper(prev => {
      const existing = prev.find(h => h.product.id === product.id);
      if (existing) {
        return prev.map(h => h.product.id === product.id ? { ...h, qty: h.qty + 1 } : h);
      }
      return [...prev, { product, qty: 1 }];
    });
    pushToast(`Added ${product.name} to your hamper.`, 'success');
  }, [pushToast]);

  const removeFromHamper = useCallback((productId: string) => {
    setHamper(prev => prev.filter(h => h.product.id !== productId));
  }, []);

  const decrementInHamper = useCallback((productId: string) => {
    setHamper(prev =>
      prev
        .map(h => h.product.id === productId ? { ...h, qty: h.qty - 1 } : h)
        .filter(h => h.qty > 0)
    );
  }, []);

  /* ── Native HTML5 drag-and-drop handlers — catalog card → hamper ── */
  const handleDragStart = (e: React.DragEvent, product: Product) => {
    e.dataTransfer.setData('text/plain', product.id);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingId(product.id);
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setIsDropZoneActive(false);
  };
  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // required to allow a drop
    e.dataTransfer.dropEffect = 'copy';
    setIsDropZoneActive(true);
  };
  const handleDropZoneDragLeave = () => setIsDropZoneActive(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropZoneActive(false);
    // A hamper row being dragged over its own container (mid-reorder)
    // shouldn't be treated as a new catalog item — bail out here and let
    // the per-row handlers below own the reorder.
    if (e.dataTransfer.types.includes('application/x-hamper-item')) return;
    const productId = e.dataTransfer.getData('text/plain');
    const product = catalog.find(p => p.id === productId);
    if (product) addToHamper(product);
    setDraggingId(null);
  };

  /* ── Native HTML5 drag-and-drop handlers — reordering *within* the
     hamper, and dragging an item out to a trash zone to remove it. ── */
  const handleHamperItemDragStart = (e: React.DragEvent, productId: string) => {
    e.dataTransfer.setData('application/x-hamper-item', productId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingHamperId(productId);
  };
  const handleHamperItemDragEnd = () => {
    setDraggingHamperId(null);
    setDragOverHamperId(null);
    setIsTrashZoneActive(false);
  };
  const handleHamperItemDragOver = (e: React.DragEvent, productId: string) => {
    if (!e.dataTransfer.types.includes('application/x-hamper-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (productId !== draggingHamperId) setDragOverHamperId(productId);
  };
  const handleHamperItemDrop = (e: React.DragEvent, targetProductId: string) => {
    if (!e.dataTransfer.types.includes('application/x-hamper-item')) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-hamper-item');
    setDragOverHamperId(null);
    if (!draggedId || draggedId === targetProductId) return;
    setHamper(prev => {
      const fromIndex = prev.findIndex(h => h.product.id === draggedId);
      const toIndex = prev.findIndex(h => h.product.id === targetProductId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };
  const handleTrashDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-hamper-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsTrashZoneActive(true);
  };
  const handleTrashDragLeave = () => setIsTrashZoneActive(false);
  const handleTrashDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-hamper-item')) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/x-hamper-item');
    setIsTrashZoneActive(false);
    if (draggedId) removeFromHamper(draggedId);
  };

  /* ── Filtered catalog ── */
  const filteredCatalog = useMemo(() => {
    return catalog.filter(p => {
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      const matchesQuery = p.name.toLowerCase().includes(query.trim().toLowerCase());
      const matchesPrice = p.price >= effectivePriceRange[0] && p.price <= effectivePriceRange[1];
      const matchesSlots = slotsFilter.size === 0 || slotsFilter.has(p.slots);
      return matchesCategory && matchesQuery && matchesPrice && matchesSlots;
    });
  }, [catalog, activeCategory, query, effectivePriceRange, slotsFilter]);

  /* ── Checkout: opens the shipping form. Guests get bounced to sign in
     first — the API requires a session anyway (and middleware.ts double-
     enforces it), so there's no point showing a form a guest can't submit.
     Prefills whatever the signed-in user's profile actually gave us. ── */
  const handleCheckout = () => {
    if (hamper.length === 0) return;
    if (!user) {
      router.push('/auth?redirect=/tailoring');
      return;
    }
    setCheckoutForm(f => ({
      ...f,
      name: f.name || user.user_name || '',
      email: f.email || user.email || '',
      phone: f.phone || user.mobile_number || '',
    }));
    setPlaceOrderError('');
    setCheckoutStep('form');
    setCheckoutOpen(true);
  };

  const handleCheckoutFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCheckoutForm(f => ({ ...f, [name]: value }));
    setCheckoutErrors(errs => ({ ...errs, [name]: '' }));
  };

  const validateCheckoutForm = () => {
    const errs: Record<string, string> = {};
    if (!checkoutForm.name.trim()) errs.name = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutForm.email)) errs.email = 'Enter a valid email.';
    if (!checkoutForm.phone.trim()) errs.phone = 'Phone number is required.';
    if (!checkoutForm.address.trim()) errs.address = 'Street address is required.';
    if (!checkoutForm.city.trim()) errs.city = 'City is required.';
    if (!/^[1-9][0-9]{5}$/.test(checkoutForm.zip.trim())) errs.zip = 'Enter a valid 6-digit PIN code.';
    setCheckoutErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ── Places the order for real via POST /api/customization-orders.
     The client sends only *which* products + *how many* + the shipping
     contact — every price, name, and slot count in the request is ignored
     server-side and re-derived fresh from customization_products (see
     computeServerTrustedPricing in that route), so nothing here can be
     tampered with in devtools to change what gets charged or recorded. ── */
  const checkoutRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitOrder = async () => {
    if (!validateCheckoutForm()) return;
    setPlacingOrder(true);
    setPlaceOrderError('');
    try {
      const fingerprint = JSON.stringify({ checkoutForm, items: hamper.map(h => ({ productId: h.product.id, quantity: h.qty })) });
      if (checkoutRequest.current?.fingerprint !== fingerprint) checkoutRequest.current = { fingerprint, key: crypto.randomUUID() };
      const res = await fetch('/api/customization-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping: {
            name: checkoutForm.name,
            email: checkoutForm.email,
            phone: checkoutForm.phone,
            address: checkoutForm.address,
            city: checkoutForm.city,
            zip: checkoutForm.zip,
            country: 'India',
          },
          items: hamper.map(h => ({ productId: h.product.id, quantity: h.qty })),
          paymentMethod: 'Cash on Delivery',
          idempotencyKey: checkoutRequest.current.key,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        if (res.status === 401) {
          router.push('/auth?redirect=/tailoring');
          return;
        }
        setPlaceOrderError(data.error || 'Failed to place order. Please try again.');
        return;
      }
      setPlacedOrderNumber(data.orderNumber ?? '');
      setHamper([]);
      setCheckoutStep('success');
    } catch {
      setPlaceOrderError('Network error. Please check your connection and try again.');
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav />

      {/* ── Main builder grid ── */}
      <section className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-8 pb-28 flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
        <ProductCatalog
          products={filteredCatalog}
          hasAnyProducts={catalog.length > 0}
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          query={query}
          onQueryChange={setQuery}
          draggingId={draggingId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onAdd={addToHamper}
          onViewDetails={setOverviewProduct}
          loading={catalogLoading}
          error={catalogError}
          onRetry={() => setFetchNonce(n => n + 1)}
          onOpenFilter={() => setFilterOpen(true)}
          filtersActive={filtersActive}
        />

        <HamperBox
          hamper={hamper}
          currentCapacity={currentCapacity}
          isDropZoneActive={isDropZoneActive}
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDrop}
          onRemove={removeFromHamper}
          onDecrement={decrementInHamper}
          onIncrement={addToHamper}
          draggingHamperId={draggingHamperId}
          dragOverHamperId={dragOverHamperId}
          isTrashZoneActive={isTrashZoneActive}
          onHamperItemDragStart={handleHamperItemDragStart}
          onHamperItemDragEnd={handleHamperItemDragEnd}
          onHamperItemDragOver={handleHamperItemDragOver}
          onHamperItemDrop={handleHamperItemDrop}
          onTrashDragOver={handleTrashDragOver}
          onTrashDragLeave={handleTrashDragLeave}
          onTrashDrop={handleTrashDrop}
        />
      </section>

      <HamperFooter
        subtotal={subtotal}
        currentCapacity={currentCapacity}
        itemCount={hamper.reduce((n, h) => n + h.qty, 0)}
        onCheckout={handleCheckout}
      />

      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        priceBounds={priceBounds}
        priceRange={effectivePriceRange}
        onPriceChange={setPriceRange}
        slotsFilter={slotsFilter}
        onToggleSlot={toggleSlotsFilter}
        onClear={clearFilters}
      />

      <ProductOverviewModal
        product={overviewProduct}
        onClose={() => setOverviewProduct(null)}
        onAdd={product => {
          addToHamper(product);
          setOverviewProduct(null);
        }}
      />

      <CheckoutModal
        open={checkoutOpen}
        step={checkoutStep}
        form={checkoutForm}
        errors={checkoutErrors}
        onFormChange={handleCheckoutFormChange}
        subtotal={subtotal}
        itemCount={hamper.reduce((n, h) => n + h.qty, 0)}
        placing={placingOrder}
        placeError={placeOrderError}
        orderNumber={placedOrderNumber}
        onSubmit={submitOrder}
        onClose={() => {
          setCheckoutOpen(false);
          setCheckoutStep('form');
        }}
      />

      <ToastStack toasts={toasts} />

      <ShopFooter />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LEFT COLUMN — Product Catalog
   ════════════════════════════════════════════════════════════════════ */

function ProductCatalog({
  products, hasAnyProducts, categories, activeCategory, onCategoryChange, query, onQueryChange,
  draggingId, onDragStart, onDragEnd, onAdd, onViewDetails, loading, error, onRetry,
  onOpenFilter, filtersActive,
}: {
  products: Product[];
  /** Whether the fetch returned ANY active product at all, before category/
     search/price/slot filters are applied — lets the empty state tell
     "nothing matches your filters" apart from "the catalog itself is empty". */
  hasAnyProducts: boolean;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (c: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, p: Product) => void;
  onDragEnd: () => void;
  onAdd: (p: Product) => void;
  onViewDetails: (p: Product) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenFilter: () => void;
  filtersActive: boolean;
}) {
  return (
    <div>
      {/* Search + filter — dark pill search bar with a filter trigger beside it */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-white/60 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search items…"
            className="w-full pl-10 pr-9 py-2.5 rounded-full bg-black text-white text-sm placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-black/30 transition-all"
          />
          {query && (
            <button
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onOpenFilter}
          aria-label="Open filters"
          className="relative flex-shrink-0 w-10 h-10 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {filtersActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
          )}
        </button>
      </div>

      {/* Category tabs — rounded icon tiles, each with its own pastel accent */}
      {categories.length > 1 && (
        <div
          className="flex items-start gap-3 overflow-x-auto pb-2 mb-5 -mx-1 px-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {categories.map(cat => {
            const isAll = cat === 'All';
            const style = isAll
              ? { icon: LayoutGrid, soft: 'bg-gray-50', accent: 'text-gray-600' }
              : getCategoryStyle(cat);
            const active = activeCategory === cat;
            const Icon = style.icon;
            return (
              <button
                key={cat}
                onClick={() => onCategoryChange(cat)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 w-16 group"
              >
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                    active
                      ? 'bg-black text-white shadow-md scale-105'
                      : `${style.soft} ${style.accent} group-hover:scale-105`
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-semibold leading-tight text-center ${active ? 'text-black' : 'text-gray-500'}`}>
                  {cat}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center p-3 animate-pulse">
              <div className="w-36 h-36 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-center py-16 px-4">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 mb-3">{error}</p>
          <button
            onClick={onRetry}
            className="text-xs font-bold bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && (
        products.length === 0 ? (
          <div className="text-center py-16 px-4 text-sm text-gray-400">
            {hasAnyProducts
              ? 'No items match your search or filters.'
              : "No hamper items yet — add some rows to the customization_products table to see them here."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isDragging={draggingId === product.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onAdd={onAdd}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function ProductCard({
  product, isDragging, onDragStart, onDragEnd, onAdd, onViewDetails,
}: {
  product: Product;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, p: Product) => void;
  onDragEnd: () => void;
  onAdd: (p: Product) => void;
  onViewDetails: (p: Product) => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, product)}
      onDragEnd={onDragEnd}
      onClick={() => onAdd(product)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd(product);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Add ${product.name} to hamper`}
      className={`group relative flex flex-col items-center justify-center p-3 cursor-grab active:cursor-grabbing transition-transform ${
        isDragging ? 'opacity-40 scale-95' : 'hover:scale-105'
      }`}
    >
      {/* Drag handle hint (desktop only) */}
      <div className="hidden md:flex absolute top-1 left-1 z-20 items-center justify-center w-6 h-6 rounded-md bg-white/80 backdrop-blur text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* "6 dots" trigger — opens the full product overview (image, name,
         description, price, offer, category). stopPropagation so it never
         also fires the card's own click-to-add. */}
      <button
        onClick={e => {
          e.stopPropagation();
          onViewDetails(product);
        }}
        aria-label={`View details for ${product.name}`}
        className="absolute top-1 right-1 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white/90 backdrop-blur text-gray-500 shadow-sm hover:text-black hover:bg-white transition-colors"
      >
        <Grip className="w-3.5 h-3.5" />
      </button>

      {/* Just the photo + floating badges — no card/box chrome. Falls back
         to the emoji-on-gradient tile when no image is set on the row.
         Each badge floats on its own independent, differently-timed loop
         so none of the three ever move in sync. */}
      <div className="relative w-36 h-36 aspect-square shrink-0">
        <div className={`w-36 h-36 aspect-square rounded-full overflow-hidden flex items-center justify-center text-5xl bg-gradient-to-br ${product.gradient} ring-4 ring-white shadow-md`}>
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.name} fill unoptimized className="object-cover rounded-full" />
          ) : (
            <span className="drop-shadow-sm">{product.emoji}</span>
          )}
        </div>

        {/* Red price slip — top-left, bobs up/down with a slight wiggle */}
        <motion.div
          animate={{ y: [0, -4, 0], rotate: [-6, -11, -6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1.5 -left-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md"
        >
          ₹{product.price}
        </motion.div>

        {/* Green name badge — right edge, its own slower drift-and-tilt loop.
           y uses percentage strings (anchored at -50%) so the float
           animation doesn't fight the vertical-centering transform —
           framer-motion drives `transform` directly, so a separate
           Tailwind translate class would be silently overridden otherwise. */}
        <motion.div
          title={product.name}
          animate={{ y: ['-50%', '-42%', '-50%'], rotate: [3, 7, 3] }}
          transition={{ duration: 3.1, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          className="absolute top-1/2 -right-3 z-10 max-w-[76px] truncate bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-md"
        >
          {product.name}
        </motion.div>

        {/* Yellow offer tag — bottom-right, only rendered when the row
           actually has one set (see offer_tag on customization_products);
           its own independent drift loop, timed differently from the
           other two badges so all three stay out of sync. */}
        {product.offerTag && (
          <motion.div
            animate={{ y: [0, 4, 0], rotate: [8, 13, 8] }}
            transition={{ duration: 2.9, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
            className="absolute -bottom-1 -right-2 z-10 bg-yellow-400 text-black text-[9px] font-bold px-2 py-0.5 rounded-full shadow-md"
          >
            {product.offerTag}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   RIGHT COLUMN — Hamper Box (sticky drop zone)
   ════════════════════════════════════════════════════════════════════ */

function HamperBox({
  hamper, currentCapacity, isDropZoneActive,
  onDragOver, onDragLeave, onDrop, onRemove, onDecrement, onIncrement,
  draggingHamperId, dragOverHamperId, isTrashZoneActive,
  onHamperItemDragStart, onHamperItemDragEnd, onHamperItemDragOver, onHamperItemDrop,
  onTrashDragOver, onTrashDragLeave, onTrashDrop,
}: {
  hamper: HamperItem[];
  currentCapacity: number;
  isDropZoneActive: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onRemove: (id: string) => void;
  onDecrement: (id: string) => void;
  onIncrement: (p: Product) => void;
  draggingHamperId: string | null;
  dragOverHamperId: string | null;
  isTrashZoneActive: boolean;
  onHamperItemDragStart: (e: React.DragEvent, productId: string) => void;
  onHamperItemDragEnd: () => void;
  onHamperItemDragOver: (e: React.DragEvent, productId: string) => void;
  onHamperItemDrop: (e: React.DragEvent, productId: string) => void;
  onTrashDragOver: (e: React.DragEvent) => void;
  onTrashDragLeave: () => void;
  onTrashDrop: (e: React.DragEvent) => void;
}) {
  // One visual cell per slot — purely a "how full is this getting" glance,
  // no cap: the grid just grows to fit however many slots are in use.
  const cells = useMemo(() => {
    const filled: Array<{ product: Product; key: string }> = [];
    hamper.forEach(h => {
      for (let i = 0; i < h.product.slots * h.qty; i++) {
        filled.push({ product: h.product, key: `${h.product.id}-${i}` });
      }
    });
    return filled;
  }, [hamper]);

  return (
    <div className="lg:sticky lg:top-24">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`rounded-[2rem] p-5 transition-all ${
          isDropZoneActive
            ? 'bg-amber-50 ring-4 ring-amber-300/50 shadow-lg'
            : 'bg-white shadow-[0_2px_20px_rgba(0,0,0,0.06)] ring-1 ring-black/5'
        }`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-black flex items-center gap-2">
            <span className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-200 to-rose-200 text-amber-800 flex items-center justify-center shadow-sm">
              <PackagePlus className="w-4.5 h-4.5" />
            </span>
            Your Hamper
          </h2>
          <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-black text-white">
            {currentCapacity} slot{currentCapacity === 1 ? '' : 's'}
          </span>
        </div>

        {/* Slot preview — a row of circular thumbnails showing the actual
           product photo for everything currently in the hamper (falls back
           to the emoji-on-gradient tile per item when a row has no image).
           No capped/empty placeholders since there's no maximum; it simply
           grows with what's in the hamper. */}
        {cells.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5 pb-5 border-b border-black/5">
            {cells.map(c => (
              <div
                key={c.key}
                title={c.product.name}
                className={`relative w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm bg-gradient-to-br ${c.product.gradient} ring-2 ring-white shadow-sm`}
              >
                {c.product.imageUrl ? (
                  <Image src={c.product.imageUrl} alt={c.product.name} fill unoptimized className="object-cover" />
                ) : (
                  <span>{c.product.emoji}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Item list — each row is itself draggable: drag to reorder within
           the hamper, or drag onto the trash zone below to remove it. */}
        {hamper.length === 0 ? (
          <div className="text-center py-10 px-2">
            <Gift className="w-7 h-7 text-amber-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {isDropZoneActive ? 'Drop it here!' : 'Drag an item here, or tap + on any card.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {hamper.map(h => (
                <motion.div
                  key={h.product.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}
                >
                  {/* Native HTML5 drag handlers live on this plain div, not
                     the motion.div above — framer-motion's own onDragStart/
                     onDragEnd (its pan-gesture API) have a different,
                     conflicting signature from the native DOM DragEvent. */}
                  <div
                    draggable
                    onDragStart={e => onHamperItemDragStart(e, h.product.id)}
                    onDragEnd={onHamperItemDragEnd}
                    onDragOver={e => onHamperItemDragOver(e, h.product.id)}
                    onDrop={e => onHamperItemDrop(e, h.product.id)}
                    className={`flex items-center gap-3 bg-gray-50/70 rounded-2xl p-2 pr-2.5 cursor-grab active:cursor-grabbing transition-all ${
                      draggingHamperId === h.product.id
                        ? 'opacity-40'
                        : dragOverHamperId === h.product.id
                          ? 'ring-2 ring-black/15 bg-white'
                          : 'hover:bg-gray-100/70'
                    }`}
                  >
                    <GripVertical className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />

                    {/* Actual product photo, falling back to the
                       emoji-on-gradient tile when no image is set. */}
                    <div className={`relative w-11 h-11 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center text-lg bg-gradient-to-br ${h.product.gradient} ring-2 ring-white shadow-sm`}>
                      {h.product.imageUrl ? (
                        <Image src={h.product.imageUrl} alt={h.product.name} fill unoptimized className="object-cover" />
                      ) : (
                        <span>{h.product.emoji}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-black truncate">{h.product.name}</p>
                      <p className="text-[11px] text-gray-400">₹{h.product.price} · {h.product.slots} slot{h.product.slots > 1 ? 's' : ''} each</p>
                    </div>

                    {/* Qty stepper */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => onDecrement(h.product.id)}
                        aria-label={`Remove one ${h.product.name}`}
                        className="w-5 h-5 rounded-full border border-black/15 text-black text-xs flex items-center justify-center hover:bg-white"
                      >
                        –
                      </button>
                      <span className="text-xs font-bold w-4 text-center">{h.qty}</span>
                      <button
                        onClick={() => onIncrement(h.product)}
                        aria-label={`Add one more ${h.product.name}`}
                        className="w-5 h-5 rounded-full border border-black/15 text-black text-xs flex items-center justify-center hover:bg-white"
                      >
                        +
                      </button>
                    </div>

                    {/* Remove entirely */}
                    <button
                      onClick={() => onRemove(h.product.id)}
                      aria-label={`Remove ${h.product.name} from hamper`}
                      className="w-6 h-6 flex-shrink-0 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Trash / drag-to-remove zone — only shown while a hamper item is
           actively being dragged, so it doesn't take up space otherwise. */}
        {draggingHamperId && (
          <div
            onDragOver={onTrashDragOver}
            onDragLeave={onTrashDragLeave}
            onDrop={onTrashDrop}
            className={`mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-3 text-xs font-bold transition-all ${
              isTrashZoneActive
                ? 'border-red-400 bg-red-50 text-red-600 scale-[1.02]'
                : 'border-red-200 bg-red-50/40 text-red-400'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            Drop here to remove
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FOOTER — sticky checkout bar
   ════════════════════════════════════════════════════════════════════ */

function HamperFooter({
  subtotal, currentCapacity, itemCount, onCheckout,
}: {
  subtotal: number;
  currentCapacity: number;
  itemCount: number;
  onCheckout: () => void;
}) {
  const canCheckout = itemCount > 0;

  return (
    <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/8 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex items-center gap-4">
        {/* Slot / item count — informational only, no cap to progress toward */}
        <div className="hidden sm:flex items-center gap-2 flex-1 text-xs text-gray-500">
          <span className="font-bold text-black">{currentCapacity}</span> slot{currentCapacity === 1 ? '' : 's'} ·{' '}
          <span className="font-bold text-black">{itemCount}</span> item{itemCount === 1 ? '' : 's'}
        </div>

        <div className="flex-1 sm:flex-none">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Subtotal</p>
          <p className="font-display text-lg font-bold text-black leading-tight">₹{subtotal.toLocaleString('en-IN')}</p>
        </div>

        <button
          onClick={onCheckout}
          disabled={!canCheckout}
          className="ml-0 sm:ml-auto flex items-center gap-2 bg-black text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          <ShoppingBag className="w-4 h-4" />
          Proceed to Checkout
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   FILTER DRAWER — price range + slots, slide-in from the right
   ════════════════════════════════════════════════════════════════════ */

function FilterDrawer({
  open, onClose, priceBounds, priceRange, onPriceChange, slotsFilter, onToggleSlot, onClear,
}: {
  open: boolean;
  onClose: () => void;
  priceBounds: [number, number];
  priceRange: [number, number];
  onPriceChange: (range: [number, number]) => void;
  slotsFilter: Set<number>;
  onToggleSlot: (n: number) => void;
  onClear: () => void;
}) {
  const [minBound, maxBound] = priceBounds;
  const [minVal, maxVal] = priceRange;
  const slotOptions = [1, 2, 3];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-[70]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed inset-y-0 right-0 w-80 max-w-[90vw] bg-white z-[80] p-6 overflow-y-auto shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold text-black">Filter</h3>
              <button onClick={onClose} aria-label="Close filters" className="text-gray-500 hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Price range */}
            <div className="mb-7">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Price range</p>
              <div className="flex items-center justify-between text-xs font-bold text-black mb-3">
                <span>₹{minVal}</span>
                <span>₹{maxVal}</span>
              </div>
              <div className="relative h-4 flex items-center">
                <div className="absolute inset-x-0 h-1 bg-gray-100 rounded-full" />
                <div
                  className="absolute h-1 bg-black rounded-full"
                  style={{
                    left: maxBound > minBound ? `${((minVal - minBound) / (maxBound - minBound)) * 100}%` : '0%',
                    right: maxBound > minBound ? `${100 - ((maxVal - minBound) / (maxBound - minBound)) * 100}%` : '0%',
                  }}
                />
                <input
                  type="range"
                  min={minBound}
                  max={maxBound}
                  value={minVal}
                  onChange={e => onPriceChange([Math.min(Number(e.target.value), maxVal), maxVal])}
                  style={{ accentColor: '#000' }}
                  className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                />
                <input
                  type="range"
                  min={minBound}
                  max={maxBound}
                  value={maxVal}
                  onChange={e => onPriceChange([minVal, Math.max(Number(e.target.value), minVal)])}
                  style={{ accentColor: '#000' }}
                  className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                />
              </div>
            </div>

            {/* Slots filter */}
            <div className="mb-7">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Slots needed</p>
              <div className="flex flex-wrap gap-2">
                {slotOptions.map(n => {
                  const active = slotsFilter.has(n);
                  return (
                    <button
                      key={n}
                      onClick={() => onToggleSlot(n)}
                      className={`text-[11px] font-bold px-3.5 py-1.5 rounded-full border transition-all ${
                        active ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-black/10 hover:border-black/30'
                      }`}
                    >
                      {n} slot{n > 1 ? 's' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto flex items-center gap-3 pt-4">
              <button
                onClick={onClear}
                className="flex-1 text-xs font-bold border border-black/15 text-black py-2.5 rounded-full hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={onClose}
                className="flex-1 text-xs font-bold bg-black text-white py-2.5 rounded-full hover:bg-gray-900 transition-colors"
              >
                Apply Filter
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════════════
   PRODUCT OVERVIEW MODAL — opened from a card's 6-dot trigger.
   Layout follows the referenced product-card template: circular photo on
   one side, name/description/category/offer/price + add button on the
   other.
   ════════════════════════════════════════════════════════════════════ */

function ProductOverviewModal({
  product, onClose, onAdd,
}: {
  product: Product | null;
  onClose: () => void;
  onAdd: (p: Product) => void;
}) {
  const style = product ? getCategoryStyle(product.category) : null;

  return (
    <AnimatePresence>
      {product && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg sm:max-w-xl overflow-hidden flex flex-col sm:flex-row items-center sm:items-stretch gap-6 p-6 sm:p-7"
            >
              <button
                onClick={onClose}
                aria-label="Close product details"
                className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Photo */}
              <div className="flex-shrink-0 flex items-center justify-center sm:items-start pt-1">
                <div className={`relative w-36 h-36 sm:w-40 sm:h-40 aspect-square rounded-full overflow-hidden flex items-center justify-center text-6xl bg-gradient-to-br ${product.gradient} ring-4 ring-white shadow-md`}>
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} fill unoptimized className="object-cover rounded-full" />
                  ) : (
                    <span className="drop-shadow-sm">{product.emoji}</span>
                  )}
                </div>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 flex flex-col text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mb-2">
                  {style && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.soft} ${style.accent}`}>
                      {product.category}
                    </span>
                  )}
                  {product.offerTag && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-400 text-black">
                      {product.offerTag}
                    </span>
                  )}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {product.slots} slot{product.slots > 1 ? 's' : ''}
                  </span>
                </div>

                <h3 className="font-display text-xl font-bold text-black leading-snug pr-8 sm:pr-0">
                  {product.name}
                </h3>

                {product.description && (
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                    {product.description}
                  </p>
                )}

                <div className="mt-auto pt-5 flex items-center justify-center sm:justify-between gap-4">
                  <span className="font-display text-2xl font-bold text-black">₹{product.price}</span>
                  <button
                    onClick={() => onAdd(product)}
                    className="bg-black text-white text-sm font-bold px-5 py-2.5 rounded-full hover:bg-gray-900 active:scale-95 transition-all"
                  >
                    Add to Hamper
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════════════
   CHECKOUT MODAL — shipping form → real order via
   POST /api/customization-orders. Two steps: the form, then a success
   screen with the order number. Every price shown here is recomputed and
   re-verified server-side before anything is written to the database —
   see the price-integrity note in that route.
   ════════════════════════════════════════════════════════════════════ */

interface CheckoutFormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zip: string;
}

function CheckoutModal({
  open, step, form, errors, onFormChange, subtotal, itemCount,
  placing, placeError, orderNumber, onSubmit, onClose,
}: {
  open: boolean;
  step: 'form' | 'success';
  form: CheckoutFormState;
  errors: Record<string, string>;
  onFormChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  subtotal: number;
  itemCount: number;
  placing: boolean;
  placeError: string;
  orderNumber: string;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const fields: Array<{ name: keyof CheckoutFormState; label: string; type?: string; span?: 'full' | 'half' }> = [
    { name: 'name', label: 'Full name', span: 'full' },
    { name: 'email', label: 'Email', type: 'email', span: 'full' },
    { name: 'phone', label: 'Phone number', type: 'tel', span: 'full' },
    { name: 'address', label: 'Street address', span: 'full' },
    { name: 'city', label: 'City', span: 'half' },
    { name: 'zip', label: 'PIN code', span: 'half' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={step === 'form' && !placing ? onClose : undefined}
            className="fixed inset-0 bg-black/40 z-[75] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
            >
              {step === 'form' ? (
                <>
                  {!placing && (
                    <button
                      onClick={onClose}
                      aria-label="Close checkout"
                      className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-black flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  <h3 className="font-display text-xl font-bold text-black pr-8">Shipping details</h3>
                  <p className="text-xs text-gray-500 mt-1 mb-5">
                    {itemCount} item{itemCount === 1 ? '' : 's'} · Subtotal ₹{subtotal.toLocaleString('en-IN')}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {fields.map(field => (
                      <div key={field.name} className={field.span === 'full' ? 'col-span-2' : 'col-span-1'}>
                        <label htmlFor={`checkout-${field.name}`} className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1 block">
                          {field.label}
                        </label>
                        <input
                          id={`checkout-${field.name}`}
                          name={field.name}
                          type={field.type || 'text'}
                          value={form[field.name]}
                          onChange={onFormChange}
                          disabled={placing}
                          className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-all disabled:opacity-60 ${
                            errors[field.name] ? 'border-red-300 focus:ring-red-100' : 'border-black/10 focus:ring-black/10'
                          }`}
                        />
                        {errors[field.name] && (
                          <p className="text-[11px] text-red-500 mt-1">{errors[field.name]}</p>
                        )}
                      </div>
                    ))}
                  </div>

                  {placeError && (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      {placeError}
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 mt-4">
                    Payment: Cash on Delivery. Final total (including shipping) is confirmed on the next step.
                  </p>

                  <button
                    onClick={onSubmit}
                    disabled={placing}
                    className="mt-4 w-full flex items-center justify-center gap-2 bg-black text-white text-sm font-bold py-3 rounded-full hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {placing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Placing order…
                      </>
                    ) : (
                      <>Place order</>
                    )}
                  </button>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="font-display text-xl font-bold text-black">Order placed!</h3>
                  <p className="text-sm text-gray-500 mt-2">
                    Your tailored hamper is on its way to being packed.
                  </p>
                  {orderNumber && (
                    <p className="text-xs font-bold text-black bg-gray-50 rounded-full px-4 py-2 inline-block mt-4">
                      {orderNumber}
                    </p>
                  )}
                  <button
                    onClick={onClose}
                    className="mt-6 w-full bg-black text-white text-sm font-bold py-3 rounded-full hover:bg-gray-900 active:scale-[0.98] transition-all"
                  >
                    Keep building
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TOASTS
   ════════════════════════════════════════════════════════════════════ */

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed top-20 right-4 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-xs">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 shadow-lg text-xs font-medium backdrop-blur-md ${
              t.tone === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-700'
                : 'bg-amber-50/95 border-amber-200 text-amber-800'
            }`}
          >
            {t.tone === 'error' ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            )}
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
