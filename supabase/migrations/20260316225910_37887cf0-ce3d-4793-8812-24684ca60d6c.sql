
-- Create funnels table
CREATE TABLE public.funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  flow JSONB NOT NULL,
  bot_name TEXT DEFAULT '',
  bot_avatar TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

-- Enable RLS
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

-- RLS policies: each user can only access their own funnels
CREATE POLICY "Users can view their own funnels"
  ON public.funnels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own funnels"
  ON public.funnels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own funnels"
  ON public.funnels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own funnels"
  ON public.funnels FOR DELETE
  USING (auth.uid() = user_id);

-- Allow public read of funnels by slug (for /f/:slug route, no auth needed)
CREATE POLICY "Anyone can view funnels by slug"
  ON public.funnels FOR SELECT
  USING (true);

-- Create avatar_gallery table
CREATE TABLE public.avatar_gallery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.avatar_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own avatars"
  ON public.avatar_gallery FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own avatars"
  ON public.avatar_gallery FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own avatars"
  ON public.avatar_gallery FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_funnels_updated_at
  BEFORE UPDATE ON public.funnels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
