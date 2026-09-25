/**
 * Координира запазването на генериран резултат в saved_documents.
 *
 * Идентичността е ТОЧНИЯТ резултат (референция към обекта), не категорията.
 * - Два различни резултата винаги дават два отделни записа.
 * - Повторен опит/паралелен ръчен + автоматичен запис за същия резултат
 *   споделят една и съща заявка (една вмъкната редица).
 * - Закъснял отговор за стар резултат не се прикача към по-нов.
 * - Неуспешен запис се освобождава, за да може да се опита отново.
 */
export interface ResultSaveCoordinator<K extends object> {
  setCurrent(key: K | null): void;
  isCurrent(key: K): boolean;
  /** Връща id на записа; onAttach се вика само ако резултатът още е текущ. */
  save(key: K, insert: () => Promise<string>, onAttach: (id: string) => void): Promise<string>;
  savedIdFor(key: K): string | undefined;
}

export function createResultSaveCoordinator<K extends object>(): ResultSaveCoordinator<K> {
  let current: K | null = null;
  const pending = new WeakMap<K, Promise<string>>();
  const saved = new WeakMap<K, string>();
  return {
    setCurrent(key) { current = key; },
    isCurrent(key) { return current === key; },
    savedIdFor(key) { return saved.get(key); },
    async save(key, insert, onAttach) {
      const known = saved.get(key);
      if (known) {
        if (current === key) onAttach(known);
        return known;
      }
      let p = pending.get(key);
      if (!p) {
        p = insert().then(
          (id) => { saved.set(key, id); pending.delete(key); return id; },
          (e) => { pending.delete(key); throw e; },
        );
        pending.set(key, p);
      }
      const id = await p;
      if (current === key) onAttach(id);
      return id;
    },
  };
}
