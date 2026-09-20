'use client';

import React from 'react';
import { use } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, ExternalLink, Heart, CheckCircle2 
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';
import { SOCIAL_LINKS } from '@/lib/socialLinks';

// Custom SVG Social Icons for maximum safety against library version differences
const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const YoutubeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const WhatsappIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 4.99L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.4 1.32-1.93 1.4-.5.08-1.13.11-1.82-.12-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.8-4.16-4.94-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .9 2.14.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.49-.14.13-.28.28-.12.55.16.27.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.23 1.38.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.53.72 1.79.85.27.13.44.19.51.3.07.11.07.63-.17 1.31z" />
  </svg>
);

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.86 0-2.15 1.45-2.15 2.94v5.66H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
  </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M21.94 4.6 18.6 20.2c-.25 1.1-.9 1.37-1.82.85l-5.03-3.71-2.43 2.34c-.27.27-.5.5-1.02.5l.36-5.15L18.6 6.4c.4-.36-.09-.56-.62-.2L6.4 13.63l-5.02-1.57c-1.09-.34-1.1-1.09.23-1.61L20.6 3.36c.91-.34 1.7.2 1.34 1.24z" />
  </svg>
);

interface PageParams {
  platform: string;
}

const SOCIAL_DETAILS: Record<string, {
  name: string;
  handle: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  followers: string;
  description: string;
  mockPosts: { id: number; emoji: string; text: string; likes: string }[];
}> = {
  instagram: {
    name: 'Instagram',
    handle: '@doodle_g_surprise',
    color: 'from-pink-500 via-red-500 to-yellow-500',
    icon: InstagramIcon,
    followers: '124K followers',
    description: 'Daily drops of handcrafted surprise openings, customer reactions, and packaging art behind the scenes.',
    mockPosts: [
      { id: 1, emoji: '🎁', text: 'Unboxing the "Culinary Delights" package for a 10th anniversary surprise!', likes: '4.2K' },
      { id: 2, emoji: '📸', text: 'Stunning polaroid memories captured with our custom vintage gift kit.', likes: '2.8K' },
      { id: 3, emoji: '💬', text: '"I cried when I saw the customized Gemini-written card!" — Sarah M.', likes: '5.1K' }
    ]
  },
  facebook: {
    name: 'Facebook',
    handle: 'doodle_G Surprise Gift Concierge',
    color: 'from-blue-600 to-blue-800',
    icon: FacebookIcon,
    followers: '89K followers',
    description: 'Community stories, customer reviews, and announcement notes regarding seasonal special discounts.',
    mockPosts: [
      { id: 1, emoji: '💐', text: 'Celebrating Mother\'s Day with surprise express packages dispatched nationwide.', likes: '920' },
      { id: 2, emoji: '✨', text: 'How doodle_G uses advanced models to study relationship dynamics.', likes: '1.2K' },
      { id: 3, emoji: '💼', text: 'Now introducing corporate bulk concierge options for virtual teams.', likes: '512' }
    ]
  },
  youtube: {
    name: 'YouTube',
    handle: 'doodle_G Official Channel',
    color: 'from-red-600 to-red-700',
    icon: YoutubeIcon,
    followers: '45K subscribers',
    description: 'Cinematic unboxing reviews, documentary reaction captures, and tutorials on gift customization.',
    mockPosts: [
      { id: 1, emoji: '🎥', text: 'Surprising My Best Friend on a Virtual call (EMOTIONAL REACTION!)', likes: '12K' },
      { id: 2, emoji: '📦', text: 'Inside the Box: How We Handcraft and Wrap Every Single Curated Item.', likes: '8.4K' },
      { id: 3, emoji: '🧠', text: 'Behind the Technology: Frictionless Sentimentality and AI Personalization.', likes: '15K' }
    ]
  },
  x: {
    name: 'X (Twitter)',
    handle: '@doodle_g',
    color: 'from-neutral-900 to-neutral-800',
    icon: XIcon,
    followers: '32K followers',
    description: 'Tech updates, status notifications, fast customer query response, and prompt snippets.',
    mockPosts: [
      { id: 1, emoji: '🚀', text: 'Our new /wishlist page is fully synchronized with Supabase! Like your picks now.', likes: '840' },
      { id: 2, emoji: '💡', text: 'Sentiment isn\'t about the price tag. It\'s about matching the unique dynamic. Always.', likes: '2.1K' },
      { id: 3, emoji: '🔥', text: 'Flash deals updated! Grab the limited-time photo kit at 31% off.', likes: '620' }
    ]
  },
  whatsapp: {
    name: 'WhatsApp',
    handle: 'doodle_G Companion',
    color: 'from-emerald-500 to-emerald-700',
    icon: WhatsappIcon,
    followers: 'Verified Business Agent',
    description: 'Chat directly with the doodle_G Companion for order updates, T-14 gift approvals, and concierge support.',
    mockPosts: [
      { id: 1, emoji: '💬', text: 'Approve your curated tiers instantly right from chat, 14 days before every occasion.', likes: '3.4K' },
      { id: 2, emoji: '📦', text: 'Real-time delivery tracking and card-writer previews, sent straight to your phone.', likes: '2.1K' },
      { id: 3, emoji: '🔔', text: 'Never miss a birthday or anniversary — the companion reminds you first.', likes: '4.6K' }
    ]
  },
  linkedin: {
    name: 'LinkedIn',
    handle: 'doodle_G',
    color: 'from-sky-700 to-blue-900',
    icon: LinkedinIcon,
    followers: '18K followers',
    description: 'Company updates, provider partnership announcements, and behind-the-scenes on our curation engine.',
    mockPosts: [
      { id: 1, emoji: '🤝', text: 'Welcoming 40 new artisan gift providers to the doodle_G marketplace this quarter.', likes: '410' },
      { id: 2, emoji: '📈', text: 'How AI-personalized gifting is changing corporate client appreciation programs.', likes: '765' },
      { id: 3, emoji: '🎉', text: 'doodle_G named a rising premium gifting platform of the year.', likes: '1.3K' }
    ]
  },
  telegram: {
    name: 'Telegram',
    handle: '@doodle_g_channel',
    color: 'from-sky-400 to-sky-600',
    icon: TelegramIcon,
    followers: '9.8K members',
    description: 'Fast broadcast channel for flash-sale drops, restock alerts, and early access to new provider collections.',
    mockPosts: [
      { id: 1, emoji: '⚡', text: 'Flash: Celestial Constellation Kit back in stock for 3 hours only.', likes: '540' },
      { id: 2, emoji: '🆕', text: 'New provider collection just added — cakes, gift kits, and wellness boxes.', likes: '390' },
      { id: 3, emoji: '🎁', text: 'Members-only early access to our Golden Anniversary Tier Cake launch.', likes: '712' }
    ]
  }
};

