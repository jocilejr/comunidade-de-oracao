ALTER TABLE public.funnels ADD COLUMN IF NOT EXISTS meta_pixel_id text DEFAULT NULL;
ALTER TABLE public.funnels ADD COLUMN IF NOT EXISTS meta_capi_token text DEFAULT NULL;