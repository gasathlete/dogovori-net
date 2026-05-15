-- Assistant chat tables for PRO/Team AI support
CREATE TABLE public.assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Нов разговор',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_threads_user_idx ON public.assistant_threads(user_id, updated_at DESC);

ALTER TABLE public.assistant_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_threads_select_own" ON public.assistant_threads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "assistant_threads_insert_own" ON public.assistant_threads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "assistant_threads_update_own" ON public.assistant_threads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "assistant_threads_delete_own" ON public.assistant_threads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "assistant_threads_service_role" ON public.assistant_threads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX assistant_messages_thread_idx ON public.assistant_messages(thread_id, created_at);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assistant_messages_select_own" ON public.assistant_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY "assistant_messages_insert_own" ON public.assistant_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY "assistant_messages_delete_own" ON public.assistant_messages
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.assistant_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY "assistant_messages_service_role" ON public.assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER assistant_threads_set_updated_at
  BEFORE UPDATE ON public.assistant_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();