-- Migration 003: Add `providers` (gift providers / sellers)
-- ---------------------------------------------------------------------------
-- Run this against an existing database that was created before the
-- `providers` table existed in supabase_schema.sql. It is safe to re-run.
--
-- Context: the public /profiles page used to list *customer* profiles
-- (people who signed in). It has been repurposed to list the providers /
-- sellers who actually supply the gifts customers order, each with an
-- "Follow on Instagram" link. See src/app/profiles/page.tsx and
-- src/app/api/providers/route.ts.

CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80',
    specialty TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    instagram_handle TEXT,
    rating NUMERIC CHECK (rating >= 1 AND rating <= 5) DEFAULT 5.0,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE products_box ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_products_box_provider_id ON products_box(provider_id);

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "providers_public_read" ON providers
        FOR SELECT USING (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "providers_service_role_write" ON providers
        FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Optional: a few sample providers so the /profiles page isn't empty right
-- after migrating. Safe to delete/edit afterwards — remove this block if
-- you'd rather add real providers yourself via Supabase.
-- Demo seed data intentionally omitted from production migrations.
