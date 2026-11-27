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
    E'Радваме се, че сте тук! Вашият безплатен план започва с бонус:\n\n'
    || E'• 5 безплатни операции през първите 30 дни от регистрацията\n'
    || E'• След това 2 операции месечно\n'
    || E'• 1 операция = сваляне на договор/шаблон или анализ на качен документ\n'
    || E'• 1 преглед на качен договор с risk score\n'
    || E'• 1 преглед на двуезичен договор (BG колоната)\n\n'
    || E'Когато имате нужда от повече: Професионалист — 50 операции месечно, Предприемач — 100 операции месечно, пълен достъп до AI Асистента, двуезичните договори, комплектите и е-Подпис, без воден знак.\n\n'
    || E'Успех! 🚀',
    '/catalog'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.id AND n.kind = 'welcome'
  );

  RETURN NEW;
END;
$function$;