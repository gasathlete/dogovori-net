
CREATE TABLE public.pentest_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year INTEGER NOT NULL,
  scope TEXT NOT NULL,
  vendor TEXT,
  planned_date DATE,
  executed_date DATE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings_high INTEGER NOT NULL DEFAULT 0,
  findings_medium INTEGER NOT NULL DEFAULT 0,
  findings_low INTEGER NOT NULL DEFAULT 0,
  remediated BOOLEAN NOT NULL DEFAULT false,
  evidence_url TEXT,
  notes TEXT,
  reminder_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pentest_plans TO authenticated;
GRANT ALL ON public.pentest_plans TO service_role;
ALTER TABLE public.pentest_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read pentest" ON public.pentest_plans FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write pentest" ON public.pentest_plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_pentest_touch BEFORE UPDATE ON public.pentest_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.restore_drills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  executor UUID REFERENCES auth.users(id),
  outcome TEXT CHECK (outcome IN ('success','partial','failure','skipped')),
  rto_measured_minutes INTEGER,
  rpo_measured_minutes INTEGER,
  rto_target_minutes INTEGER NOT NULL DEFAULT 240,
  rpo_target_minutes INTEGER NOT NULL DEFAULT 5,
  source_backup TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  issues TEXT,
  remediation TEXT,
  evidence_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restore_drills TO authenticated;
