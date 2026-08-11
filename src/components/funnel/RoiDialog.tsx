/**
 * RoiDialog — отваря ROI калкулатора в диалог от вторичен CTA
 * („Виж колко спестяваш"), без да отвежда потребителя от Hero-то.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoiCalculator } from "@/components/funnel/RoiCalculator";

export function RoiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Колко спестяваш с Dogovori.net?
          </DialogTitle>
        </DialogHeader>
        <RoiCalculator hideHeader className="border-0 bg-transparent p-0" />
      </DialogContent>
    </Dialog>
  );
}

export default RoiDialog;
