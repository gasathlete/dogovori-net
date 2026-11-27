import gridGold from "@/assets/bg/grid-gold.webp";
import flowNodes from "@/assets/bg/flow-nodes.webp";
import papers from "@/assets/bg/papers.webp";
import shield from "@/assets/bg/shield.webp";

/**
 * Декоративен фон за секция. Изображенията са компресирани (< 25KB всяко),
 * зареждат се lazy и никога не блокират първото рисуване.
 */
export type BackdropVariant = "grid" | "flow" | "papers" | "shield" | "dots" | "rings";

const IMAGES: Partial<Record<BackdropVariant, string>> = {
  grid: gridGold,
  flow: flowNodes,
  papers,
  shield,
};

const ALIGN: Record<string, string> = {
  top: "object-top",
  center: "object-center",
  bottom: "object-bottom",
};

type Props = {
  variant?: BackdropVariant;
  /** Позиция на изображението спрямо секцията. */
  align?: "top" | "center" | "bottom";
  /** Непрозрачност на изображението (0–100). По подразбиране дискретна. */
  intensity?: "subtle" | "medium";
  className?: string;
};

export function SectionBackdrop({
  variant = "dots",
  align = "center",
  intensity = "subtle",
  className = "",
}: Props) {
  const img = IMAGES[variant];
  const opacity = intensity === "medium" ? "opacity-[0.22]" : "opacity-[0.12]";

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      {img ? (
        <img
          src={img}
          alt=""
          width={1280}
          height={640}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover ${ALIGN[align]} ${opacity} [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]`}
        />
      ) : null}

      {variant === "dots" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--primary)/0.16)_1px,transparent_0)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
      )}

      {variant === "rings" && (
        <div className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 bg-[repeating-radial-gradient(circle_at_center,hsl(var(--primary)/0.10)_0px,hsl(var(--primary)/0.10)_1px,transparent_1px,transparent_46px)] [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
      )}

      {/* Мек брандов блясък — еднакъв ритъм във всички секции */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_15%_0%,hsl(var(--primary)/0.07),transparent_65%),radial-gradient(ellipse_55%_45%_at_85%_100%,hsl(var(--accent)/0.06),transparent_65%)]" />
    </div>
  );
}

/** Обвивка: секция с декоративен фон, без да пипаме вътрешния компонент. */
export function BackdropSection({
  children,
  ...props
}: Props & { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <SectionBackdrop {...props} />
      {children}
    </div>
  );
}
