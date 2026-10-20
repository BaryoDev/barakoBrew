/**
 * Storage settings as `/api/settings/storage` describes them, read off
 * `BarakoCMS.Files/Features/StorageSettings/Endpoints.cs`.
 *
 * The secret key is write-only. The response says only whether one is stored, so nothing here can
 * hold it on the way back.
 */
export type StorageProvider = 'postgres' | 's3';

export interface S3SettingsResponse {
    bucket: string;
    region: string;
    serviceUrl?: string | null;
    publicBaseUrl?: string | null;
    usePublicReadAcl: boolean;
    forcePathStyle: boolean;
    accessKey: string;
    secretSet: boolean;
    /** A secret is stored but cannot be decrypted, so it has to be sent again. */
    secretUnreadable?: boolean;
}

export interface StorageSettings {
    provider: string;
    s3?: S3SettingsResponse | null;
    /** Where new uploads go right now. */
    activeProvider: string;
    /** Configuration sets storage, so a save is refused. */
    readOnly: boolean;
    /** The `Files:S3` keys set in configuration. */
    environmentKeys: string[];
    availableProviders: string[];
    updatedAt?: string | null;
    updatedBy?: string | null;
}

export interface S3SettingsRequest {
    bucket: string;
    region: string;
    serviceUrl?: string | null;
    publicBaseUrl?: string | null;
    usePublicReadAcl: boolean;
    forcePathStyle: boolean;
    accessKey: string;
    /** Null keeps the stored secret, empty clears it, anything else replaces it. */
    secretKey: string | null;
}

export interface StorageSettingsRequest {
    provider: StorageProvider;
    s3?: S3SettingsRequest;
}

export interface StorageTestResult {
    ok: boolean;
    /** The step that failed: `put`, `get` or `delete`. Null when it worked. */
    step?: string | null;
    /** The provider's error code, such as `NoSuchBucket`. */
    errorCode?: string | null;
    message: string;
}
