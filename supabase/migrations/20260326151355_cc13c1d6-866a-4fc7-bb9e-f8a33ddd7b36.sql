
CREATE TABLE public.user_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pixel_id text NOT NULL,
  capi_token text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pixels ENABLE ROW LEVEL SECURITY;

-- Owner can see their own pixels
CREATE POLICY "Users can view their own pixels"
ON public.user_pixels FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Owner can insert their own pixels
CREATE POLICY "Users can insert their own pixels"
ON public.user_pixels FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Owner can delete their own pixels
CREATE POLICY "Users can delete their own pixels"
ON public.user_pixels FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Owner can update their own pixels
CREATE POLICY "Users can update their own pixels"
ON public.user_pixels FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Public can read pixels by user_id (needed for public funnel pages to load owner's pixels)
CREATE POLICY "Anyone can read pixels by user_id"
ON public.user_pixels FOR SELECT
TO anon
USING (true);
