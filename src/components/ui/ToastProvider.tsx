import React, { createContext, useCallback, useContext, useState } from "react";
import { Check, AlertTriangle, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
}

interface ToastContextValue {
  notify: (title: string, opts?: { description?: string; kind?: ToastKind }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const notify = useCallback((title: string, opts?: { description?: string; kind?: ToastKind }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev.slice(-3), { id, title, description: opts?.description, kind: opts?.kind ?? "info" }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {items.map((item) => (
          <div
            key={item.id}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm"
          >
            <span className="mt-0.5 shrink-0">
              {item.kind === "success" && <Check className="h-4 w-4 text-success" />}
              {item.kind === "error" && <AlertTriangle className="h-4 w-4 text-destructive" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug">{item.title}</div>
              {item.description && (
                <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{item.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
