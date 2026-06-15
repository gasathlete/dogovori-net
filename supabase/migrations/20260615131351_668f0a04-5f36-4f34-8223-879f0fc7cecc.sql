
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  tagline text,
  monthly_price numeric(10,2),
  yearly_price numeric(10,2),
  monthly_suffix text DEFAULT '€/мес',
  yearly_suffix text DEFAULT '€/год',
  yearly_note text,
  ops_cap_monthly integer,
  seat_min integer,
  highlight boolean NOT NULL DEFAULT false,
  badge text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON public.plans FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_features_plan_id_idx ON public.plan_features(plan_id);
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active features" ON public.plan_features FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage features" ON public.plan_features FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.plan_comparison_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  free_value text NOT NULL DEFAULT '—',
  professional_value text NOT NULL DEFAULT '—',
  entrepreneur_value text NOT NULL DEFAULT '—',
  team_value text NOT NULL DEFAULT '—',
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_comparison_rows TO anon, authenticated;
GRANT ALL ON public.plan_comparison_rows TO service_role;
ALTER TABLE public.plan_comparison_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comparison rows" ON public.plan_comparison_rows FOR SELECT
  USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage comparison rows" ON public.plan_comparison_rows FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER plan_features_updated_at BEFORE UPDATE ON public.plan_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER plan_comparison_rows_updated_at BEFORE UPDATE ON public.plan_comparison_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.render_plans_section_content()
RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  out text := '';
  p record;
  feat_lines text;
  cmp record;
BEGIN
  out := out || E'Това е АВТОМАТИЧНО генериран блок от таблицата public.plans. Винаги използвай ТЕЗИ актуални цени и лимити. Не ползвай стари наименувания (Pro/Team като самостоятелни) или валути (лв/BGN).\n\n## Активни планове\n';
  FOR p IN SELECT * FROM public.plans WHERE active = true ORDER BY sort_order, name LOOP
    out := out || E'\n### ' || p.name || ' (`' || p.id || '`)\n';
    IF p.tagline IS NOT NULL THEN out := out || E'_' || p.tagline || E'_\n'; END IF;
    IF p.monthly_price IS NOT NULL THEN
      out := out || E'- Месечно: ' || to_char(p.monthly_price, 'FM999990.00') || ' ' || COALESCE(p.monthly_suffix, '€/мес') || E'\n';
    END IF;
    IF p.yearly_price IS NOT NULL THEN
      out := out || E'- Годишно: ' || to_char(p.yearly_price, 'FM999990.00') || ' ' || COALESCE(p.yearly_suffix, '€/год');
      IF p.yearly_note IS NOT NULL THEN out := out || ' (' || p.yearly_note || ')'; END IF;
      out := out || E'\n';
    END IF;
    IF p.ops_cap_monthly IS NOT NULL THEN out := out || E'- Операции / месец: ' || p.ops_cap_monthly || E'\n'; END IF;
    IF p.seat_min IS NOT NULL THEN out := out || E'- Минимум места: ' || p.seat_min || E'\n'; END IF;
    SELECT string_agg('  • ' || feature, E'\n' ORDER BY sort_order) INTO feat_lines
      FROM public.plan_features WHERE plan_id = p.id AND active = true;
    IF feat_lines IS NOT NULL THEN out := out || E'- Включва:\n' || feat_lines || E'\n'; END IF;
  END LOOP;

  out := out || E'\n## Сравнителна таблица\n';
  FOR cmp IN SELECT * FROM public.plan_comparison_rows WHERE active = true ORDER BY sort_order, label LOOP
    out := out || '- **' || cmp.label || '** — Безплатен: ' || cmp.free_value
      || ' · Професионалист: ' || cmp.professional_value
      || ' · Предприемач: ' || cmp.entrepreneur_value
      || ' · Екип: ' || cmp.team_value || E'\n';
  END LOOP;

  out := out || E'\n## ДДС и допълнителни пакети\n- Всички цени са с ДДС 20% включен.\n- Допълнителен пакет от 5 операции = 2.90 € (one-off, без подновяване).\n';
  RETURN out;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_plans_into_prompts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  block_key text := 'plans_auto';
  block_title text := 'АКТУАЛНИ ПЛАНОВЕ И ЦЕНИ (auto)';
  pricing_content text;
  pr record;
  max_order int;
BEGIN
  pricing_content := public.render_plans_section_content();
  FOR pr IN SELECT id FROM public.ai_prompts WHERE is_active = true LOOP
    IF EXISTS (SELECT 1 FROM public.ai_prompt_sections WHERE prompt_id = pr.id AND section_key = block_key) THEN
      UPDATE public.ai_prompt_sections
        SET content = pricing_content, title = block_title, enabled = true, updated_at = now()
        WHERE prompt_id = pr.id AND section_key = block_key;
    ELSE
      SELECT COALESCE(MAX(order_idx), 0) + 1 INTO max_order
        FROM public.ai_prompt_sections WHERE prompt_id = pr.id;
      INSERT INTO public.ai_prompt_sections (prompt_id, section_key, title, content, order_idx, enabled)
      VALUES (pr.id, block_key, block_title, pricing_content, max_order, true);
    END IF;
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_sync_plans_into_prompts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.sync_plans_into_prompts(); RETURN NULL; END; $$;

