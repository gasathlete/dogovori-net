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
import resign from "./molba-za-napuskane.v2";
import mutual325 from "./sporazumenie-za-prekratyavane-po-chl-325-al-1-t-1-kt.v2";
import leave from "./molba-zayavlenie-za-otpusk.v2";

export const TEMPLATE_CANDIDATES: readonly TemplateCandidate[] = [notice, protocol, mutual, parking, eood, resign, mutual325, leave];
