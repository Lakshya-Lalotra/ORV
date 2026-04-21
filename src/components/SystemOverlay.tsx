"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: string; title: string; body: string; variant?: "info" | "warn" };

const OverlayCtx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function SystemOverlayProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setStack((s) => [...s, { ...t, id }]);
    window.setTimeout(() => {
      setStack((s) => s.filter((x) => x.id !== id));
    }, 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <OverlayCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-20 z-50 flex max-w-sm flex-col gap-3 md:right-8">
        <AnimatePresence>
          {stack.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 80, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 40, filter: "blur(4px)" }}
              className="pointer-events-auto border border-[var(--glow)] bg-[var(--reader-elevated)] px-4 py-3 font-mono text-xs text-[var(--reader-fg)] shadow-[0_0_24px_var(--glow)] backdrop-blur-md md:text-sm"
            >
              <div className="mb-1 text-[var(--accent)]">
                {t.title || "[ SYSTEM ]"}
              </div>
              <div className="whitespace-pre-wrap text-[var(--reader-body)]">{t.body}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </OverlayCtx.Provider>
  );
}

export function useSystemOverlay() {
  const v = useContext(OverlayCtx);
  if (!v) throw new Error("useSystemOverlay outside provider");
  return v;
}
