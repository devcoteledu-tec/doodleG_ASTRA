'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingCart, ArrowRight, ArrowLeft,
  Tag, Truck, Sparkles, Gift,
  Check, Lock, ChevronDown, ChevronUp, X, Loader2, Banknote,
  Wallet, MapPin, XCircle, AlertTriangle, Heart, Store
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { Product, ProductBoxRow, mapProductBoxRow } from '@/lib/products';
import { loadRazorpayScript } from '@/lib/razorpayBrowser';
import { COUPON_CODES } from '@/lib/coupons';

// Note: this list is only used here to show the discount in the UI before
// checkout. The server independently re-validates the coupon code and
// recomputes the discount in /api/orders — this client-side value is
// never trusted for the actual charge.

// ── Online payment (Razorpay) ──
// Replaces the earlier per-provider UPI deep-link flow entirely. That
// approach hit real-world limits (bank first-time-payee/velocity caps —
// see the "exceeded the bank limit" error from testing) and had no way to
// verify a payment actually happened; the app just trusted whatever the
// client claimed. Razorpay Checkout collects payment into the business's
// own verified account and returns a payment id + signature that
// /api/orders independently verifies (signature AND captured amount)
// before ever creating the order — see src/lib/razorpay.ts.
//
// NOTE: because the business isn't yet eligible for Razorpay Route
// (marketplace payment-splitting requires ₹40L+ turnover or an approved
// first-year self-declaration — see conversation history), all online
// payments settle to the single primary Razorpay account for now, not
// split per-provider at checkout time. /api/checkout/payment-breakdown
// and src/lib/paymentBreakdown.ts are kept — they're accurate, tested,
// and useful for a manual "who's owed what" payout report — but are no
// longer wired into the live checkout flow. Revisit once Route-eligible.
type PaymentMethod = 'online' | 'cod';

// Snapshot of a completed order — captured before clearCart() wipes the cart
// context so the success screen can render a full receipt with every detail.
interface OrderSnapshot {
  items: { name: string; quantity: number; price: number; image?: string; providerName?: string; category?: string; color?: string; size?: string }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shipping: number;
  giftWrapCost: number;
  total: number;
  paymentLabel: string;
  address: { name: string; email: string; phone: string; line: string; city: string; zip: string };
  placedAt: string;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  online: 'Razorpay (Online)',
  cod: 'Cash on Delivery',
};

interface RazorpayPaymentResult {
  orderId: string;
  paymentId: string;
  signature: string;
  /** The exact online amount (rupees) this payment was created for — used to
   *  detect a stale payment if the cart/coupon/shipping changes afterwards
   *  and the required online amount no longer matches. */
  amount: number;
}

