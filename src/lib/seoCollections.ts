import { SECTOR_PACKAGES, type SectorPackageId } from "../data/sectorPackages";
import { BLOG_POST_META } from "./blogMeta.generated";

// Explicit editorial relationships: never infer a legal use case from a keyword.
const PACKAGE_GUIDES: Record<SectorPackageId, readonly string[]> = {
  package_rentals: ["vrashtane-na-naeto-zhilishte-podgotovka", "podnovyavane-na-naem-promeni-aneks", "opis-na-obzavezhdane-pri-naem", "kak-da-napravim-dogovor-za-naem", "kak-da-prekratim-dogovor-za-naem"],
  package_services: ["obhvat-na-usluga-predi-oferta", "dopalnitelna-rabota-izvan-zadanieto", "priemane-na-rabota-po-etapi", "dogovor-za-uslugi-mezhdu-firmi", "dogovor-za-izrabotka-zzd", "grazhdanski-dogovor-vs-trudov-dogovor"],
  package_digital_agencies: ["reviziya-ili-novo-zadanie-promeni", "predavane-na-ueb-proekt-dostapi", "zadanie-za-uebsayt-kakvo-da-utochnim", "nda-spogodba-za-poveritelnost", "dogovor-za-izrabotka-zzd", "dogovor-za-uslugi-mezhdu-firmi"],
  package_employment: ["predavane-na-firmeno-oborudvane", "promyana-na-dlazhnost-danni-sporazumenie", "dlazhnostna-harakteristika-podgotovka", "trudov-dogovor-osnovni-elementi", "platen-godishen-otpusk-rakovodstvo", "predizvestie-uvolnenie"],
};

export function getPackageGuides(id: SectorPackageId) {
  return PACKAGE_GUIDES[id].flatMap((slug) => {
    const post = BLOG_POST_META.find((item) => item.slug === slug);
    return post ? [post] : [];
  });
}

export function getSectorPackagesForArticle(slug: string) {
  return SECTOR_PACKAGES.filter((item) => getPackageGuides(item.id).some((post) => post.slug === slug));
}

export function getSectorPackagesForDocument(name: string) {
  return SECTOR_PACKAGES.filter((item) => item.documents.some((document) =>
    document.status === "browseable" && document.docName === name,
  ));
}

export function getSectorPackagesForKit(id: string) {
  return SECTOR_PACKAGES.filter((item) => item.relatedKitId === id);
}
