/**
 * Избор на файл за платен продукт — на български и достъпен.
 *
 * Скритият `input[type=file]` остава истинската контрола (клавиатура и екранни
 * четци го достигат чрез етикета), а видимата зона е чиста и премиум. След
 * избор показваме капсула: икона, кратко име, тип и размер, бутон „Смени“.
 */
import { useRef, useState } from "react";
import { FileText, Upload } from "@/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function kindOf(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? "PDF" : "DOCX";
}

export function DocumentFilePicker({
  file,
  onSelect,
  disabled,
  className,
}: {
  file: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => inputRef.current?.click();

  if (file) {
    return (
      <div
        data-testid="product-file-capsule"
        className={cn(
          "flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/5 p-3",
          className,
        )}
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-gold/15">
          <FileText className="size-5 text-gold" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            data-testid="product-file-name"
            className="block truncate text-sm font-semibold"
            title={file.name}
          >
            {file.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {kindOf(file.name)} · {formatSize(file.size)}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          disabled={disabled}
          onClick={() => {
            onSelect(null);
            if (inputRef.current) inputRef.current.value = "";
            requestAnimationFrame(pick);
          }}
        >
          Смени
        </Button>
        <input
          ref={inputRef}
          id="product-file"
          type="file"
          aria-label="Изберете друг файл"
          accept=".pdf,.docx"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <label
        htmlFor="product-file"
        data-testid="product-file-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer?.files?.[0];
          if (dropped) onSelect(dropped);
        }}
        className={cn(
          "flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center transition-colors",
          dragging ? "border-gold bg-gold/10" : "border-border hover:border-gold/60",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-gold/10">
          <Upload className="size-5 text-gold" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold">Изберете файл от устройството</span>
        <span className="text-xs text-muted-foreground">
          PDF с четим текст или DOCX, до 10 MB
        </span>
      </label>
      <input
        ref={inputRef}
        id="product-file"
        type="file"
        aria-label="Изберете файл от устройството"
        accept=".pdf,.docx"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
