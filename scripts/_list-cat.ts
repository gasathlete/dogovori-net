import { CATALOG } from "../src/data/catalog";
import { slugify } from "../src/lib/slugify";
for (const c of CATALOG) {
  for (const d of c.documents) {
    console.log(`${c.sectorId}\t${slugify(d.name)}\t${d.name}`);
  }
}
