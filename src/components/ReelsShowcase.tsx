"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { BadgeCheck, ChevronLeft, ChevronRight, Film, Play, X } from "lucide-react";
import { parseReels, timeAgo, type ReelItem } from "@/lib/reels";

const ACCENT = "#e85d4a";
const MEDIA_ASPECT = "3 / 4";
const IG_GRADIENT = "linear-gradient(45deg, #FEDA75 0%, #FA7E1E 25%, #D62976 50%, #962FBF 75%, #4F5BD5 100%)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d4a]";

type Props = {
  /** providers.reels (objects) or providers.instagram_reels (plain URLs). */
  reels: unknown;
  providerName: string;
  providerAvatarUrl?: string | null;
  verified?: boolean | null;
  instagramHandle?: string | null;
};

function cleanHandle(raw?: string | null) {
  const v = (raw ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v : null;
}

export default function ReelsShowcase({
  reels,
  providerName,
  providerAvatarUrl,
  verified,
  instagramHandle,
}: Props) {
  const items = useMemo(() => parseReels(reels), [reels]);
  const handle = cleanHandle(instagramHandle);
  const scroller = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [active, setActive] = useState<ReelItem | null>(null);

  const updateArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    updateArrows();
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, updateArrows]);

  const openReel = useCallback((item: ReelItem, trigger: HTMLElement) => {
    opener.current = trigger;
    setActive(item);
  }, []);

  const closeReel = useCallback(() => {
    setActive(null);
    opener.current?.focus();
  }, []);

  if (items.length === 0) return null;

  const scrollByCard = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * 270, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section className="relative w-full">
      {canPrev && <ArrowButton dir="prev" onClick={() => scrollByCard(-1)} />}
      {canNext && <ArrowButton dir="next" onClick={() => scrollByCard(1)} />}

      <div
        ref={scroller}
        onScroll={updateArrows}
        role="region"
        aria-label={`Reels from ${providerName}`}
        tabIndex={0}
        className={`-mx-4 flex snap-x snap-mandatory scroll-pl-4 items-start gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:scroll-pl-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${FOCUS}`}
      >
        {items.map((item) => (
          <ReelCard
            key={item.kind === "instagram" ? `${item.path}/${item.id}` : item.url}
            item={item}
            username={handle ?? providerName}
            avatarUrl={providerAvatarUrl}
            verified={!!verified}
            onOpen={openReel}
          />
        ))}
      </div>

      {active && <ReelModal item={active} onClose={closeReel} />}
    </section>
  );
}

/* ---------------------------------- card ---------------------------------- */

function ReelCard({
  item,
  username,
  avatarUrl,
  verified,
  onOpen,
}: {
  item: ReelItem;
  username: string;
  avatarUrl?: string | null;
  verified: boolean;
  onOpen: (item: ReelItem, trigger: HTMLElement) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ago = timeAgo(item.postedAt);
  const hasLongCaption = (item.caption?.length ?? 0) > 110;
  const showPlay = item.kind === "instagram" || !playing;

  return (
    <article className="group w-[68vw] max-w-[300px] shrink-0 snap-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-colors duration-200 hover:border-slate-900 hover:bg-slate-900 sm:w-[250px]">
      <button
        type="button"
        onClick={(e) => onOpen(item, e.currentTarget)}
        aria-label={`Play reel from ${username}`}
        className={`relative block w-full overflow-hidden bg-gray-100 ${FOCUS}`}
        style={{ aspectRatio: MEDIA_ASPECT }}
      >
        {item.kind === "video" ? (
          <VideoPreview url={item.url} poster={item.thumbnail} onPlayingChange={setPlaying} />
        ) : item.thumbnail ? (
          <Image src={item.thumbnail} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="absolute inset-0 opacity-90" style={{ background: IG_GRADIENT }} aria-hidden />
        )}

        <span className="absolute right-2.5 top-2.5">
          {item.kind === "instagram" ? <InstagramBadge /> : <VideoBadge />}
        </span>

        {showPlay && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 shadow-lg ring-1 ring-black/5">
              <Play className="ml-0.5 h-5 w-5 fill-current" style={{ color: ACCENT }} aria-hidden />
            </span>
          </span>
        )}
      </button>

      <div className="px-3 pb-3 pt-2.5">
        <div className="flex items-center gap-2">
          <Avatar name={username} url={avatarUrl} />
          <span className="flex min-w-0 flex-1 items-center gap-1 text-xs font-semibold text-gray-900 transition-colors group-hover:text-white">
            <span className="truncate">{username}</span>
            {verified && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 fill-sky-500 text-white" aria-label="Verified provider" />
            )}
          </span>
          {ago && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">{ago}</span>
          )}
        </div>

        {item.caption && (
          <>
            <p
              className={`mt-2 whitespace-pre-line text-[13px] leading-snug text-gray-600 transition-colors group-hover:text-gray-200 ${
                expanded ? "" : "line-clamp-3"
              }`}
            >
              {item.caption}
            </p>
            {hasLongCaption && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className={`mt-1 rounded text-[13px] font-bold text-gray-900 transition-colors group-hover:text-[#ff8a7a] ${FOCUS}`}
              >
                {expanded ? "Show less" : "Read more"}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/* Direct video: muted loop preview while at least 60% visible; the modal plays it with sound. */
function VideoPreview({
  url,
  poster,
  onPlayingChange,
}: {
  url: string;
  poster?: string;
  onPlayingChange: (playing: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // set the property: React's `muted` prop does not reliably reach the DOM

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static cover only

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6, 1] }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={url}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      onPlaying={() => onPlayingChange(true)}
      onPause={() => onPlayingChange(false)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/* --------------------------------- player --------------------------------- */

function ReelModal({ item, onClose }: { item: ReelItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reel player"
      onClick={onClose}
      className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4"
    >
      <div className="relative w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close reel"
          className={`absolute -right-2 -top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white shadow-lg ${FOCUS}`}
        >
          <X className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
        </button>

        {item.kind === "instagram" ? (
          <div className="overflow-hidden rounded-2xl bg-white" style={{ height: "min(84vh, 760px)" }}>
            <iframe
              title="Instagram reel"
              src={`https://www.instagram.com/${item.path}/${item.id}/embed`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          <video
            src={item.url}
            poster={item.thumbnail}
            autoPlay
            loop
            playsInline
            controls
            className="max-h-[84vh] w-full rounded-2xl bg-black object-contain"
          />
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------------------------------- parts --------------------------------- */

function ArrowButton({ dir, onClick }: { dir: "prev" | "next"; onClick: () => void }) {
  const Chevron = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous reels" : "Next reels"}
      onClick={onClick}
      className={`absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white shadow-lg ring-1 ring-gray-200 transition hover:bg-gray-50 sm:grid ${
        dir === "prev" ? "left-1" : "right-1"
      } ${FOCUS}`}
    >
      <Chevron className="h-5 w-5" style={{ color: ACCENT }} aria-hidden />
    </button>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) {
    return (
      <Image
        src={url}
        alt=""
        width={28}
        height={28}
        unoptimized
        onError={() => setBad(true)}
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
      style={{ background: ACCENT }}
    >
      {name.trim().charAt(0).toUpperCase() || "•"}
    </span>
  );
}

/* White Instagram glyph on the brand gradient, top-right of the cover. */
function InstagramBadge() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg shadow-md" style={{ background: IG_GRADIENT }} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#fff" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r="1" fill="#fff" stroke="none" />
      </svg>
    </span>
  );
}

function VideoBadge() {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg shadow-md" style={{ background: ACCENT }} aria-hidden>
      <Film className="h-4 w-4 text-white" />
    </span>
  );
}
