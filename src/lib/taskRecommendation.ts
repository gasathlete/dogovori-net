import { getProduct, productPath, productPriceLabel, ONE_TIME_PURCHASES_AVAILABLE } from "@/lib/products";
import { isFeatureAvailable } from "@/lib/prelaunch";

export type DocumentTask = "new" | "existing" | "sequence";
export type NewDocumentChoice = "template" | "tailored";
export function taskRecommendation(task: DocumentTask, choice: NewDocumentChoice = "template") {
  if (task === "existing") {
    const product = getProduct("contract_check");
    return { id: "check", title: product.name, reason: "Имате документ и искате да прегледате условията преди подписване.", to: productPath(product), next: "Разгледайте обхвата и примерния резултат преди вход.", price: `${productPriceLabel(product.id)} · еднократно`, available: ONE_TIME_PURCHASES_AVAILABLE };
  }
  if (task === "sequence") return { id: "kit", title: "Комплект за Вашата ситуация", reason: "Нужни са Ви последователни документи, а не само един образец.", to: "/komplekti", next: "Изберете ситуация и вижте наличните и предстоящите документи.", price: "Разглеждане на комплектите", available: true };
  if (choice === "tailored") return { id: "tailored", title: "Изготвяне по Ваши параметри", reason: "Искате да зададете условията на документа стъпка по стъпка.", to: "/build", next: "Попълвате параметри; обработката изисква съгласие и налични операции.", price: "По наличните операции в профила", available: isFeatureAvailable("document_generation") };
  return { id: "template", title: "Образец от каталога", reason: "Знаете какъв документ Ви трябва и предпочитате да започнете от образец.", to: "/catalog", next: "Разгледайте и изберете документ. Каталогът е в преработка.", price: "Разглеждане без регистрация", available: true };
}