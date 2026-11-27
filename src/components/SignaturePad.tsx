import { useEffect, useState } from "react";

export function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0a0a1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [canvas]);

  const point = (e: React.PointerEvent) => {
    const r = canvas!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas!.width,
      y: ((e.clientY - r.top) / r.height) * canvas!.height,
    };
  };

  const start = (e: React.PointerEvent) => {
    if (!canvas) return;
    setDrawing(true);
    setHasInk(true);
    const ctx = canvas.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing || !canvas) return;
    const ctx = canvas.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing || !canvas) return;
    setDrawing(false);
    onCapture(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onCapture("");
  };

  return (
    <div>
      <canvas
        ref={setCanvas}
        width={600}
        height={180}
        className="w-full touch-none rounded-md border border-border bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{hasInk ? "Подписано" : "Подпишете в полето с пръст или мишка"}</span>
        <button type="button" onClick={clear} className="text-gold underline-offset-4 hover:underline">
          Изчисти
        </button>
      </div>
    </div>
  );
}
