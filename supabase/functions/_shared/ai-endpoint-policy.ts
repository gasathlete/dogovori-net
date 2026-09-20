/**
 * РЕГИСТЪР НА AI ВХОДОВЕТЕ.
 *
 * Всяка edge функция, която извиква Lovable AI Gateway (пряко или през
 * общ помощник), или делегира към друга AI функция, ТРЯБВА да бъде описана тук.
 * Статичният тест `ai-endpoint-policy.test.ts` проверява инвентара спрямо
 * реалния код: нов или неклассифициран вход прекъсва CI.
 *
 * Класове:
 * - customer_legal_output — изисква строго заземяване за точно тази заявка;
 * - product_legal_output — работи по съществуващия договор за проверена правна
 *   основа на платените продукти;
 * - nonlegal_extraction — няма правни твърдения (например OCR);
 * - internal_test — никога не е видимо за клиент (симулации, регресии);
 * - internal_pipeline — обработка на официални източници (embeddings), без
 *   клиентски правен изход;
 * - editorial_draft_only — може да създава само чернова без самоодобрение.
 */
export type AiEndpointClass =
  | "customer_legal_output"
  | "product_legal_output"
  | "nonlegal_extraction"
  | "internal_test"
  | "editorial_draft_only"
  // Вътрешен тръбопровод: изчисления върху официални източници (embeddings),
  // без клиентски правен резултат.
  | "internal_pipeline";

export interface AiEndpointPolicy {
  readonly name: string;
  readonly kind: AiEndpointClass;
  /** Изисква retrieveLegalContext + типизиран 503 при липса на съвпадение. */
  readonly requiresStrictLegalGate: boolean;
  /** Кратко основание за класификацията (одитна следа). */
  readonly rationale: string;
}

export const AI_ENDPOINT_POLICIES: readonly AiEndpointPolicy[] = Object.freeze([
  { name: "ingest-legal-source", kind: "internal_pipeline", requiresStrictLegalGate: false, rationale: "Изчислява embeddings за официални правни източници; няма клиентски резултат." },
  { name: "assistant-chat", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Правни отговори към регистриран потребител." },
  { name: "assistant-chat-anon", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Правни отговори към анонимен посетител." },
  { name: "analyze-contract", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Проверка на документ преди подпис." },
  { name: "apply-corrections", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Прилага правни поправки в документ." },
  { name: "build-custom-contract", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Изготвя документ по свободно описание." },
  { name: "correct-uploaded", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Поправя качен от потребителя документ." },
  { name: "generate-contract", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Изготвя документ по интервю." },
  { name: "generate-job", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Делегира към generate-contract и пренася типизираната преграда." },
  { name: "generate-linked-document", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Изготвя свързан документ към основен договор." },
  { name: "refine-contract", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Минимална правна редакция по обратна връзка." },
  { name: "review-document", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Втори проход — правна ревизия на готов документ." },
  { name: "negotiation-strategy", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Преговорна стратегия с правни позиции." },
  { name: "download-blank", kind: "customer_legal_output", requiresStrictLegalGate: true, rationale: "Генерира правна бланка за сваляне." },
  { name: "fulfill-product", kind: "product_legal_output", requiresStrictLegalGate: false, rationale: "Ползва порта за проверена правна основа на платените продукти." },
  { name: "refine-product", kind: "product_legal_output", requiresStrictLegalGate: false, rationale: "Ползва същия порт за проверена правна основа." },
  { name: "ocr-contract", kind: "nonlegal_extraction", requiresStrictLegalGate: false, rationale: "Разчита текст от изображение; не прави правни твърдения." },
  { name: "simulation-run", kind: "internal_test", requiresStrictLegalGate: false, rationale: "Вътрешна симулация, недостъпна за клиент." },
  { name: "simulation-regression", kind: "internal_test", requiresStrictLegalGate: false, rationale: "Вътрешни регресии, недостъпни за клиент." },
  { name: "growth-brief", kind: "internal_test", requiresStrictLegalGate: false, rationale: "Вътрешна аналитична записка за администратор." },
  { name: "admin-generate-article", kind: "editorial_draft_only", requiresStrictLegalGate: true, rationale: "Създава САМО чернова за човешки преглед; без самоодобрение или публикуване." },
  { name: "warm-blank-cache", kind: "editorial_draft_only", requiresStrictLegalGate: true, rationale: "Създава само чернови; не вписва публично преизползваема бланка." },
]);

export function findAiEndpointPolicy(name: string): AiEndpointPolicy | undefined {
  return AI_ENDPOINT_POLICIES.find((p) => p.name === name);
}
