// AUTO-GENERATED — registry of full draft texts for templates.
// Each draft is the complete ready-to-fill text of the document.

export type TemplateDraftLoader = () => Promise<string>;

const loaders: Record<string, TemplateDraftLoader> = {
  // populated by scripts/gen-new-templates.ts
};

export function loadTemplateDraft(slug: string): Promise<string> | undefined {
  const fn = loaders[slug];
  return fn ? fn() : undefined;
}

export function hasTemplateDraft(slug: string): boolean {
  return slug in loaders;
}
