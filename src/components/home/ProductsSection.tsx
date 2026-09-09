/**
 * Началната страница — компактната, конверсионна версия на продуктовата
 * витрина. Ползва същата конфигурация и същите компоненти като /produkti.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { ProductCards } from "@/components/products/ProductCards";

export function ProductsSection() {
  return (
    <section
      id="produkti"
      aria-labelledby="home-products-title"
      className="container py-10 sm:py-14"
    >
      <div className="eyebrow mb-3 justify-center">
        <span className="h-px w-8 bg-gold/40" />
        Готови за поръчка
      </div>
      <h2
        id="home-products-title"
        className="mb-2 text-center font-serif text-2xl font-bold text-foreground sm:text-3xl"
      >
        Разгледайте нашите продукти
      </h2>
      <p className="mx-auto mb-6 max-w-xl text-center text-sm text-muted-foreground">
        Три ясни резултата за конкретен договор или за цялата ви договорна
        организация. Плащате веднъж за избрания резултат.
      </p>

      <ProductCards variant="compact" source="home" />

      <div className="mt-6 text-center">
        <Link
          to="/produkti"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-gold"
        >
          Виж всички детайли по продуктите
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
