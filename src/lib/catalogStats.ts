/**
 * Броят документи и категории в каталога.
 *
 * ВАЖНО (производителност): тук НЕ се импортва самият каталог. Числата идват от
 * леките константи в `@/data/catalogCounts`, които се валидират срещу реалните
 * данни от `src/test/catalogCounts.test.ts`. Така публичното копие показва
 * точно число, без да тегли ~270 KB JSON в entry chunk-а.
 */
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";

export const CATALOG_DOCUMENT_COUNT = TEMPLATES_COUNT;

export const CATALOG_CATEGORY_COUNT = SECTORS_COUNT;
