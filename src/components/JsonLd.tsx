/**
 * Renders a JSON-LD <script> tag for structured data.
 *
 * Structured data is what lets Google (and other engines) show rich
 * results — star ratings and price on product listings, an FAQ accordion
 * under the support page, sitelinks search box under the homepage — and
 * it's also the cleanest signal for AI assistants/LLMs that answer
 * questions "with sources": a well-formed schema.org object is far easier
 * for a model to lift a correct fact from than free-text prose. Every page
 * that renders one of these should pass a single object or an array of
 * objects (schema.org allows a top-level `@graph`, but separate <script>
 * tags per object are simpler to compose across nested layouts).
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output only — no user-supplied HTML is ever
      // interpolated into this script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
