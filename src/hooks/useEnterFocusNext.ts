import { useCallback } from "react";

/**
 * Enter в текстово поле → фокус върху следващото празно поле в същия контейнер.
 *
 * Намалява триенето при попълване на дълги правни формуляри: потребителят
 * може да мине целия екран само с клавиатура, без да търси къде е останало
 * непопълнено. Ако няма следващо празно поле, връща false, за да може
 * извикващият компонент да продължи напред (напр. следваща стъпка).
 */
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])';

export function useEnterFocusNext() {
  return useCallback((e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key !== "Enter") return false;
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    // В multiline полета Enter означава нов ред.
    if (target.tagName === "TEXTAREA" && !e.metaKey && !e.ctrlKey) return false;
    if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return false;

    const container = e.currentTarget as HTMLElement;
    const fields = Array.from(
      container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FIELD_SELECTOR),
    ).filter((el) => el.offsetParent !== null);

    const idx = fields.indexOf(target as HTMLInputElement);
    const isEmpty = (el: HTMLInputElement | HTMLTextAreaElement) => !el.value?.trim();

    // Първо търсим напред, после — от началото (за прескочени полета).
    const next =
      fields.slice(idx + 1).find(isEmpty) ?? fields.slice(0, Math.max(idx, 0)).find(isEmpty);

    e.preventDefault();
    if (!next) return false;
    next.focus();
    if ("setSelectionRange" in next && typeof next.value === "string") {
      try {
        next.setSelectionRange(next.value.length, next.value.length);
      } catch {
        /* полета като date не поддържат селекция */
      }
    }
    return true;
  }, []);
}
