/**
 * Convert an objectPath (e.g. /objects/uploads/<uuid>) to a URL
 * that can be loaded in an <img> tag via the authenticated API route.
 *
 * objectPath format: /objects/uploads/<uuid>
 * API route: GET /api/photos/<uuid>  (authenticated)
 *
 * For legacy base64 strings (not starting with /objects/) the value is
 * returned as a data: URI or raw base64 value as-is.
 */
export function photoSrcFromPath(objectPath: string | null | undefined): string | null {
  if (!objectPath) return null;
  if (objectPath.startsWith("/objects/uploads/")) {
    const uuid = objectPath.replace("/objects/uploads/", "");
    return `/api/photos/${uuid}`;
  }
  // Legacy base64 — return as data URI if it looks like raw base64
  if (objectPath.startsWith("data:") || objectPath.length > 200) {
    return objectPath.startsWith("data:") ? objectPath : `data:image/jpeg;base64,${objectPath}`;
  }
  return objectPath;
}

/**
 * Build fetch headers for authenticated photo requests.
 */
export function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}
