'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MapPin, ChevronRight, Search, Star, CalendarDays, Clock, ShieldCheck } from 'lucide-react';
import { Product } from '@/lib/products';
import HeroSnowfall from '@/components/HeroSnowfall';

/* ── Ad row shapes, matching the ads_* tables in
   supabase_migration_007_ads_tables.sql (image ads) and
   supabase_migration_020_text_auto_scroll_ads.sql (text ads, autoScroll
   slot only) ── */
interface AdItem {
  id: string;
  title?: string | null;
  image_url?: string | null;
  link_url: string;
  /** autoScroll-slot text ads only — a row has exactly one of image_url or text_content, never both. */
  text_content?: string | null;
  background_color?: string | null;
}
interface AdsPayload {
  hero: AdItem[];
  autoScroll: AdItem[];
  scrollBoxes: AdItem[];
}
const EMPTY_ADS: AdsPayload = { hero: [], autoScroll: [], scrollBoxes: [] };

const price = (v: number) => `₹${v.toLocaleString('en-IN')}`;

/**
 * Uber-app-styled home feed, re-themed for doodle_G.
 *
 * Responsive across breakpoints: on phones it's a single-column feed
 * (matching the Uber mobile app screens this was originally modeled on);
 * from `md` up it switches to the wider desktop layout used on
 * uber.com/in/en/ride — a two-column hero (copy + search left, ad art
 * right) followed by grids that widen as more horizontal space opens up,
 * instead of a phone-width column stranded in the middle of a big screen.
 *
 * Section mapping back to the Uber reference screens:
 *   "Location sharing disabled"   -> delivery-address strip
 *   "Request a ride" hero panel   -> title + search + ads_hero_banner ad space
 *   "For you" (ride icons)        -> product-category tiles (CATEGORIES),
 *                                    tap-through to /shop?category=...
 *   "Ride as you like it"         -> "Loved by everyone": the highest
 *                                    star_count products from products_box
 *   "Head out of town"            -> ads_auto_scroll carousel, auto-advances
 *                                    every 5 seconds
 *   "Quality rides, every time"   -> ads_scroll_boxes: uniform ad tiles
 *   "More ways to use Uber"       -> jewelry items pulled from products_box
 */
