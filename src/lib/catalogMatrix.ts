/**
 * Канонична матрица „колекция → етап → документ → slug → статус“.
 *
 * Надгражда съществуващите източници (SECTOR_PACKAGES, DOCUMENT_KITS,
 * FEATURED_KIT_STAGES) — не е втори каталог. Документ е „наличен“ само ако
 * името му се разрешава до реален шаблон в каноничния каталог. „Готов за
 * продажба“ е само при версиран asset + SHA-256 + юридическо приемане на
 * ТОЧНО тази версия; общото твърдение за прегледан каталог не стига.
 */
import { SECTOR_PACKAGES } from "@/data/sectorPackages";
import { DOCUMENT_KITS } from "@/data/documentKits";
import { FEATURED_KIT_STAGES, isFeaturedKitId } from "@/data/featuredKitStages";

export type CollectionType = "package" | "kit";
export type DocumentAvailability = "available" | "in_preparation";
/** Правен статус на конкретния файл. Без запис по версия — винаги „не е потвърден“. */
export type LegalReviewStatus = "version_accepted" | "not_confirmed_for_version";

export interface StaticAssetRecord {
  slug: string;
  version: string;
  contentSha256: string;
  legalAcceptanceRef: string;
  legalAcceptedVersion: string;
  revokedAt?: string | null;
}

export interface MatrixEntry {
  collectionType: CollectionType;
  collectionId: string;
  stageIndex: number;
  stageLabel: string;
  title: string;
  docName: string | null;
  slug: string | null;
  availability: DocumentAvailability;
  optional: boolean;
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Fail-closed: продаваем е само точно приет, неотменен, хеширан asset. */
export function legalReviewFor(entry: Pick<MatrixEntry, "slug" | "availability">, asset?: StaticAssetRecord | null): LegalReviewStatus {
  if (!asset || !entry.slug || entry.availability !== "available") return "not_confirmed_for_version";
  if (asset.slug !== entry.slug || asset.revokedAt) return "not_confirmed_for_version";
  if (!SHA256.test(asset.contentSha256) || !asset.version || !asset.legalAcceptanceRef.trim()) return "not_confirmed_for_version";
  return asset.legalAcceptedVersion === asset.version ? "version_accepted" : "not_confirmed_for_version";
}

export function isSaleReady(entry: MatrixEntry, asset?: StaticAssetRecord | null, serverDeliveryVerified = false): boolean {
  return serverDeliveryVerified && legalReviewFor(entry, asset) === "version_accepted";
}

/**
 * В source няма нито един юридически приет по версия asset. Списъкът е
 * празен умишлено; попълва се само от сървърния sandbox регистър.
 */
export const ACCEPTED_STATIC_ASSETS: readonly StaticAssetRecord[] = [];

export function buildCatalogMatrix(slugByName: ReadonlyMap<string, string>): MatrixEntry[] {
  const out: MatrixEntry[] = [];
  const resolve = (name?: string | null) => (name ? slugByName.get(name) ?? null : null);

  for (const pkg of SECTOR_PACKAGES) {
    const stages = [...new Set(pkg.documents.map((d) => d.stage))];
    for (const doc of pkg.documents) {
      const slug = doc.status === "browseable" ? resolve(doc.docName) : null;
      out.push({
        collectionType: "package", collectionId: pkg.id, stageIndex: stages.indexOf(doc.stage),
        stageLabel: doc.stage.replace(/^\d+ · /, ""), title: doc.title, docName: doc.docName ?? null,
        slug, availability: slug ? "available" : "in_preparation", optional: false,
      });
    }
  }

  for (const kit of DOCUMENT_KITS) {
    if (!isFeaturedKitId(kit.id)) continue;
    const byName = new Map(kit.items.map((i) => [i.docName, i]));
    FEATURED_KIT_STAGES[kit.id].forEach((stage, stageIndex) => {
      for (const name of stage.documentNames) {
        const slug = resolve(name);
        out.push({
          collectionType: "kit", collectionId: kit.id, stageIndex, stageLabel: stage.label, title: name,
          docName: name, slug, availability: slug ? "available" : "in_preparation", optional: Boolean(byName.get(name)?.optional),
        });
      }
      if (stage.plannedItem) {
        out.push({
          collectionType: "kit", collectionId: kit.id, stageIndex, stageLabel: stage.label, title: stage.plannedItem,
          docName: null, slug: null, availability: "in_preparation", optional: false,
        });
      }
    });
  }
  return out;
}

/** „В какъв ред? / Какво следва?“ — практични указания без правни твърдения. */
export interface KitGuide { whatYouNeed: string; nextStep: string; }

export const KIT_GUIDES: Readonly<Record<string, KitGuide>> = {
  "naem-zhilishte": { whatYouNeed: "Данни за страните, адреса, наема и депозита.", nextStep: "След подписване съхранете протокола и описа заедно с договора." },
  "pokupko-prodajba-imot": { whatYouNeed: "Данни за имота, документа за собственост и уговорената цена.", nextStep: "Окончателният договор се изповядва пред нотариус; проектът служи за подготовка." },
  "prodajba-mps": { whatYouNeed: "Данни за автомобила, страните и цената.", nextStep: "Регистрацията на промяната се извършва в КАТ в определения срок." },
  "trudovo-naznachavane": { whatYouNeed: "Данни за работодателя, длъжността и възнаграждението.", nextStep: "Уведомлението до НАП се подава преди постъпването на работа." },
  "freelancer-paket": { whatYouNeed: "Обхват на услугата, срок и начин на плащане.", nextStep: "Пазете документите за плащане за годишната декларация." },
  "digitalen-proekt": { whatYouNeed: "Описание на проекта, етапи и критерии за приемане.", nextStep: "Всяка промяна извън обхвата се описва отделно преди изпълнение." },
  "nasledstvo-paket": { whatYouNeed: "Данни за наследодателя и наследниците, без да въвеждате ЕГН предварително.", nextStep: "Удостоверението за наследници се иска от общината по последния постоянен адрес." },
};
