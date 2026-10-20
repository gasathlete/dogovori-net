/** Exact reviewed originals from the 12 October report; never infer by title or category. */
export const ORIGINALS_UNDER_REVISION = [
  "predizvestie-za-prekratyavane-na-naem",
  "priemo-predavatelen-protokol",
  "sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie",
  "dogovor-za-naem-na-parkomyasto-garazh",
  "uchreditelen-akt-na-eood",
] as const;

export function isOriginalUnderRevision(slug: string): boolean {
  return ORIGINALS_UNDER_REVISION.some((original) => original === slug);
}