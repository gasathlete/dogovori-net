WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, kind
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.notifications
  WHERE kind = 'welcome'
    AND user_id IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

UPDATE public.notifications
SET link = '/catalog'
WHERE kind = 'welcome';

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.folders (user_id, name, is_favorites, color)
  VALUES (NEW.id, 'Любими', true, 'gold');

  INSERT INTO public.download_quota (user_id) VALUES (NEW.id);

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT
    NEW.id,
    'welcome',
    'Добре дошли в Dogovori.net 👋',
    E'Радваме се, че сте тук! Ето кратко ръководство какво можете да правите:\n\n'
    || E'• Изготви документ — създайте договор или документ стъпка по стъпка от каталога с готови шаблони.\n'
    || E'• Каталог и Комплекти — разгледайте всички документи или готови пакети по сектори.\n'
    || E'• Качване и анализ — качете свой PDF/DOCX и получете AI анализ с предложения за корекции.\n'
    || E'• Папки и контрагенти — организирайте документите си по папки и страни по договора.\n'
    || E'• Подписани — съхранявайте и проследявайте подписаните екземпляри.\n'
    || E'• Екип — поканете колеги и работете заедно с обща квота.\n'
    || E'• Известия 🔔 — тук ще получавате напомняния за незавършени документи, бонуси и новини от екипа.\n\n'
    || E'Безплатният план включва 6 операции стартово + 2 на месец. За повече вижте раздел „Абонамент".\n\n'
    || E'Успех! 🚀',
    '/catalog'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.id AND n.kind = 'welcome'
  );

  RETURN NEW;
END;
$function$;