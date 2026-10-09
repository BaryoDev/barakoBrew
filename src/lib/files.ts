import { accessFrom, type Access } from '@/lib/access';

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
    if (allowedType(file.type) === null) {
        return 'Only PNG, JPEG, GIF, WebP, AVIF and PDF files can be uploaded.';
    }
    return null;
}

type AllowedType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/**
 * The bare media type when it is exactly one the API allows, or null. Like the server, parameters
 * such as a charset are dropped and case is ignored, and the rest is compared whole: `image/pngx`
 * is not `image/png`.
 */
function allowedType(declared: string): AllowedType | null {
    const bare = declared.split(';')[0].trim().toLowerCase();
    return (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(bare) ? (bare as AllowedType) : null;
}

/** How many leading bytes the checks need. The same number the server reads. */
const HEAD_LENGTH = 64;

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

const startsWith = (head: Uint8Array, prefix: readonly number[], at = 0) =>
    head.length >= at + prefix.length && prefix.every((byte, i) => head[at + i] === byte);

/** An ISO-BMFF `ftyp` box whose major or a compatible brand is `avif` or `avis`. */
function isAvif(head: Uint8Array): boolean {
    if (head.length < 16 || !startsWith(head, ascii('ftyp'), 4)) return false;
    const boxSize = Math.min(((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0, head.length);
    for (let offset = 8; offset + 4 <= boxSize; offset += 4) {
        if (offset === 12) continue; // the minor version, not a brand
        if (startsWith(head, ascii('avif'), offset) || startsWith(head, ascii('avis'), offset)) return true;
    }
    return false;
}

/** The signature checks the upload endpoint runs (`UploadTypes` in BarakoCMS.Files), and what to call each format. */
const FORMATS: Record<AllowedType, { name: string; matches: (head: Uint8Array) => boolean }> = {
    'image/png': { name: 'a PNG image', matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    'image/jpeg': { name: 'a JPEG image', matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
    'image/gif': { name: 'a GIF image', matches: (h) => startsWith(h, ascii('GIF87a')) || startsWith(h, ascii('GIF89a')) },
    'image/webp': { name: 'a WebP image', matches: (h) => startsWith(h, ascii('RIFF')) && startsWith(h, ascii('WEBP'), 8) },
    'image/avif': { name: 'an AVIF image', matches: isAvif },
    'application/pdf': { name: 'a PDF', matches: (h) => startsWith(h, ascii('%PDF-')) },
};

/**
 * Whether the file starts the way its declared type does, which the API checks too. Null when it
 * does, or when the type is not one this knows (uploadProblem says so). Reads only the first bytes.
 */
export async function contentProblem(file: Blob): Promise<string | null> {
    const type = allowedType(file.type);
    if (type === null) return null;
    const head = new Uint8Array(await file.slice(0, HEAD_LENGTH).arrayBuffer());
    const format = FORMATS[type];
    return format.matches(head) ? null : `This file's contents are not ${format.name}.`;
}

/**
 * Whether the API would let this caller delete this file: a caller holding `manage_all_files`, or
 * whoever uploaded it. Mirrors `FileAccessRule`, which answers 403 to everyone else. Without
 * `access`, or against an API that does not report capabilities, Admin and SuperAdmin by name stand
 * in for the capability, which is who the Files module seeds it to.
 */
export function canDeleteFile(
    user: { userId?: string; roles: readonly string[] } | null | undefined,
    file: { uploadedBy: string },
    access: Pick<Access, 'can'> = accessFrom(null, user?.roles),
): boolean {
    if (!user) return false;
    if (access.can('manage_all_files', ['SuperAdmin', 'Admin'])) return true;
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
