-- Migration 026: Example products for the new categories
-- ---------------------------------------------------------------------------
-- Safe to re-run (guarded by product_name so it won't duplicate rows on a
-- second run). One example row per new category added in migration 025,
-- each with a real, working image_url so you can confirm images render
-- correctly on /tailoring before uploading your own product photos.
--
-- The image URLs below are placeholder stock photos (picsum.photos) —
-- swap them for your own product images (Supabase Storage URL, or any
-- public https image URL) whenever you're ready. Nothing else needs to
-- change; the page reads image_url directly.
INSERT INTO customization_products
  (product_name, image_url, category, price_in_rupees, slots, product_description, emoji, gradient, display_order)
SELECT * FROM (VALUES
    ('Belgian Chocolate Box',      'https://picsum.photos/seed/hamper-chocolates/600/600', 'Chocolates', 599,  1, 'Assorted Belgian chocolates, 16 pieces in a gift box.',        '🍫', 'from-[#4e2a1e] to-[#7a4a2f]', 1),
    ('Minimalist Wrist Watch',     'https://picsum.photos/seed/hamper-watch/600/600',       'Watch',      2499, 2, 'A slim analog watch with a leather strap — boxed, needs extra room.', '⌚', 'from-[#37474f] to-[#263238]', 1),
    ('Sterling Silver Chain',      'https://picsum.photos/seed/hamper-chain/600/600',       'Chain',      1799, 1, 'A delicate sterling silver chain, comes in a velvet pouch.',   '📿', 'from-[#b0bec5] to-[#78909c]', 1),
    ('Rose Gold Photo Frame',      'https://picsum.photos/seed/hamper-frames/600/600',      'Frames',     699,  1, 'A rose-gold finished frame, fits a 4×6 print.',                '🖼️', 'from-[#e8b4b8] to-[#c98a8f]', 1),
    ('Luxury Perfume Spray',       'https://picsum.photos/seed/hamper-spray/600/600',       'Spray',      899,  1, 'A travel-size fragrance spray, floral-woody notes.',           '🌸', 'from-[#f3e5f5] to-[#ce93d8]', 1),
    ('Roasted Mixed Nuts Jar',     'https://picsum.photos/seed/hamper-nuts/600/600',        'Nuts',       349,  1, 'A jar of roasted almonds, cashews and pistachios, 200g.',      '🥜', 'from-[#d7ccc8] to-[#a1887f]', 1),
    ('Boutique Wrapped Gift Set',  'https://picsum.photos/seed/hamper-boutique/600/600',    'Boutique',   1299, 2, 'A pre-wrapped boutique gift set — ribboned box, needs 2 slots.', '🎀', 'from-[#f8bbd0] to-[#f48fb1]', 1)
) AS seed(product_name, image_url, category, price_in_rupees, slots, product_description, emoji, gradient, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM customization_products cp WHERE cp.product_name = seed.product_name
);
