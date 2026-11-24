CREATE POLICY "Block client inserts on notification_log"
ON public.notification_log AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Block client updates on notification_log"
ON public.notification_log AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block client deletes on notification_log"
ON public.notification_log AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);