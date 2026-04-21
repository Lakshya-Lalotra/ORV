"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_PROGRESS,
  LOCAL_PROGRESS_EVENT,
  LOCAL_PROGRESS_KEY,
  readLocalProgress,
  type LocalProgress,
} from "@/lib/local-progress";

/**
 * Subscribe to the `orv-reader-progress` localStorage blob and
 * re-render on writes from either this tab (custom event) or other
 * tabs (native `storage` event). Returns `EMPTY_PROGRESS` on SSR and
 * on the first client render (hydration-safe), then hydrates to the
 * real value on mount.
 */
export function useLocalProgress(): LocalProgress {
  const [progress, setProgress] = useState<LocalProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    setProgress(readLocalProgress());

    const onLocal = () => setProgress(readLocalProgress());
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_PROGRESS_KEY) setProgress(readLocalProgress());
    };

    window.addEventListener(LOCAL_PROGRESS_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LOCAL_PROGRESS_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return progress;
}
