

## Update `install.sh` to Fix Permissions Automatically

### Problem
The current `install.sh` does not grant sufficient permissions to the `authenticated` PostgreSQL role. This causes `permission denied` errors when the frontend tries to write data via PostgREST.

### Changes

**File: `self-host/install.sh`**

Update the GRANT section after migrations (around the existing `GRANT ALL ON ALL TABLES` block) to explicitly grant per-table permissions to the `authenticated` role, matching what RLS policies expect:

```sql
-- Authenticated users (via PostgREST JWT)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.avatar_gallery TO authenticated;
GRANT ALL ON public.funnels TO authenticated;
GRANT ALL ON public.funnel_preview_images TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.funnel_sessions TO authenticated;
GRANT SELECT, INSERT ON public.funnel_session_events TO authenticated;

-- Anonymous visitors (public funnel access)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.funnels TO anon;
GRANT SELECT ON public.funnel_preview_images TO anon;
GRANT SELECT, INSERT, UPDATE ON public.funnel_sessions TO anon;
GRANT SELECT, INSERT ON public.funnel_session_events TO anon;

-- Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
```

This replaces the current generic `GRANT ALL ON ALL TABLES` block which grants to `funnel_user` but not to the `authenticated` role that PostgREST actually switches to.

### Next Step
After saving settings in the dashboard, test "Listar Typebots" to confirm the full integration works end-to-end.

