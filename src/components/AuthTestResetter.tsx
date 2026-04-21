"use client";

import { useEffect } from "react";

/**
 * TESTING-ONLY: Clears the auth cookie on hard reload / tab close so the
 * `/auth` gate re-appears every full page load. Client-side SPA navigations
 * (Next `<Link>`) do not fire `pagehide`/`beforeunload`, so session browsing
 * stays intact within a single tab.
 *
 * When we switch to the permanent per-device/IP allowance, delete this
 * component and its mount in `src/app/layout.tsx`.
 */
export function AuthTestResetter() {
  useEffect(() => {
    const clearAuthCookie = () => {
      void fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    };

    window.addEventListener("pagehide", clearAuthCookie);
    window.addEventListener("beforeunload", clearAuthCookie);
    return () => {
      window.removeEventListener("pagehide", clearAuthCookie);
      window.removeEventListener("beforeunload", clearAuthCookie);
    };
  }, []);

  return null;
}
