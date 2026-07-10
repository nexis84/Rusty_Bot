-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)

-- 1. Create the skins table
CREATE TABLE IF NOT EXISTS skins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id BIGINT NOT NULL,
  character_name TEXT NOT NULL,
  ship_name TEXT NOT NULL,
  skin_name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT NOT NULL,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_skins_character_id ON skins(character_id);
CREATE INDEX IF NOT EXISTS idx_skins_created_at ON skins(created_at DESC);

-- Allow public read access to skins
CREATE POLICY "Skins are publicly viewable"
  ON skins FOR SELECT
  USING (true);

-- Allow authenticated inserts (we handle auth via EVE SSO, so use service_role key)
CREATE POLICY "Anyone can insert skins"
  ON skins FOR INSERT
  WITH CHECK (true);

-- Allow owners to update/delete
CREATE POLICY "Owners can update their skins"
  ON skins FOR UPDATE
  USING (character_id = (current_setting('request.jwt.claims', true)::json->>'character_id')::bigint);

CREATE POLICY "Owners can delete their skins"
  ON skins FOR DELETE
  USING (character_id = (current_setting('request.jwt.claims', true)::json->>'character_id')::bigint);

-- 2. Create storage bucket for skin images
INSERT INTO storage.buckets (id, name, public)
VALUES ('skins', 'skins', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads on the skins bucket
CREATE POLICY "Public can view skin images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'skins');

-- Allow anyone to upload to skins bucket (we handle auth server-side)
CREATE POLICY "Anyone can upload skin images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'skins');
