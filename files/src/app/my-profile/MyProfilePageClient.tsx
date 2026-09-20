'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Mail, Phone, Calendar, Edit3, Save, X, Loader2,
  Sparkles, Star, ShoppingBag, LogOut, ChevronRight, Plus, Gift, Check
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useAuth } from '@/lib/AuthContext';
import { useCart } from '@/lib/CartContext';

interface UserProfile {
  gift_personalization_opt_in?: boolean;
  id: string;
  user_id: string;
  name: string;
  age?: number;
  date_of_birth?: string;
  avatar_url?: string;
  subscription_type: 'urgent' | 'major' | 'prime';
  topic_interested: string[];
  like_products_id: string[];
}

/* Palette restricted to: white background + blue / black / green / gray text. */
const SUBSCRIPTION_STYLES = {
  urgent: { label: 'Urgent', bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200' },
  major:  { label: 'Major',  bg: 'bg-gray-100', text: 'text-gray-700',  border: 'border-gray-300' },
  prime:  { label: 'Prime',  bg: 'bg-black',    text: 'text-white',    border: 'border-black' },
};

const INTEREST_SUGGESTIONS = [
  'Technology', 'Books', 'Fitness', 'Travel', 'Music',
  'Art', 'Gaming', 'Cooking', 'Fashion', 'Photography',
  'Nature', 'Movies', 'Yoga', 'Coffee', 'Luxury',
];

export default function MyProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { cartCount, state } = useCart();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editTopics, setEditTopics] = useState<string[]>([]);
  const [shareGiftPreferences, setShareGiftPreferences] = useState(false);
  const [topicInput, setTopicInput] = useState('');

  const loadEditState = (p: UserProfile) => {
    setShareGiftPreferences(Boolean(p.gift_personalization_opt_in));
    setEditName(p.name || '');
    setEditAge(p.age?.toString() || '');
    setEditDob(p.date_of_birth || '');
    setEditAvatar(p.avatar_url || '');
    setEditTopics([...(p.topic_interested || [])]);
  };

  // Fetch runs inline inside the effect (rather than through a separately
  // defined helper called synchronously) so nothing sets state synchronously
  // within the effect body itself — `loading` already starts `true`, so we
  // only need to update state from the async response once it resolves.
  useEffect(() => {
    // Don't act on `user` being null until the auth context has finished its
    // own /api/auth/me session check. `user` starts as null on every mount
    // (including a fresh page load / refresh while genuinely signed in), so
    // redirecting here before authLoading flips to false bounces a valid
    // session back to /auth in a race with that check resolving.
    if (authLoading) return;

    if (!user) {
      router.replace('/auth?redirect=/my-profile');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/my-profile');
        const data = await res.json();
        if (!cancelled && data.profile) {
          setProfile(data.profile);
          loadEditState(data.profile);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch('/api/my-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          age: editAge,
          date_of_birth: editDob,
          avatar_url: editAvatar,
          gift_personalization_opt_in: shareGiftPreferences,
          topic_interested: editTopics,
        }),
      });
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        setEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const addTopic = (topic: string) => {
    const t = topic.trim();
    if (t && !editTopics.includes(t)) {
      setEditTopics(prev => [...prev, t]);
    }
    setTopicInput('');
  };

  const removeTopic = (topic: string) => {
    setEditTopics(prev => prev.filter(t => t !== topic));
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  if (!user) return null;

  const sub = profile ? SUBSCRIPTION_STYLES[profile.subscription_type] : SUBSCRIPTION_STYLES.prime;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-10">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full uppercase tracking-widest mb-3">
              <Sparkles className="w-3 h-3" /> My Account
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-black">My Profile</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your account and preferences.</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-black bg-white border border-gray-200 hover:border-gray-400 px-4 py-2.5 rounded-xl transition-all shadow-sm w-full sm:w-auto"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm text-gray-500">Loading your profile…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">

            {/* ── Left Card — Identity ── */}
            <div className="lg:col-span-1 space-y-4">
              {/* Profile card */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-200 rounded-3xl p-6 space-y-5 shadow-[0_2px_24px_rgba(0,0,0,0.05)]"
              >
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="relative">
                    <Image
                      src={profile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'}
                      alt={profile?.name || 'Profile avatar'}
                      width={96}
                      height={96}
                      unoptimized
                      className="w-24 h-24 rounded-full object-cover border-4 border-white ring-2 ring-blue-100 shadow-md"
                    />
                    <div className={`absolute -bottom-1 -right-1 w-7 h-7 ${sub.bg} border ${sub.border} rounded-full flex items-center justify-center shadow-sm`}>
                      <Star className={`w-3.5 h-3.5 ${sub.text}`} />
                    </div>
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-black">{profile?.name}</h2>
                    <p className="text-xs text-gray-500">@{user.user_name}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full border uppercase tracking-widest ${sub.bg} ${sub.text} ${sub.border}`}>
                    {sub.label} Member
                  </span>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex items-center gap-2.5 text-sm">
                    <Mail className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span className="text-gray-600 truncate">{user.email}</span>
                  </div>
                  {user.mobile_number && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Phone className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-gray-600">{user.mobile_number}</span>
                    </div>
                  )}
                  {profile?.age && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <User className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-gray-600">Age {profile.age}</span>
                    </div>
                  )}
                  {profile?.date_of_birth && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-gray-600">{new Date(profile.date_of_birth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => { setEditing(true); if (profile) loadEditState(profile); }}
                  className="w-full flex items-center justify-center gap-2 bg-black hover:bg-gray-800 text-white text-xs font-semibold py-3 rounded-xl transition-all shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Profile
                </button>
              </motion.div>

              {/* Quick links */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white border border-gray-200 rounded-3xl p-4 space-y-1 shadow-[0_2px_24px_rgba(0,0,0,0.05)]"
              >
                {[
                  { href: '/shop', icon: ShoppingBag, label: 'Browse Shop' },
                  { href: '/profiles', icon: User, label: 'Community Profiles' },
                  { href: '/cart', icon: Gift, label: 'My Cart' },
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-gray-600 hover:text-black hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon className="w-3.5 h-3.5 text-blue-600" />
                      {item.label}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                  </Link>
                ))}
              </motion.div>
            </div>

            {/* ── Right — Interests & Details ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="lg:col-span-2 space-y-5"
            >
              <div className="mb-5 flex gap-5"><Link href="/orders" className="underline">Your orders</Link><Link href="/gifts" className="underline">Gift plans</Link></div>
              {/* Save success banner */}
              <AnimatePresence>
                {saveSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-green-50 border border-green-200 rounded-2xl px-5 py-3 text-sm text-green-700 flex items-center gap-2 font-medium"
                  >
                    <Check className="w-4 h-4" /> Profile updated successfully!
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interests section */}
              <div className="bg-white border border-gray-200 rounded-3xl p-6 space-y-5 shadow-[0_2px_24px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-black">Gift Interests</h3>
                  {!editing && (
                    <button
                      onClick={() => { setEditing(true); if (profile) loadEditState(profile); }}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>

                {!editing ? (
                  <div className="flex flex-wrap gap-2">
                    {(profile?.topic_interested || []).length > 0 ? (
                      profile!.topic_interested.map(t => (
                        <span key={t} className="text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full">
                          #{t}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 italic">No interests added yet. Edit your profile to add some!</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {editTopics.map(t => (
                        <span key={t} className="flex items-center gap-1.5 text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full">
                          #{t}
                          <button onClick={() => removeTopic(t)} className="hover:text-black transition-colors">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {/* Add topic input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={topicInput}
                        onChange={e => setTopicInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic(topicInput); } }}
                        placeholder="Type an interest and press Enter…"
                        className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={() => addTopic(topicInput)}
                        className="flex-shrink-0 bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-xl transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Suggestions */}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-semibold">Quick add:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {INTEREST_SUGGESTIONS.filter(s => !editTopics.includes(s)).slice(0, 8).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => addTopic(s)}
                            className="text-[11px] text-gray-600 hover:text-blue-700 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 px-2.5 py-1 rounded-full transition-all"
                          >
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Edit form — personal details */}
              <AnimatePresence>
                {editing && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="bg-white border border-gray-200 rounded-3xl p-6 space-y-5 shadow-[0_2px_24px_rgba(0,0,0,0.05)]"
                  >
                    <h3 className="font-display text-lg font-bold text-black">Edit Personal Details</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Display name */}
                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Display Name</label>
                        <input
                          type="text" value={editName} onChange={e => setEditName(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="Your display name"
                        />
                      </div>

                      {/* Age */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Age</label>
                        <input
                          type="number" min="1" max="120" value={editAge} onChange={e => setEditAge(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="e.g. 25"
                        />
                      </div>

                      {/* Date of Birth */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date of Birth</label>
                        <input
                          type="date" value={editDob} onChange={e => setEditDob(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>

                      {/* Avatar URL */}
                      <div className="sm:col-span-2 space-y-1.5">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avatar URL</label>
                        <input
                          type="url" value={editAvatar} onChange={e => setEditAvatar(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black placeholder:text-gray-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          placeholder="https://…"
                        />
                        {editAvatar && (
                          <Image src={editAvatar} alt="Preview" width={56} height={56} unoptimized className="w-14 h-14 rounded-full object-cover border border-gray-200 mt-1" />
                        )}
                      </div>

                      <label className="sm:col-span-2 flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={shareGiftPreferences} onChange={e => setShareGiftPreferences(e.target.checked)} />
                        <span>Let people who tag me use my interests and liked categories for gift suggestions. These preferences may be sent to our AI provider.</span>
                      </label>

                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                      <button
                        onClick={() => setEditing(false)}
                        className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 hover:text-black hover:border-gray-400 text-sm font-medium transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-60"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Account info card */}
              {!editing && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="bg-white border border-gray-200 rounded-3xl p-6 shadow-[0_2px_24px_rgba(0,0,0,0.05)]"
                >
                  <h3 className="font-display text-lg font-bold text-black mb-4">Account Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Username</span>
                      <span className="text-sm text-black font-medium">@{user.user_name}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Email</span>
                      <span className="text-sm text-gray-700 truncate max-w-[60%] text-right">{user.email}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5 border-b border-gray-100">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Mobile</span>
                      <span className="text-sm text-gray-700">{user.mobile_number || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2.5">
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Liked Products</span>
                      <span className="text-sm font-semibold text-green-700">{profile?.like_products_id?.length || 0} items</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </main>
      <ShopFooter />
    </div>
  );
}
