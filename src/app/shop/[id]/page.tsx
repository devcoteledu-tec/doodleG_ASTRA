import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SITE_NAME, absoluteUrl, truncateForMeta } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ProductDetailPageClient from './ProductDetailPageClient';

type ProductRow = {
  id: string;
  slug: string | null;
  product_name: string;
  price_in_rupees: number | string;
  product_description: string | null;
  product_images: string[] | null;
  category: string;
  star_count: number | string | null;
  total_reviews: number | string | null;
  available_qty: number | null;
};

// Same UUID-vs-static-slug lookup as src/app/api/products/[id]/route.ts —
// duplicated here (rather than imported) because this runs at request/build
// time as part of `generateMetadata`, before the client component's own
// fetch happens, and importing a route handler module directly isn't
// supported. Keep both in sync if the products_box lookup logic changes.
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// The one true URL for a product: its slug when it has one, the UUID
// otherwise. Every reference to this product's own URL below (canonical
// tag, Open Graph url, JSON-LD offer url, and the redirect target) goes
// through this function so they can never drift out of sync with each
// other or with sitemap.ts, which applies the same preference.
function canonicalPathFor(product: ProductRow): string {
  return `/shop/${product.slug || product.id}`;
}

type ReviewRow = {
  user_name: string;
  rating: number;
  description_of_product: string;
  date_of_posted: string;
};

async function fetchReviewsForMetadata(productId: string): Promise<ReviewRow[]> {
  try {
    // Same safe, explicit column list as src/app/api/products/[id]/route.ts —
    // never select('*') here, and never include reviews.user_id: see the
    // security note on that route for why (it's the signin.id of the
    // reviewer, and leaking it publicly was the seed list for a prior
    // account-takeover chain).
    const { data, error } = await supabaseAdmin
      .from('reviews')
      .select('user_name, rating, description_of_product, date_of_posted')
      .eq('product_id', productId)
      .order('date_of_posted', { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data as ReviewRow[]) ?? [];
  } catch (error) {
    console.error('generateMetadata(shop/[id]): failed to load reviews', error);
    return [];
  }
}

async function fetchProductForMetadata(id: string): Promise<ProductRow | null> {
  try {
    if (isUUID(id)) {
      const { data } = await supabaseAdmin.from('catalog_products').select('*').eq('id', id).maybeSingle();
      return (data as ProductRow) ?? null;
    }
    // Slug lookup — see the equivalent branch in
    // src/app/api/products/[id]/route.ts + supabase_migration_017.
    const { data } = await supabaseAdmin
      .from('catalog_products')
      .select('*')
      .eq('slug', id)
      .maybeSingle();
    return (data as ProductRow) ?? null;
  } catch (error) {
    console.error('generateMetadata(shop/[id]): failed to load product', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProductForMetadata(id);

  if (!product) {
    return {
      title: 'Gift Not Found',
      description: 'This gift listing is no longer available. Browse the full doodle_G shop for more curated gifts.',
      robots: { index: false, follow: true },
    };
  }

  // Title is written to match the way people actually search: recipient +
  // occasion + product. e.g. "Rose Chocolate Box — Handmade Gift for
  // Girlfriend, Birthday & Anniversary | doodle_G". Product name still
  // leads so a direct brand/product search still hits.
  const title = `${product.product_name} — Handmade ${product.category} Gift for Girlfriend, Boyfriend & Family`;
  const description = truncateForMeta(
    product.product_description ||
      `Buy ${product.product_name} — a handmade ${product.category.toLowerCase()} gift box from doodle_G at \u20B9${product.price_in_rupees}. Perfect gift for girlfriend, boyfriend, wife, husband, mom or dad for birthdays, anniversaries and every occasion. AI-curated, sourced from independent home makers and artisans across India.`
  );
  const image = product.product_images?.[0];
  const canonical = canonicalPathFor(product);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      images: image ? [{ url: image, alt: product.product_name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await fetchProductForMetadata(id);

  // A product with a slug should only ever be served at its slug URL.
  // Before this fix, the UUID URL and the slug URL were both live,
  // internal links pointed at the UUID everywhere, and the canonical tag
  // (above) pointed at the slug — three different signals about which URL
  // is "the" page, which is exactly the kind of duplicate-content
  // confusion that keeps a page from ranking. A permanent redirect here
  // collapses that to one URL: whoever lands on /shop/{uuid} (an old
  // link, a bookmark, a stale search result) is sent straight to
  // /shop/{slug}, and every crawler that follows it learns the slug URL
  // is the only one that matters going forward.
  if (product?.slug && id !== product.slug) {
    redirect(canonicalPathFor(product));
  }

  // Product JSON-LD drives Google's rich results (price, availability,
  // star rating) directly in search — and gives any LLM/answer engine that
  // crawls this page a structured, unambiguous source for "how much does
  // X cost" / "is X in stock" instead of having to parse it out of the
  // rendered UI text.
  const reviews = product ? await fetchReviewsForMetadata(product.id) : [];
  const productJsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.product_name,
        description: product.product_description || undefined,
        image: product.product_images || undefined,
        category: product.category,
        // sku: stable per-product identifier for Google/answer engines to
        // key on across re-crawls — the row's own id is already the
        // permanent identifier (the slug can change if a provider renames
        // the product; the id never does).
        sku: product.id,
        url: absoluteUrl(canonicalPathFor(product)),
        brand: { '@type': 'Brand', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          url: absoluteUrl(canonicalPathFor(product)),
          priceCurrency: 'INR',
          price: Number(product.price_in_rupees) || undefined,
          availability:
            product.available_qty && product.available_qty > 0
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        },
        ...(Number(product.total_reviews) > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(product.star_count) || 5,
                reviewCount: Number(product.total_reviews),
              },
            }
          : {}),
        // Individual Review entries (capped at 10, most recent first) —
        // AggregateRating alone tells a crawler "4.8 stars, 30 reviews";
        // actual Review bodies give it real customer language to quote or
        // reason from, which is what both Google's rich-review snippets
        // and answer engines actually surface. Capped rather than
        // exhaustive so the page payload doesn't grow unbounded as review
        // counts climb — 10 recent reviews is plenty of signal.
        ...(reviews.length > 0
          ? {
              review: reviews.map((r) => ({
                '@type': 'Review',
                author: { '@type': 'Person', name: r.user_name },
                datePublished: r.date_of_posted,
                reviewBody: r.description_of_product,
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: r.rating,
                  bestRating: 5,
                  worstRating: 1,
                },
              })),
            }
          : {}),
      }
    : null;

  return (
    <>
      {productJsonLd && <JsonLd data={productJsonLd} />}
      <ProductDetailPageClient params={params} />
    </>
  );
}
