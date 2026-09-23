/**
 * Серверна страна на преградата за ограничени идентификатори.
 *
 * Изображения на страници не могат да бъдат проверени преди изпращане към
 * модела, затова приемането им е спряно и на сървъра — за да не може директно
 * извикване да заобиколи браузърната преграда.
 */
export const RAW_IMAGE_INGRESS_ALLOWED = false;

export const RAW_IMAGE_INGRESS_BLOCKED_CODE = "raw_image_ingress_blocked";

export const RAW_IMAGE_INGRESS_BLOCKED_MESSAGE =
  "Разпознаването на сканирани документи е временно спряно. Изображението на страницата може да съдържа ЕГН или банкова сметка, а това не може да се провери преди изпращане. Поставете текста ръчно и заменете личните данни с [ЕГН], [IBAN] и подобни.";

export function rawImageIngressBlockedResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: RAW_IMAGE_INGRESS_BLOCKED_MESSAGE,
      code: RAW_IMAGE_INGRESS_BLOCKED_CODE,
    }),
    { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
