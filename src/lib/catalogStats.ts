/**
 * Броят документи в каталога — изчислен от самия каталог.
 *
 * Публичното копие никога не твърди фиксирано число, което може да остарее;
 * винаги минава през тези константи.
 */
import { CATALOG } from "@/data/catalog";

export const CATALOG_DOCUMENT_COUNT = CATALOG.reduce(
  (sum, category) => sum + category.documents.length,
  0,
);

export const CATALOG_CATEGORY_COUNT = CATALOG.length;
