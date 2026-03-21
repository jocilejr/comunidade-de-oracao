
-- Create funnel_sessions table
CREATE TABLE public.funnel_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid REFERENCES public.funnels(id) ON DELETE CASCADE NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  last_block_id text,
  last_group_title text,
  variables jsonb DEFAULT '{}'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for funnel_sessions
CREATE TRIGGER on_funnel_sessions_updated
  BEFORE UPDATE ON public.funnel_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create funnel_session_events table
CREATE TABLE public.funnel_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.funnel_sessions(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  block_id text,
  group_title text,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.funnel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_session_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert sessions (anonymous visitors)
CREATE POLICY "Anyone can insert sessions"
  ON public.funnel_sessions FOR INSERT
  TO public
  WITH CHECK (true);

-- Anyone can update sessions (to mark completion)
CREATE POLICY "Anyone can update sessions"
  ON public.funnel_sessions FOR UPDATE
  TO public
  USING (true);

-- Funnel owners can view sessions
CREATE POLICY "Funnel owners can view sessions"
  ON public.funnel_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.funnels
      WHERE funnels.id = funnel_sessions.funnel_id
        AND funnels.user_id = auth.uid()
    )
  );

-- Anyone can insert events (anonymous visitors)
CREATE POLICY "Anyone can insert events"
  ON public.funnel_session_events FOR INSERT
  TO public
  WITH CHECK (true);

-- Funnel owners can view events
CREATE POLICY "Funnel owners can view events"
  ON public.funnel_session_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.funnel_sessions
      JOIN public.funnels ON funnels.id = funnel_sessions.funnel_id
      WHERE funnel_sessions.id = funnel_session_events.session_id
        AND funnels.user_id = auth.uid()
    )
  );

-- Index for performance
CREATE INDEX idx_funnel_sessions_funnel_id ON public.funnel_sessions(funnel_id);
CREATE INDEX idx_funnel_session_events_session_id ON public.funnel_session_events(session_id);
CREATE INDEX idx_funnel_session_events_created_at ON public.funnel_session_events(created_at);
