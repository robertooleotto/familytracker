/**
 * Document storage helper — wraps Supabase Storage for the `family-documents`
 * bucket.
 *
 * Path convention: every object key is prefixed with the family ID, so the
 * RLS policies on `storage.objects` (see migration 0007_documents_storage_bucket)
 * can use `is_in_family((storage.foldername(name))[1])` to enforce that a user
 * can only see / upload / delete files belonging to their own family.
 *
 *   <family_id>/<yyyy>/<mm>/<uuid>-<sanitized_name>
 *
 * The legacy schema still has `documents.fileData` (base64) for old rows; new
 * uploads always use `objectPath`.
 */

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../auth/supabase";

export const DOCUMENTS_BUCKET = "family-documents";

const SIGNED_URL_TTL_SECONDS = 60 * 5; // 5 minutes is enough for a single upload/download

function sanitizeFilename(name: string): string {
  // Remove path separators and trim weird whitespace; keep extension intact.
  return name
    .replace(/[\\/]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

export function buildObjectPath(familyId: string, originalName: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uuid = randomUUID();
  return `${familyId}/${yyyy}/${mm}/${uuid}-${sanitizeFilename(originalName)}`;
}

/**
 * Generate a short-lived signed URL the browser can PUT a file to.
 * Returns both the path (to persist on the documents row) and the URL to upload to.
 */
export async function createUploadUrl(params: {
  familyId: string;
  fileName: string;
  contentType: string;
}): Promise<{ objectPath: string; signedUrl: string; token: string }> {
  const admin = await getSupabaseAdmin();
  const objectPath = buildObjectPath(params.familyId, params.fileName);

  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (error || !data) {
    throw new Error(`[documentStorage] createSignedUploadUrl failed: ${error?.message ?? "unknown"}`);
  }

  return { objectPath, signedUrl: data.signedUrl, token: data.token };
}

/**
 * Generate a short-lived signed download URL for an existing object.
 */
export async function createDownloadUrl(objectPath: string): Promise<string> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    throw new Error(`[documentStorage] createSignedUrl failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/**
 * Permanently remove an object from storage. Idempotent: missing files are not
 * an error (Supabase returns success for non-existent paths).
 */
export async function deleteObject(objectPath: string): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { error } = await admin.storage.from(DOCUMENTS_BUCKET).remove([objectPath]);
  if (error) {
    throw new Error(`[documentStorage] remove failed: ${error.message}`);
  }
}

/**
 * Server-side guard: verify the object key starts with the expected family ID.
 * RLS already enforces this on the database side, but doing it here means we
 * fail fast with a clear 403 instead of leaking 500s.
 */
export function pathBelongsToFamily(objectPath: string, familyId: string): boolean {
  return objectPath.startsWith(`${familyId}/`);
}