export default function CartPage() {
  const { state, removeItem, updateQty, clearCart, toggleWishlist, cartCount, subtotal } = useCart();

  const [suggested,     setSuggested]     = useState<Product[]>([]);
  const [couponCode,    setCouponCode]    = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; pct: number } | null>(null);
  const [couponErr,     setCouponErr]     = useState('');
  const [giftWrap,      setGiftWrap]      = useState(false);
  const [checkoutStep,  setCheckoutStep]  = useState(0);
  const [expandSummary, setExpandSummary] = useState(false);

  const [form,      setForm]      = useState({ name: '', email: '', phone: '', address: '', city: '', zip: '' });
  const [formErrors,setFormErrors]= useState<Record<string, string>>({});
  const [placing,   setPlacing]   = useState(false);
  const [placeError,setPlaceError]= useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderSnapshot, setOrderSnapshot] = useState<OrderSnapshot | null>(null);

  // ── Shipping PIN code (Order Summary box) ──
  // This is the single source of truth for the buyer's PIN — the
  // "Zip / Postal Code" field further down in the Shipping Details form is
  // derived from this, not independently entered, so the price shown here
  // always matches the address actually submitted.
  const [shipPincode, setShipPincode] = useState('');
  const [pincodeStatus, setPincodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid' | 'unverifiable'>('idle');
  const [pincodePlace, setPincodePlace] = useState<{ district: string; state: string } | null>(null);
  const pincodeError = shipPincode.trim() === '' ? 'PIN code is required'
    : !/^[1-9][0-9]{5}$/.test(shipPincode) ? 'Enter a valid 6-digit PIN code'
    : undefined;

  interface ShippingLegView { providerId: string; providerName: string; delta: number | null; cost: number; resolved: boolean }
  const [shippingBreakdown, setShippingBreakdown] = useState<{ total: number; legs: ShippingLegView[]; anyUnresolved: boolean } | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Keep the Shipping Details form's zip in sync with the verified PIN box
  // above — see the comment on shipPincode.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
    setForm(f => (f.zip === shipPincode ? f : { ...f, zip: shipPincode }));
  }, [shipPincode]);

  // Live GPO / district / state lookup via India Post (same route used at
  // signup) — confirms the PIN is real and shows the buyer what it
  // resolved to before they commit to it.
  useEffect(() => {
    if (!/^\d{6}$/.test(shipPincode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setPincodeStatus('idle');
       
      setPincodePlace(null);
      return;
    }
     
    setPincodeStatus('checking');
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/verify-pincode?pincode=${shipPincode}`);
        const data = await res.json();
        if (!res.ok) { setPincodeStatus('unverifiable'); setPincodePlace(null); return; }
        if (data.valid) { setPincodeStatus('valid'); setPincodePlace({ district: data.district, state: data.state }); }
        else { setPincodeStatus('invalid'); setPincodePlace(null); }
      } catch {
         
        setPincodeStatus('unverifiable');
         
        setPincodePlace(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [shipPincode]);

  // Live per-provider shipping estimate — recomputed whenever the PIN
  // format is valid or the cart contents change. Uses the exact same
  // computeCartShipping() the order route charges from (see
  // /api/cart/shipping-estimate), so this number is what actually gets
  // charged, not a separate guess.
  // One entry per cart item (not deduped) — null for items with no
  // provider_id. computeCartShipping groups these server-side; sending the
  // full list here (matching what the order route sends) keeps the live
  // estimate and the actual charge in agreement.
  const itemProviderIds = React.useMemo(
    () => state.items.map(i => i.product.providerId ?? null),
    [state.items]
  );
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(shipPincode) || itemProviderIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setShippingBreakdown(null);
      return;
    }
     
    setShippingLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/cart/shipping-estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pincode: shipPincode, providerIds: itemProviderIds }),
        });
        const data = await res.json();
        if (res.ok) setShippingBreakdown({ total: data.totalShipping, legs: data.legs, anyUnresolved: data.anyUnresolved });
        else setShippingBreakdown(null);
      } catch {
         
        setShippingBreakdown(null);
      } finally {
         
        setShippingLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [shipPincode, itemProviderIds]);


  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [checkoutKey, setCheckoutKey] = useState('');
  const [recoveringPayment, setRecoveringPayment] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setCheckoutKey(crypto.randomUUID()));
    const attemptId = sessionStorage.getItem('doodleg-checkout-attempt');
    if (!attemptId) return;
    queueMicrotask(() => setRecoveringPayment(true));
    fetch(`/api/checkout/status?attemptId=${encodeURIComponent(attemptId)}`)
      .then(async res => {
        const result = await res.json();
        if (!res.ok) { setPlaceError(result.error || 'Check your previous payment before paying again.'); return; }
        if (result.state === 'completed') {
          sessionStorage.removeItem('doodleg-checkout-attempt');
          window.location.assign('/orders');
        } else if (result.state === 'needs_review') {
          setPlaceError('Payment received. Contact support with checkout reference ' + attemptId + '. Do not pay again.');
        } else {
          setPlaceError('A previous checkout is pending. If you completed payment, contact support with reference ' + attemptId + ' before paying again.');
        }
      })
      .catch(() => setPlaceError('Could not check your previous payment. Contact support before paying again.'))
      .finally(() => setRecoveringPayment(false));
  }, []);


  // ── Per-product payment option (COD-only / Prepaid-only / Advance %) ──
  // Providers can lock a specific product to Cash-on-Delivery only, prepaid
  // only, or a partial advance (see src/lib/paymentPlan.ts). paymentPlan is
  // a read-only preview of how much of THIS cart must be paid online now vs
  // collected as COD — refetched whenever the cart, coupon, gift-wrap,
  // shipping PIN, or the shopper's online/COD toggle changes. It never
  // charges anything by itself; it just tells the UI what to show and what
  // handlePayOnline/handleCheckout need to satisfy.
  interface PaymentPlanPreview {
    total: number;
    onlineAmount: number;
    codAmount: number;
    requiresSplit: boolean;
    hasFixedOnlineItems: boolean;
    hasFixedCodItems: boolean;
    hasFlexibleItems: boolean;
  }
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanPreview | null>(null);
  const [paymentPlanLoading, setPaymentPlanLoading] = useState(false);

  // ── Razorpay online payment state ──
  // razorpayResult is set only after Checkout.js's `handler` callback
  // fires with a real payment id + signature — that's the one and only
  // signal "Pay Online" actually succeeded from the client's point of
  // view. It still gets independently re-verified server-side in
  // /api/orders before the order is created (see src/lib/razorpay.ts) —
  // this is just what gates the "Place Order" button client-side and
  // what gets sent along in the order payload.
  const [razorpayResult,  setRazorpayResult]  = useState<RazorpayPaymentResult | null>(null);
  const [payingOnline,    setPayingOnline]    = useState(false);
  const [payOnlineError,  setPayOnlineError]  = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        if (data.products) {
           
          setSuggested((data.products as ProductBoxRow[]).slice(0, 3).map(mapProductBoxRow));
        }
      })
      .catch(() => {});
  }, []);

  const displayPrice = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  const applyCoupon = () => {
    setCouponErr('');
    const pct = COUPON_CODES[couponCode.toUpperCase()];
    if (!pct) { setCouponErr('Invalid code. Try DOODLEG20, GIFT10, or FIRSTGIFT.'); return; }
    setAppliedCoupon({ code: couponCode.toUpperCase(), pct });
    setCouponCode('');
  };

  const discount     = appliedCoupon ? Math.round(subtotal * appliedCoupon.pct / 100) : 0;
  // Mirrors SHIPPING_FALLBACK_COST in src/lib/shipping.ts — shown before a
  // valid PIN is entered/resolved, or while items have no provider at all.
  const SHIPPING_FALLBACK_DISPLAY = 150;
  const shipping     = shippingBreakdown ? shippingBreakdown.total : SHIPPING_FALLBACK_DISPLAY;
  const giftWrapCost = giftWrap ? 400 : 0;
  const total        = subtotal - discount + shipping + giftWrapCost;

  // Whole cart is locked to one side by seller-set payment terms, with no
  // COD-or-online flexibility anywhere — disables the other button rather
  // than letting the shopper pick something that can't apply.
  const cartIsFullyOnlineOnly = Boolean(
    paymentPlan && paymentPlan.hasFixedOnlineItems && !paymentPlan.hasFixedCodItems && !paymentPlan.hasFlexibleItems && paymentPlan.codAmount === 0
  );
  const cartIsFullyCodOnly = Boolean(
    paymentPlan && paymentPlan.hasFixedCodItems && !paymentPlan.hasFixedOnlineItems && !paymentPlan.hasFlexibleItems && paymentPlan.onlineAmount === 0
  );

  // ── Fetch the online/COD split preview ──
  // Recomputed server-side whenever the cart contents, coupon, gift-wrap,
  // shipping PIN, or the shopper's own COD/online toggle change. A valid PIN
  // is required for pricing (matches the shipping-estimate effect above), so
  // this waits for the same condition. Debounced the same way.
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(shipPincode) || state.items.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setPaymentPlan(null);
      return;
    }
     
    setPaymentPlanLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/checkout/payment-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: state.items.map(i => ({
              productId:     i.product.id,
              selectedColor: i.selectedColor,
              selectedSize:  i.selectedSize ?? null,
              quantity:      i.quantity,
            })),
            couponCode: appliedCoupon?.code ?? null,
            giftWrap,
            zip: shipPincode,
            flexibleChoice: paymentMethod || 'cod',
          }),
        });
        const data = await res.json();
        if (res.ok) {
           
          setPaymentPlan({
            total: data.total,
            onlineAmount: data.onlineAmount,
            codAmount: data.codAmount,
            requiresSplit: data.requiresSplit,
            hasFixedOnlineItems: data.hasFixedOnlineItems,
            hasFixedCodItems: data.hasFixedCodItems,
            hasFlexibleItems: data.hasFlexibleItems,
          });
        } else {
           
          setPaymentPlan(null);
        }
      } catch {
         
        setPaymentPlan(null);
      } finally {
         
        setPaymentPlanLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [shipPincode, state.items, appliedCoupon, giftWrap, paymentMethod]);

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())           errs.name    = 'Full name is required';
    if (!form.email.includes('@'))   errs.email   = 'Valid email required';
    if (!form.phone.trim())          errs.phone   = 'Phone number is required';
    if (!form.address.trim())        errs.address = 'Address is required';
    if (!form.city.trim())           errs.city    = 'City is required';
    if (pincodeError)                errs.zip     = pincodeError;
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Kicks off "Pay Online": prices the cart server-side, creates a Razorpay
  // Order for the exact amount that needs to be paid online right now (the
  // full total, unless some items are Cash-on-Delivery-only or a partial
  // advance — see src/lib/paymentPlan.ts), then opens Razorpay's own
  // Checkout modal. On success, stores the payment id + signature (verified
  // again, for real, in /api/orders) and marks the payment method as chosen.
  // If the shopper closes the Razorpay modal without paying, nothing is
  // recorded and they're free to retry.
  const handlePayOnline = async () => {
    if (!validateForm() || !checkoutKey || recoveringPayment) return;
    if (sessionStorage.getItem('doodleg-checkout-attempt')) {
      window.location.assign('/checkout/recover');
      return;
    }
    setPayingOnline(true);
    setPayOnlineError('');
    setPlaceError('');
    try {
      const [orderRes] = await Promise.all([
        fetch('/api/checkout/razorpay-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: state.items.map(i => ({
              productId:     i.product.id,
              selectedColor: i.selectedColor,
              selectedSize:  i.selectedSize ?? null,
              quantity:      i.quantity,
            })),
            couponCode: appliedCoupon?.code ?? null,
            giftWrap,
            shipping: { ...form, zip: shipPincode, country: 'India' },
            idempotencyKey: checkoutKey,
            // Clicking "Pay Online" means the shopper wants any flexible
            // (COD-or-online) items paid online too, not just the items
            // whose provider requires it.
            flexibleChoice: 'online',
          }),
        }),
        loadRazorpayScript(),
      ]);
      const orderData = await orderRes.json();
      if (!orderRes.ok || orderData.error) {
        setPayOnlineError(orderData.error || 'Could not start payment. Please try again.');
        setPayingOnline(false);
        return;
      }
      if (!window.Razorpay) {
        setPayOnlineError('Could not load the payment window. Please check your connection and try again.');
        setPayingOnline(false);
        return;
      }

      sessionStorage.setItem('doodleg-checkout-attempt', orderData.attemptId);
      const razorpayCheckout = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        order_id: orderData.orderId,
        name: 'Doodle G',
        description: orderData.codAmount > 0
          ? `Doodle G order — ₹${orderData.codAmount} due as Cash on Delivery`
          : 'Doodle G order payment',
        prefill: { name: form.name, email: form.email, contact: form.phone },
        theme: { color: '#000000' },
        handler: async (response) => {
          setRazorpayResult({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            amount: orderData.onlineAmount,
          });
          setPaymentMethod('online');
          try {
            const saved = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay: { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature } }) });
            const result = await saved.json();
            if (result.success) {
              sessionStorage.removeItem('doodleg-checkout-attempt');
              clearCart();
              window.location.assign('/orders');
            } else setPlaceError(result.error || 'Payment is processing. Refresh to check status; do not pay again.');
          } catch { setPlaceError('Payment is processing. Refresh to recover your order; do not pay again.'); }
          finally { setPayingOnline(false); }
        },
        modal: {
          // Fires when the shopper closes the Razorpay modal without
          // completing payment — not an error, just means they didn't pay.
          ondismiss: () => setPayingOnline(false),
        },
      });
      razorpayCheckout.open();
    } catch {
      setPayOnlineError('Network error while starting payment. Please try again.');
      setPayingOnline(false);
    }
  };

  const handleCheckout = async () => {
    if (!validateForm()) return;

    const requiresOnline = (paymentPlan?.onlineAmount ?? 0) > 0;
    const onlinePaid = Boolean(razorpayResult && paymentPlan && razorpayResult.amount === paymentPlan.onlineAmount);

    if (requiresOnline && !onlinePaid) {
      setPlaceError(
        paymentPlan
          ? `Please pay ₹${paymentPlan.onlineAmount} online to continue — some items in your cart require online payment.`
          : 'Please complete payment before placing your order.'
      );
      return;
    }
    if (!requiresOnline && !paymentMethod) {
      setPlaceError('Please choose a payment method — Pay Online or Cash on Delivery.');
      return;
    }

    setPlacing(true);
    setPlaceError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping: {
            name:    form.name,
            email:   form.email,
            phone:   form.phone,
            address: form.address,
            city:    form.city,
            zip:     form.zip,
            country: 'India',
          },
          items: state.items.map(i => ({
            productId:     i.product.id,
            selectedColor: i.selectedColor,
            selectedSize:  i.selectedSize ?? null,
            quantity:      i.quantity,
          })),
          couponCode:  appliedCoupon?.code ?? null,
          giftWrap,
          paymentMethod: paymentMethod
            ? PAYMENT_METHOD_LABELS[paymentMethod]
            : (requiresOnline ? 'Razorpay (Online)' : 'Cash on Delivery'),
          flexibleChoice: paymentMethod || 'cod',
          idempotencyKey: checkoutKey,
          ...(onlinePaid && razorpayResult ? { razorpay: razorpayResult } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setPlaceError(data.error || 'Failed to place order. Please try again.');
        return;
      }
      setOrderNumber(data.orderNumber ?? '');
      setOrderSnapshot({
        items: state.items.map(i => ({
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.price,
          image: i.product.images?.[0],
          providerName: i.product.providerName,
          category: i.product.category,
          color: i.selectedColor,
          size: i.selectedSize,
        })),
        subtotal,
        discount,
        couponCode: appliedCoupon?.code ?? null,
        shipping,
        giftWrapCost,
        total,
        paymentLabel: paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] : 'N/A',
        address: { name: form.name, email: form.email, phone: form.phone, line: form.address, city: form.city, zip: form.zip },
        placedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      });
      clearCart();
      setCheckoutStep(2);
    } catch {
      setPlaceError('Network error. Please check your connection and try again.');
    } finally {
      setPlacing(false);
    }
  };
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionStorage.getItem('doodleg-checkout-attempt')) setCheckoutKey(crypto.randomUUID());
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setFormErrors(fe => ({ ...fe, [e.target.name]: '' }));
  };

  /* ── Success Screen ── */
  if (checkoutStep === 2) {
    const snap = orderSnapshot;
    const addr = snap?.address ?? { name: form.name, email: form.email, phone: form.phone, line: form.address, city: form.city, zip: form.zip };
    const hasAddr = !!(addr.line || addr.city);

    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <ShopNav cartCount={0} />
        <div className="flex-1 flex justify-center px-4 py-10 md:py-16">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-lg space-y-6"
          >
            {/* ── Header ── */}
            <div className="text-center space-y-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 15 }}
                className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto shadow-lg"
              >
                <Check className="w-10 h-10 text-white" strokeWidth={2.5} />
              </motion.div>
              <h1 className="font-display text-3xl font-bold text-gray-900">Order Confirmed</h1>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Thank you{addr.name ? `, ${addr.name.split(' ')[0]}` : ''}! Your curated surprise is being prepared. We&apos;ll send updates to{' '}
                <span className="text-black font-semibold">{addr.email || 'your inbox'}</span>.
              </p>
            </div>

            {/* ── Receipt Card ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

              {/* Order ID + Date + Status bar */}
              <div className="bg-gray-900 text-white px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">Order</p>
                  <p className="font-mono text-sm font-bold tracking-wide">{orderNumber || '—'}</p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1">Confirmed</span>
                  <p className="text-[11px] text-gray-400">{snap?.placedAt || new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                </div>
              </div>

              {/* Items */}
              {snap && snap.items.length > 0 && (
                <div className="px-5 py-4 space-y-3 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Items ({snap.items.reduce((sum, i) => sum + i.quantity, 0)})
                  </p>
                  {snap.items.map((item, idx) => (
                    <motion.div
                      key={`${item.name}-${item.color}-${item.size}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + idx * 0.08 }}
                      className="flex items-center gap-3"
                    >
                      <div className="relative w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} fill unoptimized className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300 text-lg">📦</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[11px] text-gray-400">
                          {item.providerName && <span>{item.providerName}</span>}
                          {item.color && <span className="flex items-center gap-1">• {item.color}</span>}
                          {item.size && <span>• Size {item.size}</span>}
                          {item.quantity > 1 && <span>• Qty {item.quantity}</span>}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-gray-900 flex-shrink-0 tabular-nums">
                        {displayPrice(item.price * item.quantity)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Price Breakdown */}
              <div className="px-5 py-4 space-y-2 border-b border-gray-100 text-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Summary</p>
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{displayPrice(snap?.subtotal ?? subtotal)}</span>
                </div>
                {(snap?.discount ?? discount) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount{snap?.couponCode ? ` (${snap.couponCode})` : ''}</span>
                    <span className="tabular-nums">−{displayPrice(snap?.discount ?? discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span className="tabular-nums">
                    {(snap?.shipping ?? shipping) === 0
                      ? <span className="text-emerald-600 font-medium">Free</span>
                      : displayPrice(snap?.shipping ?? shipping)}
                  </span>
                </div>
                {(snap?.giftWrapCost ?? giftWrapCost) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Gift Wrap 🎁</span>
                    <span className="tabular-nums">{displayPrice(snap?.giftWrapCost ?? giftWrapCost)}</span>
                  </div>
                )}
                <div className="border-t border-dashed border-gray-200 pt-2.5 mt-1 flex justify-between font-bold text-base">
                  <span className="text-gray-900">Total Paid</span>
                  <span className="text-black tabular-nums">{displayPrice(snap?.total ?? total)}</span>
                </div>
              </div>

              {/* Shipping Address + Payment — stacks on narrow mobile */}
              <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {hasAddr && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Delivering To</p>
                    <p className="font-semibold text-gray-900">{addr.name}</p>
                    <p className="text-gray-500 leading-relaxed mt-0.5">
                      {addr.line}
                      {addr.city && <><br />{addr.city}{addr.zip ? ` – ${addr.zip}` : ''}</>}
                    </p>
                    {addr.phone && <p className="text-gray-500 mt-1">📞 {addr.phone}</p>}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Payment</p>
                  <p className="font-semibold text-gray-900">{snap?.paymentLabel || 'N/A'}</p>
                  {addr.email && <p className="text-gray-500 mt-1">✉️ {addr.email}</p>}
                </div>
              </div>
            </div>

            {/* ── Actions ── */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Link href="/shop" className="bg-black text-white font-bold px-6 py-3 rounded-xl hover:bg-gray-900 transition-all text-sm flex items-center justify-center gap-2 shadow-sm">
                Continue Shopping <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/" className="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-all text-sm text-center">
                Go to Hub
              </Link>
            </div>
          </motion.div>
        </div>
        <ShopFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      {/* Breadcrumb */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center gap-2 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
          <ChevronDown className="w-3 h-3 -rotate-90" />
          <Link href="/shop" className="hover:text-gray-900 transition-colors">Shop</Link>
          <ChevronDown className="w-3 h-3 -rotate-90" />
          <span className="text-gray-900 font-semibold">Cart</span>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto px-4 md:px-8 py-10 w-full">

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {['Cart', 'Details', 'Payment'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 ${i <= checkoutStep ? 'text-black' : 'text-gray-300'}`}>
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                  i < checkoutStep  ? 'bg-black border-black text-white' :
                  i === checkoutStep ? 'border-black text-black'          :
                                       'border-gray-200 text-gray-300'
                }`}>
                  {i < checkoutStep ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{s}</span>
              </div>
              {i < 2 && (
                <div className={`flex-1 max-w-16 h-px transition-all ${i < checkoutStep ? 'bg-black' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* ═══ EMPTY STATE ═══ */}
        {state.items.length === 0 ? (
          <div className="text-center py-24 space-y-5">
            <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center mx-auto">
              <ShoppingCart className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="font-display text-3xl font-bold text-gray-900">Your cart is empty</h2>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Add a curated gift package to get started. Every gift in our collection tells a beautiful story.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/shop" className="bg-black text-white font-bold px-6 py-3 rounded-xl hover:bg-gray-900 transition-all text-sm flex items-center gap-2 shadow-sm">
                Browse Collection <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/onboarding" className="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-all text-sm">
                Get AI Curation
              </Link>
            </div>
            <div className="pt-10 space-y-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Trending Picks for You</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                {suggested.map(p => (
                  <Link key={p.id} href={`/shop/${p.slug || p.id}`}>
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 hover:border-black/15 transition-all group shadow-sm hover:shadow-md">
                      <div className={`h-24 rounded-xl bg-gradient-to-br ${p.gradient} flex items-center justify-center text-4xl mb-3`}>
                        {p.emoji}
                      </div>
                      <p className="text-xs font-semibold text-gray-900 group-hover:text-black transition-colors line-clamp-1">{p.name}</p>
                      <p className="text-black font-bold text-sm mt-1">{displayPrice(p.price)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

        /* ═══ CART VIEW ═══ */
        ) : checkoutStep === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* ── Left Column: Delivery check + Items ── */}
            <div className="lg:col-span-2 space-y-0">

              {/* Delivery check bar */}
              <div className="bg-white rounded-t-2xl border border-gray-100 px-5 py-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-400" /> Check delivery time &amp; services
                </p>
                <button
                  onClick={() => document.getElementById('cart-pin-input')?.focus()}
                  className="text-xs font-bold text-black border border-black px-3 py-1.5 rounded-lg hover:bg-black hover:text-white transition-all"
                >
                  ENTER PIN CODE
                </button>
              </div>

              {/* Item count header */}
              <div className="bg-gray-50 border-x border-gray-100 px-5 py-3 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">
                  <Check className="w-4 h-4 inline mr-1 text-emerald-600" />
                  {cartCount}/{cartCount} ITEMS SELECTED
                </p>
                <div className="flex items-center gap-4">
                  <button onClick={clearCart} className="text-xs text-gray-500 hover:text-red-500 font-semibold uppercase tracking-wider transition-colors">
                    Remove All
                  </button>
                </div>
              </div>

              {/* Cart items */}
              <AnimatePresence>
                {state.items.map((item, idx) => (
                  <motion.div
                    key={item.product.id + item.selectedColor + (item.selectedSize || '')}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    className="bg-white border-x border-b border-gray-100 px-5 py-5 flex gap-5 group hover:bg-gray-50/50 transition-colors relative"
                  >
                    {/* Remove (X) corner */}
                    <button
                      onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                      className="absolute top-3 right-3 p-1 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Product image */}
                    <Link href={`/shop/${item.product.slug || item.product.id}`} className="flex-shrink-0">
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        className="relative w-28 h-28 md:w-32 md:h-32 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center overflow-hidden border border-gray-100"
                      >
                        {item.product.images?.[0] ? (
                          <Image src={item.product.images[0]} alt={item.product.name} fill unoptimized className="object-cover" />
                        ) : (
                          <span className="text-5xl">{item.product.emoji}</span>
                        )}
                      </motion.div>
                    </Link>

                    {/* Details */}
                    <div className="flex-1 min-w-0 space-y-1.5 pr-6">
                      {item.product.providerName && (
                        <p className="text-xs font-bold text-gray-500 flex items-center gap-1">
                          <Store className="w-3 h-3" /> {item.product.providerName}
                        </p>
                      )}
                      <Link href={`/shop/${item.product.slug || item.product.id}`}>
                        <h3 className="font-semibold text-gray-900 hover:text-black transition-colors text-sm md:text-base truncate">
                          {item.product.name}
                        </h3>
                      </Link>
                      <p className="text-xs text-gray-400">{item.product.category}</p>

                      {/* Color + Size + Qty inline */}
                      <div className="flex items-center gap-4 pt-1 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span>Colour:</span>
                          <div className="w-4 h-4 rounded-full border border-gray-300 shadow-sm" style={{ background: item.selectedColor }} />
                        </div>
                        {item.selectedSize && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span>Size:</span>
                            <span className="font-semibold text-gray-900 border border-gray-200 rounded px-1.5 py-0.5">{item.selectedSize}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span>Qty:</span>
                          <select
                            value={item.quantity}
                            onChange={e => updateQty(item.product.id, item.selectedColor, Number(e.target.value), item.selectedSize)}
                            className="bg-white border border-gray-200 rounded-md px-2 py-0.5 text-sm font-semibold text-gray-900 focus:outline-none focus:border-black cursor-pointer"
                          >
                            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="flex items-baseline gap-2 pt-1">
                        <span className="text-base font-bold text-gray-900">{displayPrice(item.product.price * item.quantity)}</span>
                        {item.product.originalPrice && (
                          <>
                            <span className="text-xs text-gray-400 line-through">{displayPrice(item.product.originalPrice * item.quantity)}</span>
                            <span className="text-xs font-bold text-emerald-600">
                              {displayPrice((item.product.originalPrice - item.product.price) * item.quantity)} OFF
                            </span>
                          </>
                        )}
                      </div>

                      {/* Action links */}
                      <div className="flex items-center gap-4 pt-2 border-t border-gray-100 mt-2">
                        <button
                          onClick={() => removeItem(item.product.id, item.selectedColor, item.selectedSize)}
                          className="text-xs font-semibold text-gray-500 hover:text-red-500 uppercase tracking-wider transition-colors"
                        >
                          Remove
                        </button>
                        <span className="text-gray-200">|</span>
                        <button
                          onClick={() => {
                            toggleWishlist(item.product.id);
                            removeItem(item.product.id, item.selectedColor, item.selectedSize);
                          }}
                          className="text-xs font-semibold text-gray-500 hover:text-black uppercase tracking-wider transition-colors flex items-center gap-1"
                        >
                          <Heart className="w-3 h-3" /> Move to Wishlist
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Gift wrap */}
              <motion.div
                whileHover={{ scale: 1.005 }}
                onClick={() => setGiftWrap(p => !p)}
                className={`border-x border-b border-gray-100 rounded-b-2xl px-5 py-4 flex items-center gap-4 cursor-pointer transition-all ${
                  giftWrap ? 'bg-amber-50/50' : 'bg-white hover:bg-gray-50/50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  giftWrap ? 'bg-black text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                  <Gift className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Premium Gift Wrapping</p>
                  <p className="text-xs text-gray-400">Luxury tissue paper, satin ribbon &amp; personalised tag (+₹400)</p>
                </div>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  giftWrap ? 'bg-black border-black' : 'border-gray-300'
                }`}>
                  {giftWrap && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
              </motion.div>

              <Link href="/shop" className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors pt-4">
                <ArrowLeft className="w-4 h-4" /> Continue Shopping
              </Link>
            </div>

            {/* ── Right Column: Coupons + Price Details ── */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                {/* Coupons section */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <Tag className="w-4 h-4" /> Coupons
                  </h2>
                  {appliedCoupon ? (
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                      <span className="text-sm text-emerald-700 font-semibold flex items-center gap-2">
                        <Check className="w-4 h-4" /> {appliedCoupon.code} −{appliedCoupon.pct}%
                      </span>
                      <button onClick={() => setAppliedCoupon(null)} className="text-emerald-500 hover:text-emerald-700">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={e => { setCouponCode(e.target.value); setCouponErr(''); }}
                          onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                          placeholder="Apply Coupons"
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-black/40"
                        />
                        <button onClick={applyCoupon} className="bg-black text-white font-bold px-4 rounded-xl text-xs hover:bg-gray-900 transition-all">
                          APPLY
                        </button>
                      </div>
                      {couponErr && <p className="text-xs text-red-500">{couponErr}</p>}
                      <p className="text-[10px] text-gray-400">Try: DOODLEG20 · GIFT10 · FIRSTGIFT</p>
                    </div>
                  )}
                </div>

                {/* Shipping PIN code */}
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Shipping PIN Code *
                  </label>
                  <div className="relative">
                    <input
                      id="cart-pin-input"
                      type="text"
                      inputMode="numeric"
                      value={shipPincode}
                      onChange={e => setShipPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit PIN code"
                      className={`w-full bg-gray-50 border rounded-xl pl-3 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
                        shipPincode && pincodeStatus === 'invalid' ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-black/40'
                      }`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      {pincodeStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {pincodeStatus === 'valid' && <Check className="w-4 h-4 text-emerald-600" />}
                      {pincodeStatus === 'invalid' && <XCircle className="w-4 h-4 text-red-500" />}
                    </span>
                  </div>
                  {pincodeStatus === 'valid' && pincodePlace && (
                    <p className="text-xs text-emerald-600">{pincodePlace.district}, {pincodePlace.state}</p>
                  )}
                  {pincodeStatus === 'invalid' && (
                    <p className="text-xs text-red-500">That PIN code doesn&apos;t exist. Please check it.</p>
                  )}
                  {pincodeStatus === 'unverifiable' && (
                    <p className="text-xs text-gray-400">Couldn&apos;t verify right now — you can still continue.</p>
                  )}
                </div>
              </div>

              {/* PRICE DETAILS — Myntra-style breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                  Price Details ({cartCount} {cartCount === 1 ? 'Item' : 'Items'})
                </h2>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Total MRP</span>
                    <span className="text-gray-900">{displayPrice(state.items.reduce((s, i) => s + (i.product.originalPrice || i.product.price) * i.quantity, 0))}</span>
                  </div>
                  {state.items.some(i => i.product.originalPrice) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Discount on MRP</span>
                      <span className="text-emerald-600 font-medium">
                        −{displayPrice(state.items.reduce((s, i) => s + ((i.product.originalPrice || i.product.price) - i.product.price) * i.quantity, 0))}
                      </span>
                    </div>
                  )}
                  {appliedCoupon && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Coupon Discount</span>
                      <span className="text-emerald-600 font-medium">−{displayPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Shipping</span>
                    <span className={shipping === 0 ? 'text-emerald-600 font-semibold' : 'text-gray-900'}>
                      {shipping === 0 ? 'FREE' : displayPrice(shipping)}
                    </span>
                  </div>
                  {shippingBreakdown && shippingBreakdown.legs.length > 1 && (
                    <div className="pl-4 space-y-1">
                      {shippingBreakdown.legs.map(leg => (
                        <div key={leg.providerId} className="flex justify-between text-[11px] text-gray-400">
                          <span>{leg.providerName}</span>
                          <span>{displayPrice(Math.round(leg.cost))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {shippingBreakdown?.anyUnresolved && (
                    <p className="text-[11px] text-amber-600 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      Standard rate used for some items — enter PIN for exact estimate.
                    </p>
                  )}
                  {giftWrapCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Gift Wrapping</span>
                      <span className="text-gray-900">{displayPrice(giftWrapCost)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-dashed border-gray-200 pt-3 flex justify-between">
                  <span className="font-bold text-gray-900">Total Amount</span>
                  <div className="text-right">
                    <p className="font-bold text-xl text-black">{displayPrice(total)}</p>
                    {shippingLoading && <p className="text-[10px] text-gray-400">Updating…</p>}
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { if (!pincodeError) setCheckoutStep(1); }}
                  disabled={Boolean(pincodeError)}
                  className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-900 transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Lock className="w-4 h-4" /> PLACE ORDER
                </motion.button>
                {pincodeError && (
                  <p className="text-center text-xs text-amber-600">Enter your shipping PIN code to continue.</p>
                )}
              </div>

              {/* AI tip */}
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-black" />
                  <span className="text-xs font-semibold text-black">doodle_G Tip</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Pair your order with a custom AI-written card. Let Gemini draft something unforgettable for your loved one.
                </p>
                <Link href="/" className="text-xs text-black font-semibold hover:underline flex items-center gap-1">
                  Open Card Writer <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

        /* ═══ CHECKOUT FORM ═══ */
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <button onClick={() => setCheckoutStep(0)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Cart
              </button>

              {/* Shipping Form */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                <h2 className="font-display text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5" /> Shipping Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: 'name',    label: 'Full Name',          placeholder: 'Alex Mercer',        col: 'md:col-span-2' },
                    { name: 'email',   label: 'Email Address',      placeholder: 'alex@example.com' },
                    { name: 'phone',   label: 'Phone Number',        placeholder: '+91 98765 43210' },
                    { name: 'address', label: 'Street Address',     placeholder: '123 Sentiment Lane', col: 'md:col-span-2' },
                    { name: 'city',    label: 'City',               placeholder: 'New York' },
                  ].map(field => (
                    <div key={field.name} className={`space-y-1.5 ${field.col || ''}`}>
                      <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">{field.label}</label>
                      <input
                        name={field.name}
                        value={form[field.name as keyof typeof form]}
                        onChange={handleFormChange}
                        placeholder={field.placeholder}
                        className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none transition-all ${
                          formErrors[field.name]
                            ? 'border-red-300 focus:border-red-400'
                            : 'border-gray-200 focus:border-black/40'
                        }`}
                      />
                      {formErrors[field.name] && <p className="text-xs text-red-500">{formErrors[field.name]}</p>}
                    </div>
                  ))}

                  {/* PIN code is read-only here — it's the exact value entered
                      and verified in the Order Summary box above (single
                      source of truth, so the shipping cost shown always
                      matches the address actually submitted). */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      PIN Code <span className="normal-case text-gray-300">(from Order Summary)</span>
                    </label>
                    <input
                      name="zip"
                      value={form.zip}
                      readOnly
                      placeholder="Enter above in Order Summary"
                      className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-not-allowed"
                    />
                    {pincodeStatus === 'valid' && pincodePlace ? (
                      <p className="text-xs text-emerald-600">{pincodePlace.district}, {pincodePlace.state}</p>
                    ) : formErrors.zip ? (
                      <p className="text-xs text-red-500">{formErrors.zip}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Payment Method — Pay Online (Razorpay) or Cash on Delivery */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <h2 className="font-display text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Wallet className="w-5 h-5" /> Payment Method
                </h2>

                {/* Seller-set payment terms note — shown whenever any item in
                    the cart isn't a plain "either COD or online" product
                    (payment_option = 'both'). The actual required split is
                    always enforced server-side regardless of what's picked
                    below; this is purely informational. */}
                {paymentPlanLoading && !paymentPlan && (
                  <p className="text-[11px] text-gray-400">Checking payment terms…</p>
                )}
                {paymentPlan && (paymentPlan.hasFixedOnlineItems || paymentPlan.hasFixedCodItems) && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {paymentPlan.requiresSplit ? (
                      <span>
                        Some items in your cart have seller-set payment terms — you&apos;ll pay{' '}
                        <span className="font-bold">{displayPrice(paymentPlan.onlineAmount)}</span> online now and{' '}
                        <span className="font-bold">{displayPrice(paymentPlan.codAmount)}</span> will be collected as Cash on Delivery.
                      </span>
                    ) : paymentPlan.hasFixedOnlineItems ? (
                      <span>One or more items require prepaid / advance payment — this order must be paid online.</span>
                    ) : (
                      <span>One or more items are Cash on Delivery only.</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Pay Online (Razorpay) */}
                  <button
                    type="button"
                    onClick={handlePayOnline}
                    disabled={payingOnline || cartIsFullyCodOnly}
                    title={cartIsFullyCodOnly ? 'This order is Cash on Delivery only.' : undefined}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      paymentMethod === 'online' ? 'border-black bg-black/[0.03]' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {paymentMethod === 'online' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                    <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
                      {payingOnline ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Wallet className="w-5 h-5 text-white" />}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {paymentMethod === 'online'
                        ? 'Paid Online'
                        : payingOnline
                        ? 'Opening…'
                        : paymentPlan && paymentPlan.onlineAmount > 0 && paymentPlan.onlineAmount < paymentPlan.total
                        ? `Pay ${displayPrice(paymentPlan.onlineAmount)} Online`
                        : 'Pay Online'}
                    </span>
                    <span className="text-[10px] text-gray-400">UPI · Cards · Netbanking</span>
                  </button>

                  {/* Cash on Delivery */}
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod('cod'); setPlaceError(''); }}
                    disabled={cartIsFullyOnlineOnly}
                    title={cartIsFullyOnlineOnly ? 'This order must be paid online — no Cash on Delivery portion.' : undefined}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      paymentMethod === 'cod' ? 'border-black bg-black/[0.03]' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {paymentMethod === 'cod' && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    )}
                    <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">Cash on Delivery</span>
                    <span className="text-[10px] text-gray-400">Pay on arrival</span>
                  </button>
                </div>

                {payOnlineError && (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {payOnlineError}
                  </div>
                )}

                {paymentMethod === 'online' && razorpayResult ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-700">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} />
                    {paymentPlan && paymentPlan.codAmount > 0
                      ? <>Paid <span className="font-bold">{displayPrice(razorpayResult.amount)}</span> online · <span className="font-bold">{displayPrice(paymentPlan.codAmount)}</span> due as Cash on Delivery</>
                      : <>Paying with <span className="font-bold">{PAYMENT_METHOD_LABELS.online}</span></>}
                  </div>
                ) : paymentMethod === 'cod' ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-700">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} />
                    Paying with <span className="font-bold">{PAYMENT_METHOD_LABELS.cod}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400 text-center">
                    Pay online now via UPI, cards, or netbanking, or choose Cash on Delivery to pay when your order arrives.
                  </p>
                )}
              </div>
            </div>

            {/* Order summary (checkout) */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <button onClick={() => setExpandSummary(p => !p)} className="w-full flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-gray-900">Order Summary</h2>
                  {expandSummary ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                <AnimatePresence>
                  {expandSummary && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-3 overflow-hidden">
                      {state.items.map(item => (
                        <div key={item.product.id} className="flex items-center gap-3">
                          <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.product.images && item.product.images[0] ? (
                              <Image
                                src={item.product.images[0]}
                                alt={item.product.name}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <span className="text-xl">{item.product.emoji}</span>
                            )}
                          </div>
                          <span className="flex-1 text-xs text-gray-700 line-clamp-1">{item.product.name}</span>
                          <span className="text-xs font-semibold text-gray-900">{displayPrice(item.product.price * item.quantity)}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="border-t border-gray-100 pt-4 space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="text-gray-900">{displayPrice(subtotal)}</span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-600">Discount</span>
                      <span className="text-emerald-600">−{displayPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Shipping</span>
                    <span className={shipping === 0 ? 'text-emerald-600' : 'text-gray-900'}>
                      {shipping === 0 ? 'FREE' : displayPrice(shipping)}
                    </span>
                  </div>
                  {giftWrap && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Gift Wrap</span>
                      <span className="text-gray-900">{displayPrice(giftWrapCost)}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-200 pt-4 flex justify-between">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-2xl text-black">{displayPrice(total)}</span>
                </div>
                {placeError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-center">
                    {placeError}
                  </p>
                )}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCheckout}
                  disabled={placing}
                  className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-900 transition-all flex items-center justify-center gap-2 text-sm shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {placing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Placing Order…</>
                  ) : (
                    <><Lock className="w-4 h-4" /> Place Order · {displayPrice(total)}</>
                  )}
                </motion.button>
                <p className="text-center text-[10px] text-gray-400">
                  By placing your order you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <ShopFooter />
    </div>
  );
}
