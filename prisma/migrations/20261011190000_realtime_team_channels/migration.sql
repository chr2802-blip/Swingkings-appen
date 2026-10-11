-- Who may listen on a team's Realtime channel: see src/lib/realtime.ts.
--
-- A phone joins the private channel `team:<teamId>` with a token this app signs, whose
-- `teams` claim lists every team its owner is on. This policy lets it read a topic only
-- when the topic names one of those teams. There is no INSERT policy: phones never
-- broadcast, only the server does, with the secret key.
--
-- Only Supabase has a `realtime` schema; everywhere else this does nothing.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL OR to_regprocedure('realtime.topic()') IS NULL THEN
    RAISE NOTICE 'No Supabase Realtime in this database; skipping the team channel policy.';
    RETURN;
  END IF;

  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "swingkings members hear their teams" ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY "swingkings members hear their teams" ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.messages.extension = 'broadcast'
        AND (SELECT realtime.topic()) LIKE 'team:%'
        AND substr((SELECT realtime.topic()), 6) IN (
          SELECT jsonb_array_elements_text(
            coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'teams', '[]'::jsonb)
          )
        )
      )
    $policy$;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Could not create the Realtime team channel policy (%); the chat will poll instead.', SQLERRM;
  END;
END
$$;
