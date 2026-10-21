import { BrandMark } from "@/components/BrandLogo";
import { ProductShowcaseCarousel } from "@/components/products/ProductShowcaseCarousel";
import { ComparisonTable } from "@/components/ComparisonTable";

export function ProductExperience() {
  return (
    <section className="border-b border-border py-14 sm:py-20" aria-labelledby="product-experience-title">
      <div className="container">
        <div className="mb-8 flex items-start gap-5"><BrandMark decorative className="h-16 w-20" /><div><p className="text-sm text-muted-foreground">Вижте какво получавате</p><h2 id="product-experience-title" className="mt-2 font-serif text-3xl font-bold sm:text-4xl">Проверка, поправка или подготовка за преговори</h2><p className="mt-3 max-w-2xl text-muted-foreground">Разгледайте находките, сравнете текста преди и след и отворете примерните писма. Всички примери са демонстрации.</p></div></div>
        <ProductShowcaseCarousel source="home_restored" className="brand-product" />
        <ComparisonTable />
      </div>
    </section>
  );
}