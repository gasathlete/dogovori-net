/**
 * „Какво искате да направите?“ — практични задачи, насочени към съществуващи
 * комплекти. Не съдържа документи или правен текст; само етикет → комплект.
 * `preparationPath` е наличен само когато има реална споделена подготовка.
 */
export interface EverydayTask {
  id: string;
  label: string;
  kitId: string;
  preparationPath?: string;
}

export const RENTAL_PREPARATION_PATH = "/komplekti/naem-zhilishte/podgotovka";

export const EVERYDAY_TASKS: readonly EverydayTask[] = [
  { id: "furnished-rental", label: "Отдавам обзаведено жилище под наем", kitId: "naem-zhilishte", preparationPath: RENTAL_PREPARATION_PATH },
  { id: "sell-car", label: "Продавам автомобил", kitId: "prodajba-mps" },
  { id: "buy-sell-property", label: "Купувам или продавам имот", kitId: "pokupko-prodajba-imot", preparationPath: "/komplekti/pokupko-prodajba-imot/podgotovka" },
  { id: "inheritance", label: "Подготвям завещание или уреждам наследство", kitId: "nasledstvo-paket", preparationPath: "/komplekti/nasledstvo-paket/podgotovka" },
  { id: "hire-employee", label: "Назначавам служител", kitId: "trudovo-naznachavane" },
  { id: "freelance-work", label: "Работя като фрийлансър с клиент", kitId: "freelancer-paket" },
  { id: "digital-project", label: "Възлагам уебсайт или приложение", kitId: "digitalen-proekt" },
];

export function taskForKit(kitId: string): EverydayTask | undefined {
  return EVERYDAY_TASKS.find((t) => t.kitId === kitId);
}