export default function HomeMobileFeed({ productsList }: { productsList: Product[] }) {
  const router = useRouter();
  const [ads, setAds] = useState<AdsPayload>(EMPTY_ADS);
  const [autoIdx, setAutoIdx] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const autoScrollRef = useRef<HTMLDivElement>(null);

  // "Great deals, every time" row: gentle continuous auto-scroll, separate
  // from autoScrollRef above (that one pages discretely by index; this one
  // creeps continuously in pixels, since the tiles here aren't meant to
  // snap to a "page"). isPausedRef is a ref rather than state on purpose —
  // it flips on every scroll/touch/wheel event, and putting that in state
  // would re-render the whole feed component that often for no visual
  // benefit.
  const dealsScrollRef = useRef<HTMLDivElement>(null);
  const dealsAutoScrollPausedRef = useRef(false);
  const dealsResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseDealsAutoScroll = useCallback(() => {
    dealsAutoScrollPausedRef.current = true;
    if (dealsResumeTimeoutRef.current) clearTimeout(dealsResumeTimeoutRef.current);
    // Resume auto-scroll a few seconds after the person stops touching it,
    // rather than the instant their finger lifts — mid-swipe it should
    // feel fully manual, not like it's fighting to take back control.
    dealsResumeTimeoutRef.current = setTimeout(() => {
      dealsAutoScrollPausedRef.current = false;
    }, 4000);
  }, []);

  useEffect(() => {
    const el = dealsScrollRef.current;
    if (!el) return;

    const intervalId = setInterval(() => {
      if (dealsAutoScrollPausedRef.current) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      if (el.scrollLeft >= maxScroll - 1) {
        // Reached the end — loop back to the start smoothly rather than
        // snapping, so it reads as a continuous loop, not a jump-cut.
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollLeft += 1;
      }
    }, 30);

    return () => clearInterval(intervalId);
  }, [ads.scrollBoxes.length]);

  useEffect(() => {
    return () => {
      if (dealsResumeTimeoutRef.current) clearTimeout(dealsResumeTimeoutRef.current);
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [reserveDate, setReserveDate] = useState('');
  const [reserveTime, setReserveTime] = useState('');
  const [reserveSubmitting, setReserveSubmitting] = useState(false);

  // Hero search bar -> takes the shopper straight to /shop with their
  // query attached (?search=...). The shop page matches it against
  // product name, category, subcategory and description.
  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    router.push(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  };

  // "Plan for later" Next button -> saves the chosen date/time into
  // love_data (see /api/plan-for-later) and then sends the person into the
  // onboarding wizard to fill in the rest of the recipient/occasion details.
  const handlePlanForLaterNext = async () => {
    if (!reserveDate) return;
    setReserveSubmitting(true);
    try {
      const res = await fetch('/api/plan-for-later', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: reserveDate, time: reserveTime }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error || 'Failed to save your planned date. Please try again.');
        return;
      }
      router.push('/onboarding');
    } catch {
      alert('Could not reach the server to save your planned date. Please check your connection and try again.');
    } finally {
      setReserveSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ads')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setAds({
          hero: data.hero ?? [],
          autoScroll: data.autoScroll ?? [],
          scrollBoxes: data.scrollBoxes ?? [],
        });
        setHeroIdx(0);
      })
      .catch(() => setAds(EMPTY_ADS));
    return () => { cancelled = true; };
  }, []);

  // "Head out of town" -> auto-advance one slide every 5 seconds. Scoped
  // to image-only autoScroll ads now that text ads (below) have their own
  // independent cycle driving the hero background instead of sharing this
  // one — otherwise the two would fight over what "index 2" means.
  const imageAutoScrollAds = useMemo(() => ads.autoScroll.filter(ad => !ad.text_content), [ads.autoScroll]);
  const textAutoScrollAds = useMemo(() => ads.autoScroll.filter(ad => ad.text_content), [ads.autoScroll]);

  useEffect(() => {
    if (imageAutoScrollAds.length <= 1) return;
    const timer = setInterval(() => {
      setAutoIdx(i => (i + 1) % imageAutoScrollAds.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [imageAutoScrollAds.length]);

  // Hero background text ad -> cycles independently, every 5 seconds,
  // through whichever ads_auto_scroll rows are text ads. Falls back to the
  // section's own default black background when there are none.
  const [heroAdIdx, setHeroAdIdx] = useState(0);
  useEffect(() => {
    if (textAutoScrollAds.length <= 1) return;
    const timer = setInterval(() => {
      setHeroAdIdx(i => (i + 1) % textAutoScrollAds.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [textAutoScrollAds.length]);
  const activeHeroTextAd = textAutoScrollAds[heroAdIdx % (textAutoScrollAds.length || 1)];

  // Hero ad banner -> loops through every active ads_hero_banner row,
  // crossfading to the next image every 5 seconds.
  useEffect(() => {
    if (ads.hero.length <= 1) return;
    const timer = setInterval(() => {
      setHeroIdx(i => (i + 1) % ads.hero.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [ads.hero.length]);

  useEffect(() => {
    const el = autoScrollRef.current;
    if (!el) return;
    el.scrollTo({ left: autoIdx * el.clientWidth, behavior: 'smooth' });
  }, [autoIdx]);

  // "Ride as you like it" -> most-rated products (highest star_count, then
  // most reviews as a tiebreaker) straight from products_box. Mobile shows
  // 2, desktop widens the grid so we pull a couple more to fill it.
  const mostRated = useMemo(
    () => [...productsList].sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews)).slice(0, 4),
    [productsList]
  );

  // "More ways to use Uber" -> jewelry items from products_box
  const jewelryItems = useMemo(
    () => productsList.filter(p => p.category?.toLowerCase().includes('jewel')).slice(0, 4),
    [productsList]
  );

  return (
    <>
      {/* ════════════ DARK HERO BAND ════════════ */}
      <section
        className="relative overflow-hidden bg-black transition-colors duration-700"
        style={{ backgroundColor: activeHeroTextAd?.background_color || undefined }}
      >
        <HeroSnowfall />

        <div className="relative z-10 max-w-md md:max-w-7xl mx-auto flex flex-col">

          {/* ── Delivery-address strip (was "Location sharing disabled") ── */}
          <Link
            href="/my-profile"
            className="flex items-center justify-between gap-3 bg-[#003a82] text-white px-4 md:px-8 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <MapPin className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm truncate">Delivery address not set. Tap here to add</span>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          </Link>

          {/* ── Hero: search on the left, ad art on the right from md
               upward — matches the two-column "Request a ride" panel on
               uber.com, instead of stretching a phone-width column across
               a wide viewport. Background (color, galaxy image, snow) is
               now on the section itself above, covering the entire band
               rather than just this content block. ── */}
          <div className="relative overflow-hidden px-4 md:px-8 pt-8 md:pt-16 pb-10 md:pb-20 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center">

            {activeHeroTextAd?.text_content && (
              <Link
                href={activeHeroTextAd.link_url}
                aria-hidden="true"
                tabIndex={-1}
                className="absolute inset-0 z-0 flex items-center overflow-hidden pointer-events-none"
              >
                <div className="marquee-text whitespace-nowrap text-6xl md:text-9xl font-extrabold uppercase tracking-tight">
                  <span className="marquee-text-inner">{activeHeroTextAd.text_content}</span>
                  <span className="marquee-text-inner" aria-hidden="true">{activeHeroTextAd.text_content}</span>
                </div>
              </Link>
            )}

            <div className="relative z-10 flex flex-col gap-6 md:gap-8">
              {/* ── Search bar — searches by product name, category, or
                   any related keyword, then hands off to /shop?search=... ── */}
              <form
                onSubmit={handleHeroSearch}
                className="flex items-center gap-3 bg-black/30 border border-black/20 rounded-full pl-4 md:pl-5 pr-2 py-2 md:py-2.5 backdrop-blur-sm focus-within:bg-black/40 transition-colors"
              >
                <Search className="w-4 h-4 flex-shrink-0 text-black" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search gifts, category, or product name..."
                  className="flex-1 min-w-0 bg-transparent text-sm md:text-base text-black font-bold placeholder:text-black/50 focus:outline-none py-1.5 md:py-1.5"
                />
                <button
                  type="submit"
                  className="flex-shrink-0 bg-black text-white font-bold text-xs md:text-sm px-4 md:px-5 py-2 md:py-2.5 rounded-full hover:bg-black/80 transition-colors"
                >
                  Search
                </button>
              </form>
            </div>

            {/* Hero ad space (was "Avoid any pick-up confusion").
                Backed by ads_hero_banner, creative spec 1080×520px.
                Loops through every active row, crossfading every 5s.
                object-contain (not cover) so the ad shows at its actual
                size/aspect ratio, never cropped or zoomed in. */}
            <div className="relative z-10 w-full rounded-2xl overflow-hidden bg-black/20">
              {/* Zero-height spacer: forces this box's height to be
                  520/1080 of its own (now guaranteed-full) width, via the
                  classic padding-bottom-percentage technique. Switched to
                  this from the CSS `aspect-ratio` property because that
                  was not resolving correctly here — the box was coming out
                  closer to square than the intended wide 1080:520 shape,
                  which was clipping the ad image against overflow-hidden.
                  padding-bottom-as-percentage-of-width has been reliably
                  supported cross-browser for well over a decade. */}
              <div style={{ paddingBottom: `${(520 / 1080) * 100}%` }} />
              {ads.hero.length > 0 && (
                <>
                  {ads.hero.map((ad, i) => (
                    <Link
                      key={ad.id}
                      href={ad.link_url}
                      className={`absolute inset-0 block transition-opacity duration-700 ${
                        i === heroIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'
                      }`}
                    >
                      {ad.image_url && (
                        <Image
                          src={ad.image_url}
                          alt={ad.title ?? 'Advertisement'}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      )}
                    </Link>
                  ))}
                  {ads.hero.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {ads.hero.map((_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 rounded-full transition-all duration-300 ${i === heroIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ════════════ Continuing in the SAME section: loved-by-everyone,
             ad carousel, great-deals scroll boxes. This used to be a
             separate <section> with its own independent HeroSnowfall
             canvas — since each canvas randomizes its own star/nebula
             layout, the pattern could never line up at the seam between
             them, which is exactly what read as "two sections" instead of
             one continuous scene. One section, one shared canvas below,
             fixes that. ════════════ */}
        <div className="relative z-10 max-w-md md:max-w-7xl mx-auto flex flex-col">

          {/* ── Loved by everyone (was "Ride as you like it") — the
               most-rated products in products_box, styled after the
               reference deal-card template: white card, red "X% off"
               pill + "Limited time deal" line, stars, price row. ── */}
          {mostRated.length > 0 && (
            <div className="px-4 md:px-8 pt-7 md:pt-16 pb-7 md:pb-16">
              <h2 className="text-white font-bold text-lg md:text-2xl mb-3 md:mb-5">Loved by everyone</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
                {mostRated.map(p => (
                  <Link
                    key={p.id}
                    href={`/shop/${p.slug || p.id}`}
                    className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)] transition-shadow"
                  >
                    <div className="relative h-28 md:h-40 bg-gray-50">
                      {p.images?.[0] ? (
                        <Image src={p.images[0]} alt={p.name} fill unoptimized className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">{p.emoji}</div>
                      )}
                    </div>
                    <div className="p-3 md:p-4 flex flex-col gap-1">
                      {p.discount ? (
                        <div className="space-y-0.5">
                          <span className="inline-block text-[11px] font-bold text-white bg-[#CC0C39] px-2 py-0.5 rounded-[3px]">
                            {p.discount}% off
                          </span>
                          <p className="text-[10px] font-bold text-[#CC0C39]">Limited time deal</p>
                        </div>
                      ) : p.badge ? (
                        <span className="inline-block w-fit text-[10px] font-bold text-white bg-sky-600 px-2 py-0.5 rounded-[3px] uppercase tracking-wide">
                          {p.badge}
                        </span>
                      ) : null}
                      <p className="text-gray-900 text-xs md:text-sm font-semibold line-clamp-1">{p.name}</p>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-gray-500 text-[10px] md:text-xs">{p.rating.toFixed(1)} ({p.reviews})</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span className="text-gray-900 text-sm md:text-base font-bold">{price(p.price)}</span>
                        {p.originalPrice && (
                          <span className="text-[11px] line-through text-gray-400">{price(p.originalPrice)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ════════════ PLAN FOR LATER — white, full-bleed band with a
           reserve-style scheduling card + a benefits sidebar, screenshot-
           matched but responsive: stacks to a single column on phones,
           two-column (wide card + sidebar) from md up ════════════ */}
      <section className="bg-white">
        <div className="max-w-md md:max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-16">
          <h2 className="text-gray-900 font-bold text-lg md:text-2xl mb-3 md:mb-5">Plan for later</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* Reserve-style card */}
            <div className="md:col-span-2 rounded-2xl overflow-hidden bg-[#cfe8e6] flex flex-col-reverse md:flex-row">
              <div className="flex-1 p-5 md:p-8 flex flex-col justify-center gap-4 md:gap-5">
                <h3 className="text-gray-900 font-extrabold text-xl md:text-2xl leading-snug">
                  Get your gift ready<br />with doodle_G Reserve
                </h3>
                <div className="space-y-1.5">
                  <p className="text-gray-700 text-xs md:text-sm font-semibold">Choose date and time</p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <CalendarDays className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="date"
                        value={reserveDate}
                        onChange={e => setReserveDate(e.target.value)}
                        aria-label="Date"
                        className="w-full rounded-xl bg-white/90 pl-9 pr-3 py-2.5 text-xs md:text-sm text-gray-900 border border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                    <div className="relative flex-1">
                      <Clock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="time"
                        value={reserveTime}
                        onChange={e => setReserveTime(e.target.value)}
                        aria-label="Time"
                        className="w-full rounded-xl bg-white/90 pl-9 pr-3 py-2.5 text-xs md:text-sm text-gray-900 border border-transparent focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePlanForLaterNext}
                  disabled={!reserveDate || reserveSubmitting}
                  className="self-start bg-black text-white font-semibold px-6 py-2.5 md:px-8 md:py-3 rounded-xl hover:bg-gray-900 transition-all text-xs md:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reserveSubmitting ? 'Saving...' : 'Next'}
                </button>
              </div>
              <div className="relative w-full md:h-auto md:w-2/5 bg-[#cfe8e6] flex items-center justify-center">
                <Image
                  src="https://img.magnific.com/premium-vector/happy-young-people-friends-cartoon-vector-illustration_1322553-73315.jpg?semt=ais_hybrid&w=740&q=80"
                  alt="Happy people planning ahead"
                  width={0}
                  height={0}
                  sizes="(min-width: 768px) 40vw, 100vw"
                  unoptimized
                  className="w-full h-auto md:w-full md:h-full md:object-cover"
                />
              </div>
            </div>

            {/* Benefits sidebar */}
            <div className="rounded-2xl border border-gray-200 p-5 md:p-6 flex flex-col gap-4">
              <p className="text-gray-900 font-bold text-sm md:text-base">Benefits</p>
              <div className="flex flex-col gap-3.5">
                <div className="flex items-start gap-3 pb-3.5 border-b border-gray-100">
                  <CalendarDays className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 text-xs md:text-sm leading-snug">
                    Choose your exact pickup time up to 90 days in advance.
                  </p>
                </div>
                <div className="flex items-start gap-3 pb-3.5 border-b border-gray-100">
                  <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 text-xs md:text-sm leading-snug">
                    Extra wait time included to meet your order.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 text-xs md:text-sm leading-snug">
                    Cancel at no charge up to 60 minutes in advance.
                  </p>
                </div>
              </div>
              <p className="text-gray-400 text-[11px] md:text-xs underline underline-offset-2 cursor-pointer hover:text-gray-600">
                See terms
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════ DARK BAND (cont.): auto-scrolling ad carousel ════════════ */}
      <section className="bg-black">
        <div className="max-w-md md:max-w-7xl mx-auto flex flex-col">

          {/* ── Auto-scrolling image ad carousel (was "Head out of town") —
               backed by ads_auto_scroll's image-ad rows, creative spec
               1024×576px, advances automatically every 5 seconds. Text ad
               rows from the same table drive the hero background instead
               (see above) rather than appearing here too. ── */}
          {imageAutoScrollAds.length > 0 && (
            <div className="pb-7 md:pb-16">
              <div ref={autoScrollRef} className="flex overflow-x-hidden md:px-8">
                {imageAutoScrollAds.map(ad => (
                  <Link
                    key={ad.id}
                    href={ad.link_url}
                    className="relative flex-shrink-0 w-full mx-4 md:mx-0 rounded-2xl overflow-hidden"
                    style={{ aspectRatio: '1024 / 576' }}
                  >
                    {ad.image_url && (
                      <Image src={ad.image_url} alt={ad.title ?? 'Advertisement'} fill unoptimized className="object-cover" />
                    )}
                  </Link>
                ))}
              </div>
              {imageAutoScrollAds.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-2.5">
                  {imageAutoScrollAds.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === autoIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </section>

      {/* ════════════ MORE WAYS TO SHOP — full-bleed white band,
           borderless cards ════════════ */}
      {jewelryItems.length > 0 && (
        <section className="bg-white">
          <div className="max-w-md md:max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-16">
            <h2 className="text-gray-900 font-bold text-lg md:text-2xl mb-3 md:mb-5">More ways to shop with doodle_G</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
              {jewelryItems.map(p => (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug || p.id}`}
                  className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-shadow"
                >
                  <div className="relative h-32 md:h-44 bg-gray-50">
                    {p.images?.[0] ? (
                      <Image src={p.images[0]} alt={p.name} fill unoptimized className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">{p.emoji}</div>
                    )}
                  </div>
                  <div className="p-3 md:p-4">
                    <p className="text-gray-900 text-xs md:text-sm font-semibold line-clamp-1">{p.name}</p>
                    <p className="text-gray-500 text-[10px] md:text-xs mt-0.5">{price(p.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════ GREAT DEALS, EVERY TIME — moved to sit right after
           "More ways to shop with doodle_G"; uniform ad tiles from
           ads_scroll_boxes, creative spec 280×160px each. Always a single
           horizontally-scrollable row on every screen size — this used to
           switch to a 4-column grid at md+, which wrapped into a second row
           the moment there were more than 4 tiles. Auto-scrolls gently on
           its own and pauses the instant someone touches/drags it, so it
           still feels fully manual whenever a person actually interacts
           with it. ════════════ */}
      <section className="bg-black">
        <div className="max-w-md md:max-w-7xl mx-auto flex flex-col py-4 md:py-8">
          <div className="mx-4 md:mx-8 mb-3 md:mb-5 bg-amber-400 rounded-2xl p-4 md:p-6 flex items-center justify-between gap-4">
            <h2 className="text-black font-extrabold text-lg md:text-2xl leading-snug">Great deals,<br />every time</h2>
            <Link
              href="/onboarding"
              className="flex-shrink-0 bg-black text-white font-semibold px-4 py-2.5 md:px-6 md:py-3 rounded-xl hover:bg-gray-900 transition-all text-xs md:text-sm whitespace-nowrap"
            >
              Get AI Curation
            </Link>
          </div>
          <div
            ref={dealsScrollRef}
            onPointerDown={pauseDealsAutoScroll}
            onTouchStart={pauseDealsAutoScroll}
            onWheel={pauseDealsAutoScroll}
            className="flex gap-3 md:gap-4 overflow-x-auto px-4 md:px-8 pb-1 no-scrollbar"
          >
            {(ads.scrollBoxes.length > 0 ? ads.scrollBoxes : Array.from({ length: 4 }, () => null)).map((ad, i) => (
              <Link
                key={ad?.id ?? i}
                href={ad?.link_url ?? '/shop'}
                className="relative flex-shrink-0 rounded-xl overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center"
                style={{ width: 280, height: 160 }}
              >
                {ad?.image_url ? (
                  <Image src={ad.image_url} alt={ad.title ?? 'Advertisement'} fill unoptimized className="object-cover" />
                ) : (
                  <span className="text-white/30 text-xs">Explore gifts →</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
