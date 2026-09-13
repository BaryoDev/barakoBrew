/**
 * The rules `POST /api/files` enforces, copied from the upload endpoint in BarakoCMS.Files.
 *
 * A copy, not a read: no endpoint reports them, so they can drift. They are worth checking here
 * anyway, because a ten megabyte upload refused after it finishes is time the person does not get
 * back. The server still decides; a file this passes can still be refused there.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** SVG is left out on purpose by the API: it is XML that can carry script. */
export const ALLOWED_UPLOAD_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'application/pdf',
] as const;

export const UPLOAD_RULES = 'PNG, JPEG, GIF, WebP, AVIF or PDF, up to 10 MB. SVG is not accepted.';

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why the API would refuse this file, or null when it would accept it. */
export function uploadProblem(file: { size: number; type: string }): string | null {
    if (file.size === 0) return 'This file is empty.';
    if (file.size > MAX_UPLOAD_BYTES) {
        return `This file is ${formatBytes(file.size)}. The limit is 10 MB.`;
    }
    // The server matches by prefix and ignores case, so `image/png; charset=binary` passes there too.
    const type = file.type.toLowerCase();
    if (!ALLOWED_UPLOAD_TYPES.some((allowed) => type.startsWith(allowed))) {
        return 'Only PNG, JPEG, GIF, WebP, AVIF and PDF files can be uploaded.';
    }
    return null;
}

/**
 * Whether the API would let this caller delete this file: an Admin or SuperAdmin, or whoever
 * uploaded it. Mirrors `FileOwnership.CanAccess`, which answers 403 to everyone else.
 */
export function canDeleteFile(
    user: { userId?: string; roles: readonly string[] } | null | undefined,
    file: { uploadedBy: string },
): boolean {
    if (!user) return false;
    if (user.roles.includes('SuperAdmin') || user.roles.includes('Admin')) return true;
    return !!user.userId && user.userId.toLowerCase() === file.uploadedBy.toLowerCase();
}

/**
 * The address anyone can open a public file at, or null for a private one.
 *
 * An object store gives a public file a direct URL. Postgres storage does not, and the file is
 * served through the API's anonymous route instead. A private file has no shareable address at all:
 * its download route needs a bearer token.
 */
export function publicFileLink(
    file: { id: string; isPublic: boolean; publicUrl?: string | null },
    apiUrl: string,
): string | null {
    if (!file.isPublic) return null;
    if (file.publicUrl) return file.publicUrl;
    return `${apiUrl.replace(/\/+$/, '')}/api/public/files/${file.id}`;
}
