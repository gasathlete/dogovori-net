import { getTemplateDiscoveryProfile } from "../../src/lib/templateDiscovery";
import { findPostMeta } from "../../src/lib/blogMeta.generated";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function renderTemplatePreparation(slug: string): string {
  const profile = getTemplateDiscoveryProfile(slug);
  if (!profile) return "";
  const guide = findPostMeta(profile.guideSlug);
  return `<section><h2>Подготовка преди попълване</h2><p>${escapeHtml(profile.context)}</p><ul>${profile.prepare.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>${guide ? `<p><a href="/blog/${escapeHtml(guide.slug)}">${escapeHtml(guide.title)}</a></p>` : ""}</section>`;
}
