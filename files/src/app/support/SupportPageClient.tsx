'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  HelpCircle, Truck, RotateCcw, MessageSquare, 
  ArrowLeft, Send, Check, Loader2
} from 'lucide-react';
import ShopNav from '@/components/ShopNav';
import ShopFooter from '@/components/ShopFooter';
import { useCart } from '@/lib/CartContext';

type TabType = 'faq' | 'shipping' | 'returns' | 'contact';

function SupportPageContent() {
  const searchParams = useSearchParams();
  const activeTabParam = (searchParams.get('tab') as TabType) || 'faq';

  // `activeTab` is derived from the URL param, with `manualTab` as a
  // render-time override for in-page tab clicks (no URL change). Deriving
  // this during render — rather than syncing `activeTabParam` into state
  // via a useEffect — avoids the extra render pass an effect-based sync
  // would cause (see https://react.dev/learn/you-might-not-need-an-effect).
  const [manualTab, setManualTab] = useState<TabType | null>(null);
  const validTabs: TabType[] = ['faq', 'shipping', 'returns', 'contact'];
  const activeTab: TabType = manualTab ?? (validTabs.includes(activeTabParam) ? activeTabParam : 'faq');
  const setActiveTab = setManualTab;

  const { cartCount, state } = useCart();

  // Contact Form State
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const [sendError, setSendError] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendError('');
    try {
      const response = await fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send your message.');
      setSubmitted(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send your message.');
    } finally { setSending(false); }
  };

  const tabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'shipping', label: 'Shipping Policy', icon: Truck },
    { id: 'returns', label: 'Returns & refunds', icon: RotateCcw },
    { id: 'contact', label: 'Contact Us', icon: MessageSquare }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <ShopNav cartCount={cartCount} wishlistCount={state.wishlist.length} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 py-12">
        
        {/* Back Link */}
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Shop
        </Link>

        {/* Title */}
        <div className="mb-10 space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Customer Support</h1>
          <p className="text-sm text-gray-500">How can we help you today? Select a section below to get started.</p>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-gray-200 overflow-x-auto gap-2 mb-8 no-scrollbar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-semibold whitespace-nowrap transition-all ${
                  active 
                    ? 'border-black text-black' 
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-10 min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              
              {/* FAQ Section */}
              {activeTab === 'faq' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-sky-500" /> Frequently Asked Questions
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    {[
                      {
                        q: 'How does the AI curated surprise package work?',
                        a: 'Tell us about the recipient and occasion to get suggestions from available catalog products. Approving a gift saves your preference; it does not charge you, reserve stock or book delivery. Purchase separately through checkout.'
                      },
                      {
                        q: 'Can I view the products before they are shipped?',
                        a: 'Yes. You can review gift suggestions and product details before purchasing. Confirmed purchases appear on your Orders page.'
                      },
                      {
                        q: 'What is the delivery time?',
                        a: 'Delivery timing depends on the provider and destination. Contact support before ordering for a fixed occasion date; a saved gift plan does not guarantee delivery.'
                      },
                      {
                        q: 'Can I write my own greeting card?',
                        a: 'Absolutely! You can write it yourself during checkout, or use our built-in AI Card Writer in the Hub to draft a beautiful, personalized message.'
                      }
                    ].map((faq, idx) => (
                      <div key={idx} className="border-b border-gray-100 pb-5 last:border-0 last:pb-0 space-y-2">
                        <p className="font-bold text-gray-900 text-base">Q: {faq.q}</p>
                        <p className="text-sm text-gray-500 leading-relaxed pl-5">A: {faq.a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shipping Policy */}
              {activeTab === 'shipping' && (
                <div className="space-y-6 leading-relaxed text-gray-600 text-sm">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                    <Truck className="w-5 h-5 text-sky-500" /> Shipping & Delivery Policy
                  </h3>
                  <p>
                    Checkout currently supports delivery addresses in India. Availability depends on the product, provider and destination. Gift wrapping is an optional checkout selection.
                  </p>
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 space-y-3">
                    <h4 className="font-bold text-gray-900 text-xs uppercase tracking-wider">Estimated Delivery Timelines</h4>
                    <ul className="list-disc list-inside space-y-1.5 text-gray-500 text-xs">
                      <li><strong>Delivery dates:</strong> Contact support to confirm timing before placing a date-sensitive order.</li>
                      <li><strong>Shipping charges:</strong> Review the merchant shipping charge at checkout. Orders from multiple providers may include multiple parcels.</li>
                      <li><strong>International shipping:</strong> Not available through this checkout.</li>
                    </ul>
                  </div>
                  <p>
                    View your saved order status on the Orders page. Contact support with your order number for dispatch or tracking details.
                  </p>
                </div>
              )}

              {/* 30-Day Returns */}
              {activeTab === 'returns' && (
                <div className="space-y-6 leading-relaxed text-gray-600 text-sm">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                    <RotateCcw className="w-5 h-5 text-sky-500" /> Returns & Refunds
                  </h3>
                  <p>
                    Check the product-specific return and cancellation terms before checkout. For a damaged item, incorrect delivery or payment problem, contact support with your order number and a description of the issue.
                  </p>
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 space-y-2">
                    <p className="font-bold text-emerald-900 text-sm">How to initiate a return:</p>
                    <ol className="list-decimal list-inside text-emerald-800 text-xs space-y-1">
                      <li>Log in to your doodle_G account and locate the order in your dashboard.</li>
                      <li>Open the Contact Us tab and describe the item and issue.</li>
                      <li>Wait for support to confirm the return instructions before sending any item back.</li>
                    </ol>
                  </div>
                  <p className="text-xs text-gray-400">
                    Refund requests are reviewed by support. An online payment marked for review has not been automatically refunded. Keep your payment reference until the issue is resolved.
                  </p>
                </div>
              )}

              {/* Contact Us Form */}
              {activeTab === 'contact' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  
                  {/* Contact Info */}
                  <div className="md:col-span-5 space-y-6">
                    <h3 className="text-xl font-bold text-gray-900">Get in Touch</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Have a query about corporate orders, custom packaging options, or bulk delivery requests? Drop us a line!
                    </p>
                    <p className="text-sm text-gray-600">Use this form for order and payment support. Include your order number or checkout reference. Never send card details, passwords or verification codes.</p>
                  </div>

                  {/* Form */}
                  <div className="md:col-span-7 bg-gray-50 rounded-2xl p-6 border border-gray-100">
                    {submitted ? (
                      <div className="text-center py-10 space-y-3">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                          <Check className="w-6 h-6 text-emerald-600" />
                        </div>
                        <h4 className="font-bold text-gray-900">Message Sent!</h4>
                        <p className="text-xs text-gray-400">Your request has been accepted for email delivery. Keep your order or payment reference for follow-up.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4">
                        {sendError && <p role="alert" className="text-sm text-red-700">{sendError}</p>}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Name</label>
                            <input
                              type="text"
                              value={form.name}
                              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                              placeholder="Alex Mercer"
                              required
                              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-black"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Email</label>
                            <input
                              type="email"
                              value={form.email}
                              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                              placeholder="alex@gmail.com"
                              required
                              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-black"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Subject (Optional)</label>
                          <input
                            type="text"
                            value={form.subject}
                            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                            placeholder="Corporate gift inquiry"
                            className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-black"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Message</label>
                          <textarea
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                            placeholder="Tell us what you need help with..."
                            rows={4}
                            required
                            className="w-full bg-white border border-gray-200 rounded-xl p-3.5 text-xs text-gray-900 focus:outline-none focus:border-black resize-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={sending}
                          className="w-full bg-black text-white font-bold py-3 rounded-xl text-xs hover:bg-gray-900 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {sending ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                          ) : (
                            <><Send className="w-3.5 h-3.5" /> Send Message</>
                          )}
                        </button>
                      </form>
                    )}
                  </div>

                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

      </main>

      <ShopFooter />
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-black" />
      </div>
    }>
      <SupportPageContent />
    </Suspense>
  );
}