GRANT ALL ON public.restore_drills TO service_role;
ALTER TABLE public.restore_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read drills" ON public.restore_drills FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write drills" ON public.restore_drills FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_drills_touch BEFORE UPDATE ON public.restore_drills FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.compliance_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  framework TEXT NOT NULL CHECK (framework IN ('GDPR','AI_ACT','SOC2','ISO27001')),
  control_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('done','in_progress','todo','not_applicable')),
  owner_role TEXT,
  owner_user UUID REFERENCES auth.users(id),
  evidence_url TEXT,
  evidence_notes TEXT,
  due_date DATE,
  last_reviewed_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (framework, control_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_items TO authenticated;
GRANT ALL ON public.compliance_items TO service_role;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read compliance" ON public.compliance_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin write compliance" ON public.compliance_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_compliance_touch BEFORE UPDATE ON public.compliance_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the compliance matrix with the items from the existing roadmap
INSERT INTO public.compliance_items (framework, control_ref, title, status, owner_role, priority, evidence_notes) VALUES
('GDPR','Art.15','Право на достъп — JSON export','done','DPO','high','export-my-data edge function + Account UI'),
('GDPR','Art.17','Право на изтриване — cascade delete','done','DPO','high','delete-account edge function'),
('GDPR','Art.20','Преносимост — машинно четим формат','done','DPO','medium','JSON export'),
('GDPR','Art.30','ROPA — Регистър на дейностите','done','DPO','high','/legal/ropa'),
('GDPR','Art.32','TOM — TLS, RLS, encryption at rest','done','CTO','critical','Lovable Cloud / Supabase'),
('GDPR','Art.33','Уведомяване за нарушения 72ч','done','DPO','high','/legal/incident-response'),
('GDPR','Art.35','DPIA','done','DPO','high','/dpia-dogovori-net.docx'),
('AI_ACT','Art.5','Забранени практики','done','CTO','critical','classify.ts блокира при риск'),
('AI_ACT','Art.50','Transparency — AI labelling','done','Product','high','AIProcessingPolicy'),
('AI_ACT','Annex_III','High-risk classification','done','DPO','high','Класифицирано като limited risk'),
('SOC2','CC6.1','Access controls','done','CTO','critical','RLS + has_role + MFA enforcement'),
('SOC2','CC6.6','MFA за privileged users','in_progress','CTO','critical','AdminMFAGuard component'),
('SOC2','CC7.2','Logging & monitoring','done','CTO','high','ai_audit_log, audit_log, edge logs'),
('SOC2','CC7.3','Incident response','done','CTO','high','/legal/incident-response с RTO/RPO'),
('SOC2','CC8.1','Change management','in_progress','CTO','medium','Git history + migration approval'),
('SOC2','CC9.1','Risk assessment — annual','todo','DPO','high','Годишен преглед'),
('SOC2','A1.2','BCP — Restore drill 6мес','in_progress','CTO','high','restore_drills таблица'),
('ISO27001','A.5.1','Information Security Policy','todo','CTO','high','Документ за политика'),
('ISO27001','A.6.3','Awareness training','todo','HR','medium','Годишен training за служители'),
('ISO27001','A.8.16','Monitoring activities','done','CTO','high','Logs + alerts'),
('ISO27001','A.12.6','Vulnerability mgmt — pentest','todo','CTO','high','Годишен пен-тест'),
('ISO27001','A.5.30','ICT readiness — BCP','in_progress','CTO','high','RTO 4ч / RPO 5мин'),
('ISO27001','A.5.34','Privacy & PII protection','done','DPO','high','PII redact + псевдонимизация');

-- Seed first pen-test plan and first restore drill
INSERT INTO public.pentest_plans (year, scope, planned_date, status, checklist) VALUES
(EXTRACT(YEAR FROM CURRENT_DATE)::int, 'Web app + edge functions + Supabase RLS', (CURRENT_DATE + interval '3 months')::date, 'planned',
 '[
   {"id":"scope","label":"Дефинира scope (URL, endpoints, IPs)","done":false},
   {"id":"nda","label":"Подписан NDA с вендора","done":false},
   {"id":"safe_harbor","label":"Safe harbor letter","done":false},
   {"id":"baseline","label":"Baseline снимка преди теста","done":false},
   {"id":"owasp","label":"OWASP Top 10 покритие","done":false},
   {"id":"api_fuzzing","label":"API fuzzing","done":false},
   {"id":"auth_bypass","label":"Auth/RLS bypass тестове","done":false},
   {"id":"report","label":"Финален доклад с severity","done":false},
   {"id":"remediation","label":"Remediation план","done":false},
   {"id":"retest","label":"Re-test след fix","done":false}
 ]'::jsonb);

INSERT INTO public.restore_drills (scheduled_at, steps) VALUES
(now() + interval '1 month',
 '[
   {"id":"snapshot","label":"Идентифицирай target snapshot/PITR point","done":false},
   {"id":"isolated","label":"Restore в изолирана среда","done":false},
   {"id":"verify_schema","label":"Verify schema integrity","done":false},
   {"id":"verify_rows","label":"Verify row counts срещу production","done":false},
   {"id":"verify_app","label":"Smoke test критични flows","done":false},
   {"id":"measure_rto","label":"Запиши RTO (минути)","done":false},
   {"id":"measure_rpo","label":"Запиши RPO (минути)","done":false},
   {"id":"cleanup","label":"Изтрий тестовата среда","done":false},
   {"id":"document","label":"Попълни форма с резултати","done":false}
 ]'::jsonb);

-- Schedule reminder cron for pentest/drill due in <30 days
CREATE OR REPLACE FUNCTION public.check_compliance_reminders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pt RECORD; _rd RECORD; _admin_id uuid; _created int := 0;
BEGIN
  FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role IN ('admin','moderator') LOOP
    FOR _pt IN SELECT * FROM public.pentest_plans
      WHERE status = 'planned'
        AND planned_date IS NOT NULL
        AND planned_date <= CURRENT_DATE + interval '30 days'
        AND (reminder_at IS NULL OR reminder_at < now() - interval '7 days')
    LOOP
      INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (_admin_id, 'compliance_reminder',
              'Пен-тест предстои: ' || _pt.scope,
              'Планираната дата (' || _pt.planned_date || ') е след по-малко от 30 дни. Подгответе evidence пакета.',
              '/admin/pentest');
      _created := _created + 1;
    END LOOP;
    UPDATE public.pentest_plans SET reminder_at = now()
     WHERE status = 'planned' AND planned_date <= CURRENT_DATE + interval '30 days';

    FOR _rd IN SELECT * FROM public.restore_drills
      WHERE executed_at IS NULL AND scheduled_at <= now() + interval '14 days'
    LOOP
      INSERT INTO public.notifications(user_id, kind, title, body, link)
      VALUES (_admin_id, 'compliance_reminder',
              'Restore drill предстои',
              'Планиран за ' || _rd.scheduled_at::date || '. Подгответе изолираната среда.',
              '/admin/restore-drills');
      _created := _created + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('reminders_created', _created);
END $$;
