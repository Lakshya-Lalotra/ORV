"use client";

import { useSyncExternalStore } from "react";
import {
  EMPTY_PROGRESS,
  LOCAL_PROGRESS_EVENT,
  LOCAL_PROGRESS_KEY,
  readLocalProgress,
  type LocalProgress,
} from "@/lib/local-progress";

/**
 * Subscribe to the `orv-reader-progress` localStorage blob.
 *
 * `useSyncExternalStore` requires `getSnapshot` to return a *stable*
 * reference between notifications (otherwise React re-renders every
 * tick because `Object.is(prev, next)` is false). We cache the latest
 * parsed snapshot and only recompute when the raw localStorage string
 * changes — effectively treating the storage key as the version.
 */

let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: LocalProgress = EMPTY_PROGRESS;

function readRaw(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(LOCAL_PROGRESS_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): LocalProgress {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = readLocalProgress();
  return cachedSnapshot;
}

function getServerSnapshot(): LocalProgress {
  return EMPTY_PROGRESS;
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => {
    // Force the snapshot cache to re-hydrate on next read by clearing
    // the version key; React will call getSnapshot immediately after.
    cachedRaw = undefined;
    onStoreChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCAL_PROGRESS_KEY) {
      cachedRaw = undefined;
      onStoreChange();
    }
  };
  window.addEventListener(LOCAL_PROGRESS_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LOCAL_PROGRESS_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocalProgress(): LocalProgress {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
