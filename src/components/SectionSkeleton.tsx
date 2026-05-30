export function SectionSkeleton({ minHeight = 400 }: { minHeight?: number }) {
  return (
    <section
      aria-hidden="true"
      className="container py-12 sm:py-16"
      style={{ minHeight }}
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="mx-auto h-3 w-32 rounded-full bg-muted/60 shimmer-bar" />
        <div className="mx-auto h-7 w-3/4 rounded-md bg-muted/60 shimmer-bar" />
        <div className="mx-auto h-4 w-2/3 rounded-md bg-muted/40 shimmer-bar" />
      </div>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl border border-hairline bg-card/60 shimmer-bar"
          />
        ))}
      </div>
    </section>
  );
}
