/**
 * Opaque per-browser id for optional server-side audit (not a security boundary).
 * MAC addresses are not available on the web; this + IP hash is the practical substitute.
 */
const STORAGE_KEY = "orv-device-id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}
