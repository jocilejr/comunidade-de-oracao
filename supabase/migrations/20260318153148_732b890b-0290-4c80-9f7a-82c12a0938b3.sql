ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS typebot_api_token text DEFAULT NULL;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS typebot_workspace_id text DEFAULT NULL;