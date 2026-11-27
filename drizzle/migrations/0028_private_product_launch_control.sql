CREATE TABLE public.product_launch_control (
  id text PRIMARY KEY CHECK (id = 'public_products'),
  live_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.product_launch_control TO service_role;
REVOKE ALL ON TABLE public.product_launch_control FROM anon, authenticated;
ALTER TABLE public.product_launch_control ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.product_launch_control IS 'Service-controlled new LIVE product checkout gate; missing row or read failure is closed. Does not affect existing fulfillment.';