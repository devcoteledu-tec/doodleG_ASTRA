-- Migration 010: Ground gift_packages in the real product catalog
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: /api/curate previously asked Gemini to invent a gift package from
-- plain text with no connection to anything actually sellable in
-- products_box. The curation "title/description/price" were fiction — there
-- was no way to fulfil the order from real inventory, and no reliable link
-- between a gift_packages row and a products_box row.
--
-- src/services/ai.ts now grounds curation in real products_box rows (see
-- AIService.curateGiftsFromCatalog) and returns the matched product's id.
-- This column persists that link so a gift_packages row can be resolved back
-- to its real product (price, images, stock, provider) at read time.

ALTER TABLE public.gift_packages
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products_box(id);

CREATE INDEX IF NOT EXISTS idx_gift_packages_product_id ON public.gift_packages(product_id);

COMMENT ON COLUMN public.gift_packages.product_id IS
  'Real products_box row this curated package resolves to, when the AI curation engine matched one from the live catalog. Nullable: older rows and pure-experience packages (no matching physical product) leave this null.';
