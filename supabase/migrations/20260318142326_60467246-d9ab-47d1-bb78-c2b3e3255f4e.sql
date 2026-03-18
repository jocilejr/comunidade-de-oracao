
-- Create funnel_preview_images table
CREATE TABLE public.funnel_preview_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  data_url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funnel_preview_images ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY "Users can view their own preview images"
  ON public.funnel_preview_images FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preview images"
  ON public.funnel_preview_images FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own preview images"
  ON public.funnel_preview_images FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preview images"
  ON public.funnel_preview_images FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Public read for edge function rotation
CREATE POLICY "Service can read all preview images"
  ON public.funnel_preview_images FOR SELECT
  TO anon
  USING (true);

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
