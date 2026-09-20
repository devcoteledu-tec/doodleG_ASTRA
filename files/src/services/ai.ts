import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { GiftTier } from '@/lib/giftDomain';
import type { ScoredProduct, RecipientProfileInput } from '@/lib/giftMatching';
import { hasGenuineMatch } from '@/lib/giftMatching';

// Initialize the Gemini API client
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface CuratedGift {
  tier: 'CLASSIC' | 'GRAND' | 'LUXURY';
  title: string;
  description: string;
  estimatedPrice: number;
  reason: string;
  /**
   * Present when this package was grounded in a real `products_box` row
   * (see AIService.curateGiftsFromCatalog). Absent for the legacy free-text
   * curation path (getMockCurations / the plain curateGifts prompt), which
   * doesn't reference an actual sellable product.
   */
  productId?: string;
  productImage?: string;
}

export interface CurationResult {
  giftPackages: CuratedGift[];
}

export interface CardWriterResult {
  cardMessage: string;
}

/**
 * AI Service for doodle_G handling structured gift curation and card message generation.
 */
export class AIService {
  /**
   * Curates 3 unique gift packages (Classic, Grand, Luxury) based on recipient profile.
   */
  static async curateGifts(params: {
    recipientName: string;
    relationship: string;
    interests: string;
    quirks?: string | null;
    dynamic?: string | null;
    occasionTitle: string;
  }): Promise<CurationResult> {
    if (!genAI) {
      if (process.env.NODE_ENV === 'production') {
        // validateEnv() (see src/lib/env.ts, run at boot via
        // instrumentation.ts) should have already failed server startup if
        // GEMINI_API_KEY were missing in production. Reaching here anyway
        // means something bypassed that check — fail loudly instead of
        // silently serving fake gift curations to a real customer.
        throw new Error('GEMINI_API_KEY is not set in production. Refusing to serve mock gift curations.');
      }
      console.warn('GEMINI_API_KEY is not set. Using high-quality mock curations for demonstration.');
      return this.getMockCurations(params);
    }

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              giftPackages: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    tier: {
                      type: SchemaType.STRING,
                      enum: ['CLASSIC', 'GRAND', 'LUXURY'],
                      format: 'enum',
                      description: 'The target budget tier of the gift package.',
                    },
                    title: {
                      type: SchemaType.STRING,
                      description: 'A catchy, creative title for the gift package.',
                    },
                    description: {
                      type: SchemaType.STRING,
                      description: 'A detailed description of the package items, how to source them, or what experience they represent.',
                    },
                    estimatedPrice: {
                      type: SchemaType.NUMBER,
                      description: 'The estimated price in Indian Rupees (INR). Classic: under ₹500, Grand: ₹500-₹2,500, Luxury: ₹2,500-₹10,000+.',
                    },
                    reason: {
                      type: SchemaType.STRING,
                      description: 'The emotional or logical connection mapping why this gift is perfect for this specific persona.',
                    },
                  },
                  required: ['tier', 'title', 'description', 'estimatedPrice', 'reason'],
                },
              },
            },
            required: ['giftPackages'],
          },
        },
      });

      const prompt = `
        You are the curation engine for "doodle_G", an elite, AI-driven Surprise Gift Concierge web app that specializes in "Frictionless Sentimentality" and highly unexpected, premium gift curations.
        
        Generate exactly 3 hyper-curated, creative, and highly personalized gift packages for the following recipient:
        - Name: ${params.recipientName}
        - Relationship: ${params.relationship}
        - Interests/Hobbies: ${params.interests}
        - Unique Quirks/Details: ${params.quirks || 'None specified'}
        - Relationship Dynamic/Vibe: ${params.dynamic || 'Standard'}
        - Upcoming Occasion: ${params.occasionTitle}

        You MUST map the packages exactly to these three budget tiers:
        1. CLASSIC: Under ₹500 (e.g. bespoke items, emotional keepsakes, smart practical gifts).
        2. GRAND: ₹500 to ₹2,500 (e.g. high-quality curated sets, custom premium designs, specialty experiences).
        3. LUXURY: ₹2,500 to ₹10,000+ (e.g. rare collectors' items, premium weekend getaways, designer customizations).

        Important Guidelines:
        - Avoid generic gifts (e.g., standard generic flower bouquets, basic gift cards, or plain mugs).
        - Focus on thoughtfulness and creative surprises that weave in their interests, quirks, and your dynamic together.
        - The reason should explain how this celebrates their unique quirks and dynamic.
      `;

      const response = await model.generateContent(prompt, { timeout: 10000 });
      const text = response.response.text();
      return JSON.parse(text) as CurationResult;
    } catch (error) {
      console.error('Gemini API Curation Error:', error);
      if (process.env.NODE_ENV === 'production') throw new Error('Gift suggestions are temporarily unavailable.');
      return this.getMockCurations(params);
    }
  }

  /**
   * Curates 3 gift packages (Classic, Grand, Luxury) grounded in real
   * `products_box` inventory, instead of inventing a product that doesn't
   * exist and can never actually ship.
   *
   * `candidatesByTier` should already be the top-scored, in-stock products
   * per tier for this recipient (see src/lib/giftMatching.ts
   * rankCandidatesByTier) — this method never picks a product outside that
   * list. If Gemini is unavailable, misbehaves, or returns a product outside
   * the given candidates, we fall back to the top-scored real candidate for
   * that tier, so the result is always grounded in actual inventory.
   */
  static async curateGiftsFromCatalog(
    profile: RecipientProfileInput & { recipientName: string; relationship: string },
    candidatesByTier: Record<GiftTier, ScoredProduct[]>
  ): Promise<CurationResult> {
    const fallback = () => this.buildCatalogFallback(profile, candidatesByTier);

    // No tier has any in-stock candidate at all — nothing real to ground on.
    const hasAnyCandidates = (Object.values(candidatesByTier) as ScoredProduct[][]).some((c) => c.length > 0);
    if (!hasAnyCandidates) return { giftPackages: [] };

    if (!genAI) {
      if (process.env.NODE_ENV === 'production') {
        return fallback();
      }
      console.warn('GEMINI_API_KEY is not set. Ranking candidates deterministically instead of via Gemini.');
      return fallback();
    }

    try {
      const tiers: GiftTier[] = ['CLASSIC', 'GRAND', 'LUXURY'];
      const catalogListing = tiers
        .map((tier) => {
          const candidates = candidatesByTier[tier];
          if (candidates.length === 0) return `${tier}: (no in-stock products in this price band — skip this tier)`;
          const lines = candidates
            .map(
              (p) =>
                `  - id="${p.id}" | ${p.name} | category: ${p.category} | ₹${p.price} | ` +
                `rating: ${p.rating.toFixed(1)}/5 (${p.totalReviews} reviews) | ${p.description.slice(0, 200)}`
            )
            .join('\n');
          return `${tier} (choose exactly one "id" from this list):\n${lines}`;
        })
        .join('\n\n');

      const taggedMember = profile.taggedMember;
      const memberSignalBlock = taggedMember
        ? `
        This recipient is a real doodle_G member who has been tagged in this request, so you have first-party
        signal about them, not just the sender's guess:
        - Categories of products they have already liked: ${taggedMember.likedCategories?.length ? taggedMember.likedCategories.join(', ') : 'none on file'}
        - Their own stated interests on file: ${taggedMember.statedInterests?.length ? taggedMember.statedInterests.join(', ') : 'none on file'}
        Weigh this real, first-party signal above the sender's free-text guesses when the two disagree — it reflects
        what this specific person has actually chosen to like, not what the sender assumes they'd like. Do not
        recommend a product they have already liked (any such products have already been excluded from the
        candidate lists above); instead use their liked categories to find something in a similar style they don't
        already have.`
        : '';

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              giftPackages: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    tier: { type: SchemaType.STRING, enum: ['CLASSIC', 'GRAND', 'LUXURY'], format: 'enum' },
                    productId: {
                      type: SchemaType.STRING,
                      description: 'Must exactly match one of the "id" values given for this tier in the prompt. Never invent an id.',
                    },
                    reason: {
                      type: SchemaType.STRING,
                      description: 'The emotional or logical connection mapping why this exact product is perfect for this specific persona.',
                    },
                  },
                  required: ['tier', 'productId', 'reason'],
                },
              },
            },
            required: ['giftPackages'],
          },
        },
      });

      const prompt = `
        You are the curation engine for "doodle_G", an elite AI-driven Surprise Gift Concierge.

        You must recommend gifts EXCLUSIVELY from the real, in-stock product catalog below — never invent a product. For each tier, pick the single best-matching product id from that tier's list only, and explain why it suits this recipient.

        Recipient:
        - Name: ${profile.recipientName}
        - Relationship: ${profile.relationship}
        - Interests/Hobbies: ${profile.interests || 'Not specified'}
        - Unique Quirks/Details: ${profile.quirks || 'None specified'}
        - Relationship Dynamic/Vibe: ${profile.dynamic || 'Standard'}
        - Upcoming Occasion: ${profile.occasionTitle || 'a celebration'}
        ${memberSignalBlock}

        Catalog (grouped by budget tier, with each product's real rating and review count):
        ${catalogListing}

        Rules:
        - "productId" MUST be copied exactly from the "id" field of a listed candidate in that same tier. Do not modify it.
        - If a tier has no candidates, omit that tier entirely from your response.
        - The reason should tie the specific product's real attributes to the recipient's interests, quirks, and dynamic.
        - If nothing in a tier's candidate list genuinely relates to the stated interests (e.g. their interest is
          "technology" but this is a food/gift catalog with no tech products), do NOT invent a fake connection.
          Instead, frame the pick honestly as a deliberate curatorial choice: something exceptional and
          universally well-loved, chosen precisely because a great gift doesn't always need to literally match a
          hobby — that reads as confident and premium, not confused or thin. Never force a strained link.
        - When two candidates in the same tier fit the recipient about equally well, prefer the one with the higher rating and more reviews — a well-reviewed real product is a safer recommendation than an untested one, all else being equal. Fit still comes first: never pick a poorly-matched product just because it has more reviews.
      `;

      const response = await model.generateContent(prompt, { timeout: 10000 });
      const text = response.response.text();
      const parsed = JSON.parse(text) as { giftPackages: { tier: GiftTier; productId: string; reason: string }[] };

      const packages: CuratedGift[] = [];
      for (const tier of tiers) {
        const candidates = candidatesByTier[tier];
        if (candidates.length === 0) continue;

        const picked = parsed.giftPackages?.find((g) => g.tier === tier);
        // Guardrail: only trust the model's pick if it's actually one of the
        // real candidates we gave it for this tier. Anything else (hallucinated
        // id, wrong tier, missing) falls back to the top-scored real product.
        const validProduct = picked ? candidates.find((c) => c.id === picked.productId) : undefined;
        const product = validProduct || candidates[0];
        const reason = validProduct && picked ? picked.reason : this.buildDeterministicReason(profile, product);

        packages.push({
          tier,
          title: product.name,
          description: product.description,
          estimatedPrice: product.price,
          reason,
          productId: product.id,
          productImage: product.image,
        });
      }

      return packages.length > 0 ? { giftPackages: packages } : fallback();
    } catch (error) {
      console.error('Gemini API Catalog Curation Error:', error);
      return fallback();
    }
  }

  /**
   * Deterministic, no-AI ranking, used when Gemini is unavailable. Rather
   * than always taking the single top-scored candidate — which is what
   * made every recipient with no strong match see the exact same product,
   * since a tie always broke the same way — this picks among the
   * near-tied top few candidates (within 10% of the leading score) using a
   * stable hash of the recipient's own name and occasion. Same person,
   * same occasion always gets the same pick (so it never feels random or
   * inconsistent to them), but different recipients spread across the
   * near-ties instead of funneling onto one "default" product.
   */
  private static buildCatalogFallback(
    profile: RecipientProfileInput & { recipientName: string; relationship: string },
    candidatesByTier: Record<GiftTier, ScoredProduct[]>
  ): CurationResult {
    const tiers: GiftTier[] = ['CLASSIC', 'GRAND', 'LUXURY'];
    const packages: CuratedGift[] = [];
    const seed = `${profile.recipientName}::${profile.occasionTitle || ''}`;

    for (const tier of tiers) {
      const candidates = candidatesByTier[tier];
      if (candidates.length === 0) continue;

      const topScore = candidates[0].score;
      const nearTies = candidates.filter((c) => c.score >= topScore * 0.9).slice(0, 3);
      const product = nearTies[this.stableHash(seed + tier) % nearTies.length];

      packages.push({
        tier,
        title: product.name,
        description: product.description,
        estimatedPrice: product.price,
        reason: this.buildDeterministicReason(profile, product),
        productId: product.id,
        productImage: product.image,
      });
    }

    return { giftPackages: packages };
  }

  /** Small, stable string hash — good enough for picking an index, not for anything cryptographic. */
  private static stableHash(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  private static buildDeterministicReason(
    profile: RecipientProfileInput & { recipientName: string },
    product: ScoredProduct
  ): string {
    // Same priority as the Gemini prompt's memberSignalBlock: a tagged
    // member's own liked-category history or stated interests are real,
    // first-party signal and should be credited over the sender's free-text
    // guess when both exist.
    const taggedMember = profile.taggedMember;
    const matchedOnLikedCategory = taggedMember?.likedCategories?.some(
      (c) => c.toLowerCase() === product.category.toLowerCase()
    );
    const genuineMatch = hasGenuineMatch(product, profile);

    const interestPhrase =
      (matchedOnLikedCategory && `things they've already shown they like in ${product.category}`) ||
      (taggedMember?.statedInterests?.length && taggedMember.statedInterests.slice(0, 2).join(' and ')) ||
      (profile.interests || '').split(',')[0]?.trim() ||
      'their interests';

    // Two honestly different voices, not one template stretched over both
    // cases: when something in the catalog genuinely speaks to the stated
    // interest, say so plainly. When nothing does — a real limit of a
    // ~100-SKU catalog against an open-ended interest like "technology" —
    // the premium move isn't to fake a connection, it's to frame the pick
    // as a deliberate curatorial call: something universally excellent,
    // chosen on their behalf precisely because it doesn't need to match a
    // literal hobby to land well as a gift.
    if (genuineMatch) {
      return `Chosen for ${profile.recipientName}'s love of ${interestPhrase} — ${product.name} is one of our most-loved picks (${product.rating.toFixed(1)}★, ${product.totalReviews} reviews) in ${product.category}, and a genuine fit for the occasion.`;
    }

    return `${profile.recipientName}'s taste for ${interestPhrase} pointed us toward something a little different: ${product.name}, one of our most consistently loved picks (${product.rating.toFixed(1)}★, ${product.totalReviews} reviews). Great gifting often means a delightful surprise over a literal match — and this is one of our most trusted choices for exactly that.`;
  }

  /**
   * Generates a custom greeting card message matching the emotional tone, dynamic, and personal memory.
   */
  static async generateCardMessage(params: {
    senderName: string;
    recipientName: string;
    relationship: string;
    occasionTitle: string;
    tone: 'sentimental' | 'witty' | 'inside-jokes';
    personalDetail?: string;
  }): Promise<CardWriterResult> {
    if (!genAI) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('GEMINI_API_KEY is not set in production. Refusing to serve a mock card message.');
      }
      console.warn('GEMINI_API_KEY is not set. Using high-quality mock card message.');
      return this.getMockCardMessage(params);
    }

    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              cardMessage: {
                type: SchemaType.STRING,
                description: 'The full text of the custom printed greeting card message, formatted with paragraph breaks.',
              },
            },
            required: ['cardMessage'],
          },
        },
      });

      const prompt = `
        You are a master greeting card writer for "doodle_G". Your goal is to write a print-ready custom message that avoids cliche greeting card language, feels highly authentic, and matches the requested tone.

        Details:
        - Sender: ${params.senderName}
        - Recipient: ${params.recipientName}
        - Relationship: ${params.relationship}
        - Occasion: ${params.occasionTitle}
        - Selected Tone: ${params.tone} (Options: sentimental, witty, inside-jokes)
        - Personal Memory or Specific Detail to Include: ${params.personalDetail || 'None specified'}

        Tone Rules:
        - sentimental: Deeply warm, appreciative, touching, highlighting the emotional bond.
        - witty: Humorous, smart, playful, a little teasing, but still affectionate.
        - inside-jokes: Highly specific, references shared memories, eccentric, yet showing deep closeness.

        Format the output with appropriate paragraph breaks. Start and end naturally without header placeholders.
      `;

      const response = await model.generateContent(prompt, { timeout: 10000 });
      const text = response.response.text();
      return JSON.parse(text) as CardWriterResult;
    } catch (error) {
      console.error('Gemini API Card Writer Error:', error);
      if (process.env.NODE_ENV === 'production') throw new Error('Card writing is temporarily unavailable.');
      return this.getMockCardMessage(params);
    }
  }

  /**
   * Local High-Quality Mock Curations for testing/demonstration without API Key.
   */
  private static getMockCurations(params: {
    recipientName: string;
    relationship: string;
    interests: string;
    quirks?: string | null;
    dynamic?: string | null;
  }): CurationResult {
    const name = params.recipientName;
    const firstInterest = params.interests.split(',')[0]?.trim() || 'hobbies';

    return {
      giftPackages: [
        {
          tier: 'CLASSIC',
          title: `The "Foundations of ${firstInterest}" Starter Kit`,
          description: `A hand-picked selection of bespoke items catering to ${name}'s love for ${params.interests}. Includes a premium notebook, a custom leather keychain customized with their initials, and a handwritten recipe/guide booklet tailored to their quirks.`,
          estimatedPrice: 420.0,
          reason: `Combines their strong passion for ${firstInterest} with a deeply personal, low-profile item they can use daily, celebrating the ${params.dynamic || 'special'} connection you share.`,
        },
        {
          tier: 'GRAND',
          title: `The Premium "${firstInterest} & Reflection" Package`,
          description: `A custom-packaged gift crate featuring a high-quality double-walled thermal flask, an artisanal gift basket from local shops representing their favorite quirks (${params.quirks || 'unique details'}), and a beautifully bound hard-cover journal.`,
          estimatedPrice: 1400.0,
          reason: `Elevates their interest in ${firstInterest} into a luxury weekend ritual, showing that you pay close attention to details like "${params.quirks || 'their unique habits'}" in a sophisticated setup.`,
        },
        {
          tier: 'LUXURY',
          title: `The Ultimate "${name}'s Legacy" Experience`,
          description: `An all-inclusive customized experience. Includes a masterclass or workshop reservation with a renowned expert in ${firstInterest}, a luxury leather carrier bag custom-tailored with custom engravings, and a luxury dinner voucher for two at a top-tier restaurant.`,
          estimatedPrice: 4200.0,
          reason: `A statement gift package designed to make ${name} feel truly celebrated, marking the ${params.relationship} dynamic with an unforgettable memory that they would never buy for themselves.`,
        },
      ],
    };
  }

  /**
   * Local Greeting Card Mock.
   */
  private static getMockCardMessage(params: {
    senderName: string;
    recipientName: string;
    tone: string;
    personalDetail?: string;
  }): CardWriterResult {
    let msg = '';
    if (params.tone === 'sentimental') {
      msg = `Dear ${params.recipientName},\n\nThere are moments when I look back and realize how incredibly lucky I am to have you in my life. Your warmth, patience, and the way you bring light into every room are things I cherish more than words can express.\n\n${params.personalDetail ? `I was thinking about ${params.personalDetail} the other day, and it reminded me of just how special our time together is. ` : ''}Thank you for being my constant support and my favorite person to share this journey with.\n\nHappy Occasion! With all my love,\n${params.senderName}`;
    } else if (params.tone === 'witty') {
      msg = `Happy Occasion, ${params.recipientName}!\n\nI wanted to get you something that matches your charm, intelligence, and overall brilliance, but unfortunately, they don't sell clones of me yet. So instead, you get this card!\n\n${params.personalDetail ? `Even though we will never live down the memory of ${params.personalDetail}, ` : ''}I'm incredibly grateful to have you around to make me look like the sensible one. Here's to surviving another year of our shenanigans!\n\nCheers,\n${params.senderName}`;
    } else {
      msg = `To my partner-in-crime, ${params.recipientName},\n\nIf anyone saw us during ${params.personalDetail || 'our daily routines'}, they'd probably lock us both up. But that's exactly why I love our dynamic.\n\nThanks for understanding the jokes no one else gets, and for being the one person I can always count on. Let's make this day another one for the books.\n\nBest,\n${params.senderName}`;
    }

    return { cardMessage: msg };
  }
}