export default function SocialRedirectPage({ params }: { params: Promise<PageParams> }) {
  const resolvedParams = use(params);
  const platformName = resolvedParams.platform.toLowerCase();
  const info = SOCIAL_DETAILS[platformName] || SOCIAL_DETAILS.instagram;
  const PlatformIcon = info.icon;

  const { cartCount, state } = useCart();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 md:px-8 py-16 flex flex-col items-center justify-center">
        
        {/* Card Panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-3xl border border-gray-100 shadow-xl p-8 md:p-12 w-full text-center relative overflow-hidden"
        >
          {/* Header Banner */}
          <div className={`absolute top-0 inset-x-0 h-3 bg-gradient-to-r ${info.color}`} />

          {/* Social Icon Circle */}
          <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${info.color} flex items-center justify-center text-white mx-auto shadow-lg mb-6`}>
            <PlatformIcon className="w-10 h-10" />
          </div>

          <div className="space-y-2 mb-8">
            <h1 className="text-3xl font-extrabold text-gray-900">{info.name}</h1>
            <p className="text-sm font-semibold text-gray-500">{info.handle}</p>
            <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 px-3 py-1 rounded-full text-xs text-gray-400 mt-2 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500" /> Verified Account · {info.followers}
            </div>
            <p className="text-sm text-gray-500 max-w-md mx-auto pt-3 leading-relaxed">
              {info.description}
            </p>
          </div>

          {/* Mock Social Feed */}
          <div className="space-y-4 text-left max-w-lg mx-auto mb-8">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-2">Latest Updates</h4>
            {info.mockPosts.map(post => (
              <div key={post.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 hover:border-gray-200 transition-all flex gap-3.5 shadow-sm">
                <span className="text-2xl flex-shrink-0">{post.emoji}</span>
                <div className="space-y-1">
                  <p className="text-xs text-gray-700 leading-relaxed font-sans">{post.text}</p>
                  <p className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                    <Heart className="w-3 h-3 fill-rose-500" /> {post.likes}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* External mock redirection link */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
            <Link
              href="/shop"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black transition-all order-2 sm:order-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Shop
            </Link>
            <a
              href={
                SOCIAL_LINKS[platformName as keyof typeof SOCIAL_LINKS] ||
                `https://${platformName === 'x' ? 'x.com' : `${platformName}.com`}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-black text-white font-bold px-8 py-3.5 rounded-xl text-xs hover:bg-gray-900 transition-all shadow-md order-1 sm:order-2"
            >
              Visit Official {info.name} <ExternalLink className="w-4 h-4" />
            </a>
          </div>

        </motion.div>

      </main>

      <ShopFooter />
    </div>
  );
}
