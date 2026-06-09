export function GenericPane({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Този изглед предстои.</p>
      </div>
    </div>
  );
}
