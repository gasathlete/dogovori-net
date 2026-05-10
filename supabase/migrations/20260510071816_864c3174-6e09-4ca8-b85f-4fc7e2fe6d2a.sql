CREATE TABLE public.template_cache (
  hash text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.template_cache ENABLE ROW LEVEL SECURITY;

-- No public policies: only service_role (edge functions) reads/writes.
CREATE INDEX idx_template_cache_created_at ON public.template_cache (created_at);