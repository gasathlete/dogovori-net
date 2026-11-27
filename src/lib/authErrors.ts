// Превод на най-честите Supabase Auth грешки на български.
// Подава се `error.message` от supabase-js.
export function translateAuthError(message: string | undefined | null): string {
  if (!message) return "Възникна неочаквана грешка. Опитайте отново.";
  const m = message.toLowerCase();

  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "Грешен email или парола.";
  if (m.includes("email not confirmed"))
    return "Email адресът не е потвърден. Проверете пощата си.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Вече има профил с този email. Влезте или използвайте „Забравена парола“.";
  if (m.includes("password should be at least"))
    return "Паролата трябва да е поне 8 символа.";
  if (m.includes("password is known to be weak") || m.includes("pwned") || m.includes("compromised"))
    return "Тази парола е компрометирана и се среща в публични течове. Изберете по-силна парола.";
  if (m.includes("rate limit") || m.includes("too many requests") || m.includes("over_email_send_rate_limit"))
    return "Твърде много опити. Опитайте отново след малко.";
  if (m.includes("invalid email") || m.includes("unable to validate email"))
    return "Невалиден email адрес.";
  if (m.includes("user not found"))
    return "Няма профил с този email.";
  if (m.includes("new password should be different"))
    return "Новата парола трябва да е различна от старата.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "Регистрацията е временно изключена.";
  if (m.includes("captcha"))
    return "Неуспешна капча. Опитайте отново.";
  if (m.includes("network") || m.includes("fetch"))
    return "Няма връзка със сървъра. Проверете интернет връзката си.";

  // Fallback — върни оригинала, но подсилен:
  return message;
}