CREATE TRIGGER plans_sync_prompts AFTER INSERT OR UPDATE OR DELETE ON public.plans
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_sync_plans_into_prompts();
CREATE TRIGGER plan_features_sync_prompts AFTER INSERT OR UPDATE OR DELETE ON public.plan_features
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_sync_plans_into_prompts();
CREATE TRIGGER plan_comparison_rows_sync_prompts AFTER INSERT OR UPDATE OR DELETE ON public.plan_comparison_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.tg_sync_plans_into_prompts();

INSERT INTO public.plans (id, name, tagline, monthly_price, yearly_price, monthly_suffix, yearly_suffix, yearly_note, ops_cap_monthly, seat_min, highlight, badge, sort_order, active) VALUES
  ('free', 'Безплатен', 'За първи стъпки и единични документи', 0, 0, '€', '€', NULL, 2, NULL, false, NULL, 0, true),
  ('professional', 'Професионалист', 'За самонаети и фрийлансъри', 12.90, 129.00, '€/мес', '€/год', '≈ 10.75 €/мес', 50, NULL, false, NULL, 1, true),
  ('entrepreneur', 'Предприемач', 'Най-премиум планът — за активни предприемачи', 19.90, 199.00, '€/мес', '€/год', '≈ 16.60 €/мес', 120, NULL, true, 'Най-премиум', 2, true),
  ('team', 'Екип', 'За фирми с няколко юриста или мениджъри', NULL, 109.00, NULL, '€/seat/год', 'мин. 3 = 327 €/год', 100, 3, false, NULL, 3, true);

INSERT INTO public.plan_features (plan_id, feature, sort_order) VALUES
  ('free', '5 операции при регистрация + 2 / месец', 0),
  ('free', 'AI Асистент — 5 съобщения / месец', 1),
  ('free', '1 активен комплект документи', 2),
  ('free', 'Достъп до пълния каталог шаблони', 3),
  ('free', 'Воден знак на PDF', 4),
  ('professional', '50 операции / месец', 0),
  ('professional', 'Неограничен AI Асистент', 1),
  ('professional', 'Пълни двуезични договори (EN/DE/FR)', 2),
  ('professional', 'Неограничени комплекти документи и автоматични корекции', 3),
  ('professional', 'Без воден знак', 4),
  ('professional', 'Loyalty: 5–15% доживотна отстъпка', 5),
  ('professional', 'Стандартна поддръжка', 6),
  ('entrepreneur', '120 операции / месец', 0),
  ('entrepreneur', 'Всичко от Професионалист', 1),
  ('entrepreneur', 'Приоритетна AI обработка + GPT-5 модел', 2),
  ('entrepreneur', 'Премиум поддръжка 24/7', 3),
  ('entrepreneur', 'Персонален onboarding', 4),
  ('entrepreneur', 'Ранен достъп до нови функции', 5),
  ('team', 'Само годишен абонамент', 0),
  ('team', '100 операции / място / месец', 1),
  ('team', 'Споделени документи и шаблони', 2),
  ('team', 'Audit log на всички действия', 3),
  ('team', 'Екипно фактуриране', 4),
  ('team', 'Централизирано управление на достъп', 5),
  ('team', 'Всичко от Професионалист', 6);

INSERT INTO public.plan_comparison_rows (label, free_value, professional_value, entrepreneur_value, team_value, sort_order) VALUES
  ('Операции / месец', '5 + 2/мес', '50', '120', '100 / място', 0),
  ('AI Асистент', '5 съобщ./мес', 'Неограничен', 'Неограничен + приоритет', 'Неограничен', 1),
  ('AI модел', 'Стандартен', 'Стандартен', 'GPT-5', 'Стандартен', 2),
  ('Двуезични договори', 'Само BG', 'Пълни EN/DE/FR', 'Пълни EN/DE/FR', 'Пълни EN/DE/FR', 3),
  ('Комплекти документи', '1', 'Неограничени', 'Неограничени', 'Неограничени', 4),
  ('Воден знак', 'Да', 'Не', 'Не', 'Не', 5),
  ('Loyalty отстъпка', '—', '5–15%', '5–15%', '5–15%', 6),
  ('Персонален onboarding', '—', '—', 'Да', 'Да', 7),
  ('Audit log', '—', '—', '—', 'Да', 8),
  ('Споделени документи', '—', '—', '—', 'Да', 9),
  ('Поддръжка', 'Стандартна', 'Стандартна', 'Premium 24/7', 'Приоритетна', 10);

SELECT public.sync_plans_into_prompts();
