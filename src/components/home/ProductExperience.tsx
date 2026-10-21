import { BrandMark } from "@/components/BrandLogo";
import { ProductShowcaseCarousel } from "@/components/products/ProductShowcaseCarousel";
import { ComparisonTable } from "@/components/ComparisonTable";
import { Link } from "react-router-dom";

export function ProductExperience() {
  return (
    <section className="home-product-experience home-content-bridge commerce-experience border-b border-border py-10 sm:py-16" aria-labelledby="product-experience-title">
      <div className="container">
        <div className="mb-6 flex items-start gap-4"><BrandMark decorative className="hidden h-16 w-20 shrink-0 sm:block" /><div><p className="text-sm text-muted-foreground">За Ваш собствен документ</p><h2 id="product-experience-title" className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Какво получавате за Вашия документ?</h2><p className="mt-3 max-w-2xl text-muted-foreground">Находки с извадки, поправки Преди/След или план за преговори с писма. Примерите са демонстрации, не Ваш документ.</p></div></div>
        <ProductShowcaseCarousel source="home_restored" className="brand-product" />
        <ComparisonTable />
        <div className="mt-8 border-t border-border pt-6">
          <h3 className="font-serif text-2xl font-bold">Образец, изготвяне или комплект?</h3>
          <dl className="mt-5 divide-y divide-border">
            {[
              { title: "Образец", text: "Разглеждате текст от каталога и преценявате необходимите промени.", to: "/catalog" },
              { title: "Изготвяне", text: "Въвеждате конкретните обстоятелства и преглеждате подготвения текст.", to: "/build" },
              { title: "Комплект", text: "Няколко свързани документа за последователните етапи на една ситуация.", to: "/komplekti" },
            ].map((item) => <div key={item.to} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]"><dt><Link className="link-ink inline-flex min-h-11 items-center font-semibold" to={item.to}>{item.title} →</Link></dt><dd className="self-center text-sm leading-relaxed text-muted-foreground">{item.text}</dd></div>)}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">Обхватът и условията са на съответната страница. Проверете внимателно преди подписване.</p>
        </div>
      </div>
    </section>
  );
}