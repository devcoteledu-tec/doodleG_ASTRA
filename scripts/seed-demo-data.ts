/**
 * Explicit demo-data seeder for local development.
 *
 * The dashboard route (`/api/dashboard`) used to silently create a demo
 * "Alex Mercer" account and two demo recipients (Sarah/Eleanor) the first
 * time anyone hit it with an empty list. That meant every visitor saw (or
 * silently recreated) the same fake account, and there was no way to get a
 * real empty state. Demo seeding is now only ever triggered by explicitly
 * running this script.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo-data.ts
 *   (optionally: --email you@example.com to seed under a specific existing account)
 *
 * Safe to re-run against the same account — it only inserts the two demo
 * recipients if that account doesn't already have any recipients.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const emailArgIndex = process.argv.indexOf('--email');
const DEMO_EMAIL = emailArgIndex !== -1 ? process.argv[emailArgIndex + 1] : 'demo@doodleg.com';
const DEMO_NAME = 'Alex Mercer';
const DEMO_PHONE = '+1 (555) 019-9000';

async function main() {
  console.log(`Seeding demo data for ${DEMO_EMAIL}...`);

  // 1. Find or create the demo account. No password is set here — sign in
  //    via /api/auth/signup separately if you need to log into it in the UI,
  //    or set SUPABASE service-role fields directly for a throwaway dev DB.
  const { data: userSign } = await supabase
    .from('signin')
    .select('id')
    .eq('email', DEMO_EMAIL)
    .maybeSingle();

  let userId: string;
  if (userSign) {
    userId = userSign.id;
    console.log(`Found existing account ${userId}.`);
  } else {
    const { data: newUser, error } = await supabase
      .from('signin')
      .insert({ user_name: DEMO_NAME, email: DEMO_EMAIL, mobile_number: DEMO_PHONE })
      .select('id')
      .single();
    if (error || !newUser) throw error || new Error('Failed to create demo signin.');
    userId = newUser.id;
    console.log(`Created new demo account ${userId}. Set a password via /api/auth/signup or your Supabase dashboard to log in.`);
  }

  // 2. Find or create the profile.
  const { data: profile } = await supabase.from('profile').select('id').eq('user_id', userId).maybeSingle();
  let profileId: string;
  if (profile) {
    profileId = profile.id;
  } else {
    const { data: newProfile, error } = await supabase
      .from('profile')
      .insert({
        user_id: userId,
        name: DEMO_NAME,
        age: 28,
        subscription_type: 'prime',
        topic_interested: ['technology', 'photography', 'books'],
      })
      .select('id')
      .single();
    if (error || !newProfile) throw error || new Error('Failed to create demo profile.');
    profileId = newProfile.id;
  }

  // 3. Bail out if this account already has recipients — don't duplicate demo data.
  const { data: existing } = await supabase.from('recipients').select('id').eq('profile_id', profileId);
  if (existing && existing.length > 0) {
    console.log(`Account already has ${existing.length} recipient(s). Nothing to seed.`);
    return;
  }

  const anniversaryDate = new Date();
  anniversaryDate.setDate(anniversaryDate.getDate() + 12);
  const motherBirthday = new Date();
  motherBirthday.setDate(motherBirthday.getDate() + 15);

  const demoRecipients = [
    {
      name: 'Sarah Mercer',
      relationship: 'Spouse',
      hobbies_and_interest: 'photography, astronomy, sci-fi, matcha',
      quirks: 'Drinks hot chocolate in summer, collects polaroid cameras, hates loud chewing.',
      dynamic: 'Warm & emotional',
      budget_tier: 'GRAND',
      occasion: { title: '5th Wedding Anniversary', date: anniversaryDate, isRecurring: true },
      cycle: {
        status: 'APPROVED' as const,
        selectedTier: 'GRAND' as const,
        customCardMessage:
          'Dear Sarah,\n\nFive years ago today, I made the best decision of my life. From our midnight star-gazing sessions to developing Polaroids in the kitchen, every single day with you is a new adventure.\n\nHappy 5th Anniversary, my love. Here is to a lifetime more of matcha lattes and chasing the stars together.\n\nForever yours,\nAlex',
      },
      packages: [
        { tier: 'CLASSIC', title: 'Custom Celestial Constellation Print', description: 'A custom framed map showing the exact alignment of the stars on the night of your wedding anniversary. Hand-engraved with your names.', estimated_price: 45.0, reason: 'Celebrates her interest in astronomy and maps the emotional sentiment of your wedding night.' },
        { tier: 'GRAND', title: 'Premium Vintage Instax Crate & Organic Matcha Set', description: 'A restored vintage Polaroid camera bundle with two packs of film, coupled with a ceremonial-grade Japanese organic Uji Matcha starter whisk set.', estimated_price: 135.0, reason: 'Combines her twin passions for photography and matcha into a beautiful weekend experience kit.' },
        { tier: 'LUXURY', title: 'Under-the-Stars Luxury Glamping Dome Getaway', description: 'A weekend reservation voucher for two at a stargazing dome retreat in the mountains. Includes private chef matcha tasting menu.', estimated_price: 520.0, reason: 'The ultimate romantic gesture combining stargazing, matcha, and a premium weekend escape.' },
      ],
    },
    {
      name: 'Eleanor Mercer',
      relationship: 'Mother',
      hobbies_and_interest: 'classic literature, English tea, rose gardening, jazz',
      quirks: 'Refuses to read books on screens, loves Earl Grey, plays vinyl jazz records on rainy Sundays.',
      dynamic: 'Sentimental & respectful',
      budget_tier: 'CLASSIC',
      occasion: { title: '60th Birthday', date: motherBirthday, isRecurring: true },
      cycle: {
        status: 'CURATED' as const,
        selectedTier: 'CLASSIC' as const,
        customCardMessage:
          'Dearest Mom,\n\nHappy 60th Birthday! You have taught me the beauty of slow Sunday mornings, the comfort of a warm cup of tea, and the endless worlds inside books. Thank you for your strength and your gentle heart.\n\nWishing you a day filled with your favorite jazz tunes and the sweet scent of roses.\n\nAll my love and respect,\nAlex',
      },
      packages: [
        { tier: 'CLASSIC', title: 'Bespoke Vintage Edition of Jane Austen', description: 'A hand-bound, gold-embossed vintage collection of Pride and Prejudice, together with an assortment of loose-leaf organic Earl Grey tea.', estimated_price: 38.0, reason: 'Matches her preference for classic literature, physical books, and Earl Grey.' },
        { tier: 'GRAND', title: 'Solid Brass Rose Pruning Set & British Teapot', description: 'An elegant solid brass ergonomic gardening set, paired with a classic Royal Albert fine-bone china teapot.', estimated_price: 125.0, reason: "Connects her rose gardening routine with a high-class English afternoon tea ceremony." },
        { tier: 'LUXURY', title: 'Luxury Jazz Dinner Cruise & Rare Edition First-Print', description: 'Two tickets to a live jazz dinner cruise, and a certified rare early print copy of a classic literature masterpiece in a custom presentation case.', estimated_price: 650.0, reason: 'A historic milestone celebration of classic literature and jazz in an elite setting.' },
      ],
    },
  ];

  for (const demo of demoRecipients) {
    const { data: recipient, error: recipientErr } = await supabase
      .from('recipients')
      .insert({
        profile_id: profileId,
        name: demo.name,
        relationship: demo.relationship,
        hobbies_and_interest: demo.hobbies_and_interest,
        quirks: demo.quirks,
        dynamic: demo.dynamic,
        budget_tier: demo.budget_tier,
      })
      .select('id')
      .single();
    if (recipientErr || !recipient) throw recipientErr || new Error('Failed to create demo recipient.');

    const { data: occasion, error: occasionErr } = await supabase
      .from('occasions')
      .insert({
        recipient_id: recipient.id,
        title: demo.occasion.title,
        occasion_date: demo.occasion.date.toISOString().slice(0, 10),
        is_recurring: demo.occasion.isRecurring,
      })
      .select('id')
      .single();
    if (occasionErr || !occasion) throw occasionErr || new Error('Failed to create demo occasion.');

    const { data: cycle, error: cycleErr } = await supabase
      .from('gift_cycles')
      .insert({
        occasion_id: occasion.id,
        status: demo.cycle.status,
        selected_tier: demo.cycle.selectedTier,
        custom_card_message: demo.cycle.customCardMessage,
      })
      .select('id')
      .single();
    if (cycleErr || !cycle) throw cycleErr || new Error('Failed to create demo gift cycle.');

    const { error: pkgErr } = await supabase
      .from('gift_packages')
      .insert(demo.packages.map((p) => ({ ...p, gift_cycle_id: cycle.id })));
    if (pkgErr) throw pkgErr;

    console.log(`  ✅ Seeded ${demo.name} (recipient=${recipient.id})`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
