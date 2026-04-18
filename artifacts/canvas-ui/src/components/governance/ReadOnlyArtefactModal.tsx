import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReadOnlyArtefactModalProps {
  title: string;
  testid: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ReadOnlyArtefactModal({
  title,
  testid,
  open,
  onClose,
  children,
}: ReadOnlyArtefactModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      data-testid={testid}
    >
      <div
        className="bg-card border border-border rounded-md max-w-3xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Read-only · {title}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            data-testid={`${testid}-close`}
            className="gap-2"
          >
            <X className="w-4 h-4" /> Close
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
