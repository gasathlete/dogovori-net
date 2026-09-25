/**
 * Координира запазването на генериран резултат в saved_documents.
 *
 * Идентичност = (собственик, ТОЧНИЯТ резултат като обект), никога категорията.
 * - За всяка двойка се заделя ЕДИН стабилен id (UUID) преди първия опит и се
 *   пази при всеки изход, вкл. неизвестен (изгубен отговор). Повторният опит
 *   вмъква СЪЩИЯ id; persistence слоят разпознава вече записания ред по id +
 *   собственик (виж `insertSavedDocumentOnce`) → точно един ред.
 * - Два различни резултата или два собственика → различни id.
 * - Паралелен ръчен + автоматичен запис за същата двойка споделят една заявка.
 * - Закъснял отговор за стар резултат/стар собственик не се прикача.
 *
 * Ограничение (честно): идентичността живее в паметта на таба. След презареждане
 * същият резултат получава нов id, т.е. това НЕ е трайно exactly-once между
 * сесии. Новият запис на съдържание в момента е затворен от
 * `savedDocumentWriteGuard` преди мрежата — координаторът не го заобикаля.
 */
export interface ResultSaveCoordinator<K extends object> {
  setCurrent(key: K | null, owner?: string | null): void;
  isCurrent(key: K, owner: string): boolean;
  /** Стабилният id за двойката (заделя се при първо поискване). */
  idFor(key: K, owner: string): string;
  /** Връща id на записа; onAttach се вика само ако двойката още е текуща. */
  save(
    key: K,
    owner: string,
    insert: (id: string) => Promise<string>,
    onAttach: (id: string) => void,
  ): Promise<string>;
  savedIdFor(key: K, owner: string): string | undefined;
}

function newId(): string {
  return crypto.randomUUID();
}

export function createResultSaveCoordinator<K extends object>(
  makeId: () => string = newId,
): ResultSaveCoordinator<K> {
  let current: K | null = null;
  let currentOwner: string | null = null;
  const ids = new WeakMap<K, Map<string, string>>();
  const pending = new WeakMap<K, Map<string, Promise<string>>>();
  const saved = new WeakMap<K, Map<string, string>>();
  const slot = <V>(m: WeakMap<K, Map<string, V>>, key: K) => {
    let s = m.get(key);
    if (!s) { s = new Map(); m.set(key, s); }
    return s;
  };
  const isCurrent = (key: K, owner: string) => current === key && currentOwner === owner;
  const idFor = (key: K, owner: string) => {
    const s = slot(ids, key);
    let id = s.get(owner);
    if (!id) { id = makeId(); s.set(owner, id); }
    return id;
  };
  return {
    setCurrent(key, owner = null) { current = key; currentOwner = owner ?? null; },
    isCurrent,
    idFor,
    savedIdFor(key, owner) { return saved.get(key)?.get(owner); },
    async save(key, owner, insert, onAttach) {
      if (!owner) throw new Error("not_signed_in");
      const known = saved.get(key)?.get(owner);
      if (known) {
        if (isCurrent(key, owner)) onAttach(known);
        return known;
      }
      const pend = slot(pending, key);
      let p = pend.get(owner);
      if (!p) {
        const id = idFor(key, owner); // запазва се и при неуспех
        p = insert(id).then(
          (got) => {
            if (got !== id) throw new Error("save_identity_mismatch");
            slot(saved, key).set(owner, got);
            pend.delete(owner);
            return got;
          },
          (e) => { pend.delete(owner); throw e; },
        );
        pend.set(owner, p);
      }
      const got = await p;
      if (isCurrent(key, owner)) onAttach(got);
      return got;
    },
  };
}

/** Минимален интерфейс на клиента, нужен за идемпотентното вмъкване. */
export interface SavedDocumentsClient {
  from(table: "saved_documents"): {
    insert(row: Record<string, unknown>): {
      select(cols: "id"): { single(): PromiseLike<{ data: { id: string } | null; error: { code?: string } | null }> };
    };
    select(cols: "id"): {
      eq(col: "id", v: string): {
        eq(col: "user_id", v: string): {
          maybeSingle(): PromiseLike<{ data: { id: string } | null; error: unknown }>;
        };
      };
    };
  };
}

/**
 * Вмъква ред с предварително заделен id. При конфликт по първичния ключ
 * (23505 — предишният опит е записан, но отговорът е изгубен) проверява, че
 * редът с ТОЗИ id принадлежи на ТОЗИ собственик, и връща същия id. Никога не
 * обновява съществуващ ред и не търси по категория.
 */
export async function insertSavedDocumentOnce(
  client: SavedDocumentsClient,
  row: Record<string, unknown> & { id: string; user_id: string },
): Promise<string> {
  const { data, error } = await client.from("saved_documents").insert(row).select("id").single();
  if (!error && data?.id === row.id) return row.id;
  if (error && error.code === "23505") {
    const { data: existing, error: readErr } = await client
      .from("saved_documents").select("id").eq("id", row.id).eq("user_id", row.user_id).maybeSingle();
    if (!readErr && existing?.id === row.id) return row.id;
    throw new Error("save_identity_conflict");
  }
  throw error ?? new Error("save_failed");
}
