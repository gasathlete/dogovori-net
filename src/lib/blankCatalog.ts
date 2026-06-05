// Flattens CATALOG into a list of blank-generation tasks for the admin warmer.
// One task per (category, document) for monolingual; an additional task for
// documents flagged `bilingual: true` to populate the BG/EN cache namespace.
import { CATALOG } from "@/data/catalog";

export interface BlankTask {
  sector_id: string;
  document_name: string;
  sector_title: string;
  bilingual: boolean;
}

export function buildBlankTasks(): BlankTask[] {
  const tasks: BlankTask[] = [];
  const seen = new Set<string>();

  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      // Monolingual variant — always.
      const monoKey = `${cat.sectorId}::${doc.name}::mono`;
      if (!seen.has(monoKey)) {
        seen.add(monoKey);
        tasks.push({
          sector_id: cat.sectorId,
          document_name: doc.name,
          sector_title: cat.title,
          bilingual: false,
        });
      }
      // Bilingual variant — only for docs that opt in.
      if (doc.bilingual === true) {
        const bilKey = `${cat.sectorId}::${doc.name}::bil`;
        if (!seen.has(bilKey)) {
          seen.add(bilKey);
          tasks.push({
            sector_id: cat.sectorId,
            document_name: doc.name,
            sector_title: cat.title,
            bilingual: true,
          });
        }
      }
    }
  }

  return tasks;
}
