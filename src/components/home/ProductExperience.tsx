import { BrandMark } from "@/components/BrandLogo";
import { ProductShowcaseCarousel } from "@/components/products/ProductShowcaseCarousel";
import { ComparisonTable } from "@/components/ComparisonTable";

export function ProductExperience() {
  return (
    <section className="home-product-experience home-content-bridge commerce-experience border-b border-border py-10 sm:py-16" aria-labelledby="product-experience-title">
      <div className="container">
        <div className="mb-6 flex items-start gap-4"><BrandMark decorative className="hidden h-16 w-20 shrink-0 sm:block" /><div><p className="text-sm text-muted-foreground">За Ваш собствен документ</p><h2 id="product-experience-title" className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Какво получавате за Вашия документ?</h2><p className="mt-3 max-w-2xl text-muted-foreground">Находки с извадки, поправки Преди/След или план за преговори с писма. Примерите са демонстрации, не Ваш документ.</p></div></div>
        <ProductShowcaseCarousel source="home_restored" className="brand-product" />
        <ComparisonTable />
      </div>
    </section>
  );
}