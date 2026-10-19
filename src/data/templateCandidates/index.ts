/**
 * Регистър на кандидат-версиите. Нито един кандидат не се зарежда от
 * публичните страници/wizard-а — оригиналите в templateDrafts остават в сила.
 */
import type { TemplateCandidate } from "@/lib/templateRegen/types";
import notice from "./predizvestie-za-prekratyavane-na-naem.v2";
import protocol from "./priemo-predavatelen-protokol.v2";
import mutual from "./sporazumenie-za-prekratyavane-na-naem-po-vzaimno-saglasie.v2";
import parking from "./dogovor-za-naem-na-parkomyasto-garazh.v2";
import eood from "./uchreditelen-akt-na-eood.v2";

export const TEMPLATE_CANDIDATES: readonly TemplateCandidate[] = [notice, protocol, mutual, parking, eood];
