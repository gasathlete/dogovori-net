/**
 * ПОЛЕТА ОТ ФОРМА СА ДАННИ, НЕ ИНСТРУКЦИИ.
 *
 * Обезврежда опити да се затвори ограждащият блок или да се вмъкнат системни
 * указания в промпта, без да променя смисъла на текста за човешкия проверител.
 */
export function escapeUntrusted(value: string): string {
  return String(value ?? "")
    .replace(/`/g, "'")
    .replace(/"{2,}/g, "'")
    .replace(/<\/?(system|instructions?)>/gi, "")
    .replace(/>>>/g, ">")
    .slice(0, 6000);
}
