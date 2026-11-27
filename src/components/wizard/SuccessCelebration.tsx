import { CheckCircle } from "@/icons";

const SPARKS = [
  { x: "-34px", y: "-26px", delay: "40ms" },
  { x: "30px", y: "-30px", delay: "110ms" },
  { x: "-26px", y: "22px", delay: "180ms" },
  { x: "36px", y: "18px", delay: "80ms" },
  { x: "0px", y: "-38px", delay: "150ms" },
];

/**
 * Дискретна визуална награда при успешно генериране:
 * pop на тикчето, едно разширяващо се кръгче и няколко искри.
 * Изпълнява се еднократно и уважава prefers-reduced-motion.
 */
export function SuccessCelebration({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-6 w-6 items-center justify-center ${className ?? ""}`} aria-hidden="true">
      <span className="success-ring absolute inset-0 rounded-full border border-emerald-500/50 dark:border-gold/50" />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="success-spark absolute h-1 w-1 rounded-full bg-emerald-500 dark:bg-gold"
          style={
            {
              ["--spark-x" as string]: s.x,
              ["--spark-y" as string]: s.y,
              animationDelay: s.delay,
            } as React.CSSProperties
          }
        />
      ))}
      <CheckCircle className="success-pop h-5 w-5 text-success" />
    </span>
  );
}
