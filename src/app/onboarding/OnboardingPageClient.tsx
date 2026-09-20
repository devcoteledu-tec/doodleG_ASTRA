'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Calendar, ArrowRight, ArrowLeft, 
  Check, Loader2, Info 
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

interface CuratedGift {
  tier: 'CLASSIC' | 'GRAND' | 'LUXURY';
  title: string;
  description: string;
  estimatedPrice: number;
  reason: string;
  // Present when this package is grounded in a real products_box item (see
  // /api/curate + src/services/ai.ts curateGiftsFromCatalog). We carry it
  // through untouched so /api/db-onboard can persist the link.
  productId?: string;
  productImage?: string;
}

interface ProfileSearchResult {
  id: string;
  name: string;
  avatarUrl: string;
}

// One illustration per wizard step (1-4), shown alongside the form fields in
// a two-column layout on desktop and stacked above them on mobile.
const STEP_IMAGES: Record<number, string> = {
  1: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4qOOPxz97oLSmaxx-4tXUiSPIA4An8BkKy8GmVhMYjFpdPShZAYWcVGs&s=10',
  2: 'https://media.istockphoto.com/id/1251923134/vector/startup-and-entrepreneurs-business-initiative-concept-vector-illustration.jpg?s=612x612&w=0&k=20&c=Py9kTOGKP4L1Wo_QIDKQ3rK8JWZoW7DClQBITjHDsyM=',
  3: 'https://media.istockphoto.com/id/2179226053/vector/girl-diary-woman-write-journal-student-studying-with-book-teenager-draws-in-cute-paper.jpg?s=612x612&w=0&k=20&c=7UCXR2oPWQBGte6GkuARJMHvUspD58E3oMrM6o-hvwY=',
  4: 'https://img.magnific.com/free-vector/modern-people-doing-cultural-activities_23-2148625186.jpg',
};

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [curationResults, setCurationResults] = useState<CuratedGift[] | null>(null);
  // Distinguishes "still loading" (step === 5) from "loading finished but
  // curation failed" — previously both looked identical to the user: step 6
  // with no results and a permanently-disabled confirm button, no
  // explanation given.
  const [curationError, setCurationError] = useState<string | null>(null);

  // "Tag their doodle_G profile" — lets the sender link the recipient to a
  // real existing member so curation can use that member's own liked
  // products / interests instead of only the sender's guess.
  const [profileQuery, setProfileQuery] = useState('');
  const [profileResults, setProfileResults] = useState<ProfileSearchResult[]>([]);
  const [profileSearchLoading, setProfileSearchLoading] = useState(false);
  const [taggedProfile, setTaggedProfile] = useState<ProfileSearchResult | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    recipientName: '',
    relationship: 'Spouse',
    interests: '',
    quirks: '',
    dynamic: 'Warm & emotional',
    occasionTitle: 'Birthday',
    occasionDate: '',
    isRecurring: true,
    budgetTier: 'GRAND',
    userEmail: '',
    userName: '',
    userPhone: '',
    selectedTier: '' as 'CLASSIC' | 'GRAND' | 'LUXURY' | ''
  });

  // Prefill Step 6's email/phone with the account's REAL on-file values
  // instead of the hardcoded placeholder defaults (sender@doodleg.com,
  // 'Alex Mercer', a US-format number on an India-market product) that a
  // rushed signup could easily submit unedited.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/my-profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
         
        setFormData((prev) => ({
          ...prev,
          userName: prev.userName || data.profile?.name || '',
          userEmail: prev.userEmail || data.account?.email || '',
          userPhone: prev.userPhone || data.account?.mobile_number || '',
        }));
      })
      .catch(() => {
        /* non-fatal — Step 6 falls back to empty, editable fields */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced profile-name search backing the Step 1 "tag a profile" field.
  useEffect(() => {
    if (profileQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate effect-driven state update
      setProfileResults([]);
      return;
    }
    let cancelled = false;
     
    setProfileSearchLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/profile-lookup?query=${encodeURIComponent(profileQuery.trim())}`)
        .then((res) => (res.ok ? res.json() : { profiles: [] }))
        .then((data) => {
          if (!cancelled) setProfileResults(data.profiles || []);
        })
        .catch(() => {
          if (!cancelled) setProfileResults([]);
        })
        .finally(() => {
          if (!cancelled) setProfileSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [profileQuery]);

  const selectTaggedProfile = (p: ProfileSearchResult) => {
    setTaggedProfile(p);
    setProfileQuery('');
    setProfileResults([]);
  };

  const clearTaggedProfile = () => setTaggedProfile(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleToggleRecurring = () => {
    setFormData(prev => ({ ...prev, isRecurring: !prev.isRecurring }));
  };

  const nextStep = () => {
    if (step === 1 && !formData.recipientName) return;
    if (step === 3 && !formData.occasionDate) return;
    setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
  };

  // Triggers the AI Curation API
  const handleGenerateCurations = async () => {
    setLoading(true);
    setCurationError(null);
    setStep(5); // Transition to the loading state step
    try {
      const response = await fetch('/api/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName: formData.recipientName,
          relationship: formData.relationship,
          interests: formData.interests,
          quirks: formData.quirks,
          dynamic: formData.dynamic,
          occasionTitle: formData.occasionTitle,
          taggedProfileId: taggedProfile?.id,
        })
      });

      const data = await response.json();
      if (response.ok && data.giftPackages?.length) {
        setCurationResults(data.giftPackages);
        // Pre-select the sender's stated default tier (Step 4) so they don't
        // have to click again if the AI's grouping already matches what they
        // wanted — still fully overridable by picking a different card.
        setFormData((prev) => ({
          ...prev,
          selectedTier: (prev.selectedTier || prev.budgetTier) as 'CLASSIC' | 'GRAND' | 'LUXURY',
        }));
        setStep(6); // Go to curation display step
      } else {
        throw new Error(data.error || 'No gift packages came back. Please try again.');
      }
    } catch (error) {
      console.error('Failed to curate gifts:', error);
      // Surface the real failure instead of silently landing on an empty
      // Step 6 with a permanently-disabled confirm button and zero
      // explanation — the user needs to know curation failed AND that they
      // can retry, not just see nothing happen.
      setCurationError(
        error instanceof Error ? error.message : 'Could not generate gift ideas right now. Please try again.'
      );
      setStep(6);
    } finally {
      setLoading(false);
    }
  };

  // Submit complete profile to database
  const handleSubmitProfile = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          taggedProfileId: taggedProfile?.id,
          curatedPackages: curationResults
        })
      });
      
      const resData = await response.json();
      if (response.ok) {
        setStep(7); // Show success screen
      } else {
        // Surface the real reason the save failed instead of pretending it
        // worked — a previous version of this branch's sibling (the network
        // catch below) faked step(7) on any error, which is exactly the kind
        // of silent failure that made "onboarding isn't saving" hard to
        // diagnose: the UI said success while the database had nothing.
        alert(resData.error || 'Failed to submit profile. Please try again.');
      }
    } catch (err) {
      console.error('Error saving onboarding data:', err);
      alert('Could not reach the server to save your profile. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Animation configuration
  const slideVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 max-w-5xl mx-auto">
      
      {/* Brand Header */}
      <header className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <Image
            src="https://i.postimg.cc/05MQmBLc/Chat-GPT-Image-Aug-6-2026-03-29-20-PM.png"
            alt="doodle_G Logo"
            width={40}
            height={40}
            className="w-10 h-10 object-contain rounded-lg group-hover:rotate-6 transition-transform duration-300"
          />
          <span className="font-display text-3xl font-bold tracking-wider text-black">
            doodle_<span className="text-[#3b82f6]">G</span>
          </span>
        </Link>
        <p className="text-muted-foreground text-sm tracking-widest uppercase mt-1">Frictionless Sentimentality</p>
      </header>

      {/* Main wizard card container */}
      <div className="w-full glass-panel-premium rounded-2xl p-6 md:p-10 relative overflow-hidden min-h-[500px] flex flex-col justify-between">
        
        {/* Progress bar */}
        {step <= 4 && (
          <div className="absolute top-0 left-0 w-full h-1 bg-black/10">
            <motion.div 
              className="h-full bg-luxury-gold" 
              initial={{ width: '0%' }}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        <AnimatePresence mode="wait">
          {step <= 4 && (
            <motion.div
              key={`step-image-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative w-full rounded-2xl overflow-hidden aspect-[16/9] md:hidden mb-6 border border-black/10 bg-black/5"
            >
              <Image
                src={STEP_IMAGES[step]}
                alt="Onboarding step illustration"
                fill
                unoptimized
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-transparent to-transparent" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className={step <= 4 ? 'grid grid-cols-1 md:grid-cols-5 gap-8 items-center' : ''}>
          {step <= 4 && (
            <div className="hidden md:block md:col-span-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`step-image-desktop-${step}`}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3 }}
                  className="relative w-full aspect-square rounded-2xl overflow-hidden border border-black/10 bg-black/5 shadow-lg"
                >
                  <Image
                    src={STEP_IMAGES[step]}
                    alt="Onboarding step illustration"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 text-[10px] font-semibold uppercase tracking-widest text-white/90 bg-black/30 backdrop-blur px-2.5 py-1 rounded-full">
                    Step {step} of 4
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          <div className={step <= 4 ? 'md:col-span-3' : ''}>
        <AnimatePresence mode="wait">
          {/* STEP 1: Basic Information */}
          {step === 1 && (
            <motion.div
              key="step1"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-luxury-gold">Step 1 of 4</span>
                <h2 className="text-3xl font-display font-semibold text-black">Who is this special person?</h2>
                <p className="text-muted-foreground text-sm">Let&apos;s start with their name and relationship dynamic.</p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Recipient&apos;s Name</label>
                  <input 
                    type="text"
                    name="recipientName"
                    value={formData.recipientName}
                    onChange={handleTextChange}
                    placeholder="e.g. Sarah, Mom, Uncle Jack"
                    className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black placeholder:text-black/40 focus:outline-none focus:border-luxury-gold transition-colors"
                    required
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Relationship</label>
                  <select
                    name="relationship"
                    value={formData.relationship}
                    onChange={handleTextChange}
                    className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black focus:outline-none focus:border-luxury-gold transition-colors"
                  >
                    <option value="Spouse">Spouse / Partner</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Best Friend">Best Friend</option>
                    <option value="Colleague">Colleague</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2 relative">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Tag their doodle_G profile (optional)
                  </label>
                  {taggedProfile ? (
                    <div className="flex items-center justify-between bg-emerald-accent/10 border border-emerald-accent/40 rounded-lg px-4 py-3">
                      <span className="text-sm text-black font-medium flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-accent" /> Tagged: {taggedProfile.name}
                      </span>
                      <button
                        type="button"
                        onClick={clearTaggedProfile}
                        className="text-xs text-muted-foreground hover:text-black underline focus:outline-none"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={profileQuery}
                        onChange={(e) => setProfileQuery(e.target.value)}
                        placeholder="Search by their doodle_G profile name…"
                        className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black placeholder:text-black/40 focus:outline-none focus:border-luxury-gold transition-colors"
                      />
                      <p className="text-xxs text-muted-foreground">
                        If they&apos;re already a member, tagging them lets our AI use their real liked products and
                        interests for a sharper recommendation — instead of just your guess.
                      </p>
                      {profileQuery.trim().length >= 2 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-black/15 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                          {profileSearchLoading ? (
                            <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                            </div>
                          ) : profileResults.length > 0 ? (
                            profileResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => selectTaggedProfile(p)}
                                className="w-full text-left px-4 py-2.5 text-sm text-black hover:bg-black/5 focus:outline-none focus:bg-black/5 transition-colors"
                              >
                                {p.name}
                              </button>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-xs text-muted-foreground">
                              No matching profile found.
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Interests and Quirks */}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-luxury-gold">Step 2 of 4</span>
                <h2 className="text-3xl font-display font-semibold text-black">What makes them tick?</h2>
                <p className="text-muted-foreground text-sm">The more specific you are, the more unexpected and beautiful the curations will be.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Hobbies & Interests (Comma-separated)</label>
                  <input 
                    type="text"
                    name="interests"
                    value={formData.interests}
                    onChange={handleTextChange}
                    placeholder="e.g. baking, science fiction, mechanical keyboards, astronomy"
                    className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black placeholder:text-black/40 focus:outline-none focus:border-luxury-gold transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Unique Quirks & Secret Preferences (Optional)</label>
                  <textarea 
                    name="quirks"
                    value={formData.quirks}
                    onChange={handleTextChange}
                    placeholder="e.g. Hates the color purple, loves vintage fountain pens, drinks black coffee at midnight."
                    rows={3}
                    className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black placeholder:text-black/40 focus:outline-none focus:border-luxury-gold transition-colors resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Occasion Schedule */}
          {step === 3 && (
            <motion.div
              key="step3"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-luxury-gold">Step 3 of 4</span>
                <h2 className="text-3xl font-display font-semibold text-black">The Surprise Occasion</h2>
                <p className="text-muted-foreground text-sm">When does the sentimentality engine need to trigger?</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground">Occasion Type</label>
                    <select
                      name="occasionTitle"
                      value={formData.occasionTitle}
                      onChange={handleTextChange}
                      className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black focus:outline-none focus:border-luxury-gold transition-colors"
                    >
                      <option value="Birthday">Birthday</option>
                      <option value="Wedding Anniversary">Anniversary</option>
                      <option value="Mother's Day">Mother&apos;s Day</option>
                      <option value="Father's Day">Father&apos;s Day</option>
                      <option value="Valentine's Day">Valentine&apos;s Day</option>
                      <option value="Christmas / Holiday">Holiday Celebration</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground">Date</label>
                    <input 
                      type="date"
                      name="occasionDate"
                      value={formData.occasionDate}
                      onChange={handleTextChange}
                      className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black focus:outline-none focus:border-luxury-gold transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-black/5 border border-black/10 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-luxury-gold mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-black">Recurring Annually</h4>
                      <p className="text-xs text-muted-foreground">Doodle_G will auto-renew this occasion calendar every year.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleToggleRecurring}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none ${formData.isRecurring ? 'bg-luxury-gold' : 'bg-black/15'}`}
                  >
                    <div className={`bg-white shadow w-4 h-4 rounded-full transition-transform duration-300 ${formData.isRecurring ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Relationship Dynamic & Budget */}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={slideVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-luxury-gold">Step 4 of 4</span>
                <h2 className="text-3xl font-display font-semibold text-black">Select Your Vibe</h2>
                <p className="text-muted-foreground text-sm">Help our AI match the emotional tone and curation bounds.</p>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Relationship Dynamic</label>
                  <select
                    name="dynamic"
                    value={formData.dynamic}
                    onChange={handleTextChange}
                    className="w-full bg-white border border-black rounded-lg px-4 py-3 text-black focus:outline-none focus:border-luxury-gold transition-colors"
                  >
                    <option value="Warm & emotional">Warm & Emotional (Sentimental)</option>
                    <option value="Witty & sarcastic">Witty & Playful (Teasing)</option>
                    <option value="Eccentric & inside-jokes">Inside-Jokes & Quirky</option>
                    <option value="Formal & respectful">Elegant & Formal</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Default Target Budget Tier</label>
                  <div className="grid grid-cols-3 gap-3">
                    {['CLASSIC', 'GRAND', 'LUXURY'].map((tier) => (
                      <button
                        key={tier}
                        onClick={() => handleSelectChange('budgetTier', tier)}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border text-center transition-all duration-300 focus:outline-none ${formData.budgetTier === tier ? 'border-luxury-gold bg-luxury-gold/10' : 'border-black/10 bg-black/5 hover:bg-black/10'}`}
                      >
                        <span className="text-xs font-bold text-black tracking-widest">{tier}</span>
                        <span className="text-xxs text-muted-foreground mt-1">
                          {tier === 'CLASSIC' ? 'Under ₹500' : tier === 'GRAND' ? '₹500 - ₹2,500' : '₹2,500+'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 5: AI Generating Loading */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16 space-y-6 text-center"
            >
              <div className="relative">
                <Loader2 className="w-16 h-16 text-luxury-gold animate-spin" />
                <Sparkles className="w-6 h-6 text-sunset-coral absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-display font-semibold text-black">Consulting the Curation Engine...</h3>
                <p className="text-muted-foreground text-sm max-w-sm">Gemini AI is crafting exactly 3 surprise packages mapping to {formData.recipientName}&apos;s hobbies and habits.</p>
              </div>
            </motion.div>
          )}

          {/* STEP 6: Display AI Curations */}
          {step === 6 && curationError && !curationResults && (
            <motion.div
              key="step6-error"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-full bg-sunset-coral/15 border border-sunset-coral/40 flex items-center justify-center">
                <Info className="w-7 h-7 text-sunset-coral" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h3 className="text-xl font-display font-semibold text-black">Couldn&apos;t generate gift ideas</h3>
                <p className="text-muted-foreground text-sm">{curationError}</p>
              </div>
              <button
                onClick={handleGenerateCurations}
                className="bg-luxury-gold text-charcoal font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-all text-sm focus:outline-none"
              >
                Try Again
              </button>
            </motion.div>
          )}

          {step === 6 && curationResults && (
            <motion.div
              key="step6"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-widest text-emerald-accent flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Curations Ready
                </span>
                <h2 className="text-3xl font-display font-semibold text-black">
                  {curationResults.length === 1 ? 'One' : curationResults.length === 2 ? 'Two' : 'Three'} Unexpected Surprise{curationResults.length === 1 ? '' : 's'}
                </h2>
                <p className="text-muted-foreground text-sm">Select a subscription package to activate. You can swap options or pause anytime.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
                {curationResults.map((pkg) => (
                  <div 
                    key={pkg.tier}
                    onClick={() => handleSelectChange('selectedTier', pkg.tier)}
                    className={`flex flex-col justify-between p-5 rounded-xl border cursor-pointer transition-all duration-300 relative ${formData.selectedTier === pkg.tier ? 'border-luxury-gold bg-luxury-gold/5 shadow-[0_0_20px_rgba(212,175,55,0.15)]' : 'border-black/10 bg-black/5 hover:border-black/20'}`}
                  >
                    {formData.selectedTier === pkg.tier && (
                      <div className="absolute -top-2 -right-2 bg-luxury-gold text-white rounded-full p-1 border border-white">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`text-xxs font-bold px-2 py-0.5 rounded tracking-widest ${pkg.tier === 'CLASSIC' ? 'bg-black/10 text-black' : pkg.tier === 'GRAND' ? 'bg-luxury-gold/20 text-luxury-gold' : 'bg-sunset-coral/20 text-sunset-coral'}`}>{pkg.tier}</span>
                        <span className="text-sm font-semibold text-black">₹{pkg.estimatedPrice.toFixed(0)}</span>
                      </div>
                      {pkg.productImage && (
                        <div className="relative w-full h-28 rounded-lg overflow-hidden bg-black/5">
                          <Image src={pkg.productImage} alt={pkg.title} fill unoptimized className="object-cover" />
                        </div>
                      )}
                      <h4 className="font-display font-semibold text-base text-black leading-tight">{pkg.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{pkg.description}</p>
                    </div>

                    <div className="pt-4 border-t border-black/10 mt-4 space-y-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                        <Info className="w-3 h-3 text-luxury-gold" /> Why this fits:
                      </span>
                      <p className="text-xxs italic text-muted-foreground leading-relaxed">{pkg.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              {formData.selectedTier && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 border-t border-black/10 pt-4"
                >
                  <h3 className="text-lg font-display font-semibold text-black">Enable Frictionless Sentimentality</h3>
                  <p className="text-xs text-muted-foreground">Input your phone number to authorize autonomous WhatsApp curation approvals. Doodle_G sends automated prompts exactly 14 days before occasions.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xxs uppercase tracking-wider text-muted-foreground">My Email Address</label>
                      <input 
                        type="email"
                        name="userEmail"
                        value={formData.userEmail}
                        readOnly
                        title="Your account email — change it from account settings, not here."
                        className="bg-black/5 border border-black/10 rounded-lg px-3 py-2 text-sm text-black/60 cursor-not-allowed"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xxs uppercase tracking-wider text-muted-foreground">WhatsApp Mobile Number</label>
                      <input 
                        type="text"
                        name="userPhone"
                        value={formData.userPhone}
                        onChange={handleTextChange}
                        placeholder="+91 98765 43210"
                        className="bg-white border border-black/20 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:border-luxury-gold transition-colors"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* STEP 7: Success Onboarding Screen */}
          {step === 7 && (
            <motion.div
              key="step7"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-accent/20 border border-emerald-accent/50 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-accent" />
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-display font-semibold text-black">Sentimentality Automated</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  {formData.recipientName || 'Their'}&apos;s profile has been locked in. You will receive a WhatsApp mockup interactive message 14 days before their {formData.occasionTitle}.
                </p>
              </div>

              <div className="pt-4 flex gap-4">
                <Link 
                  href="/"
                  className="bg-luxury-gold text-charcoal font-semibold px-6 py-3 rounded-lg hover:bg-luxury-gold-rgb hover:opacity-90 transition-all text-sm flex items-center gap-1.5 focus:outline-none"
                >
                  Enter Dashboard <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons footer */}
        {step <= 4 && (
          <div className="flex justify-between items-center border-t border-black/10 pt-6 mt-8">
            <button
              onClick={prevStep}
              className={`flex items-center gap-1 text-sm text-muted-foreground hover:text-black transition-colors focus:outline-none ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            {step < 4 ? (
              <button
                onClick={nextStep}
                disabled={(step === 1 && !formData.recipientName) || (step === 3 && !formData.occasionDate)}
                className="bg-blue-600 text-white hover:bg-blue-700 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerateCurations}
                className="bg-luxury-gold text-charcoal hover:bg-luxury-gold/90 font-bold px-6 py-3 rounded-lg transition-all text-sm flex items-center gap-1.5 focus:outline-none"
              >
                Curation Packages <Sparkles className="w-4 h-4 fill-charcoal" />
              </button>
            )}
          </div>
        )}

        {step === 6 && !curationError && (
          <div className="flex justify-between items-center border-t border-black/10 pt-6 mt-8">
            <button
              onClick={() => setStep(4)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-black transition-colors focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" /> Refine Profile
            </button>

            <button
              onClick={handleSubmitProfile}
              disabled={!formData.selectedTier || loading}
              className="bg-luxury-gold text-charcoal hover:opacity-90 font-bold px-6 py-3 rounded-lg transition-all text-sm flex items-center gap-1.5 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Confirm Subscription <Check className="w-4 h-4 stroke-[3]" />
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
