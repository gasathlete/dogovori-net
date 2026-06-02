-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  kind text NOT NULL DEFAULT 'broadcast',
  title text NOT NULL,
  body text,
  link text,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_broadcast_created ON public.notifications (created_at DESC) WHERE user_id IS NULL;
CREATE INDEX idx_notifications_kind ON public.notifications (kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_visible ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR public.is_staff(auth.uid()));

CREATE POLICY notifications_insert_staff ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY notifications_delete_staff ON public.notifications
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY notifications_update_staff ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY notifications_service_role ON public.notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Notification reads
CREATE TABLE public.notification_reads (
  user_id uuid NOT NULL,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX idx_notification_reads_user ON public.notification_reads (user_id);

GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_reads_select_own ON public.notification_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notification_reads_insert_own ON public.notification_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY notification_reads_delete_own ON public.notification_reads
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notification_reads_service_role ON public.notification_reads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Unread count
CREATE OR REPLACE FUNCTION public.unread_notifications_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.notifications n
  WHERE (n.user_id = auth.uid() OR n.user_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_reads r
      WHERE r.notification_id = n.id AND r.user_id = auth.uid()
    );
$$;

-- Mark a single notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.notification_reads (user_id, notification_id)
    VALUES (auth.uid(), _id)
    ON CONFLICT DO NOTHING;
END;
$$;

-- Mark all visible notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  WITH ins AS (
    INSERT INTO public.notification_reads (user_id, notification_id)
    SELECT auth.uid(), n.id
      FROM public.notifications n
     WHERE (n.user_id = auth.uid() OR n.user_id IS NULL)
       AND NOT EXISTS (
         SELECT 1 FROM public.notification_reads r
         WHERE r.notification_id = n.id AND r.user_id = auth.uid()
       )
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO _count FROM ins;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unread_notifications_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;