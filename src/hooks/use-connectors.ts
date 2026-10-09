'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { readsAsCredential } from '@/lib/credential-names';

/**
 * A connector as `GET /api/connectors` returns it.
 *
 * What the response contains, read off `ConnectorResponse` in
 * `barakoCMS/Features/Connectors/Models.cs`: id, name, slug, baseUrl, auth, settings, secretKeys,
 * enabled, probePath, lastTestedAt, lastTestResult, createdAt, updatedAt. There is no field that
 * can hold a credential. The values live in a separate `ConnectorSecret` document, encrypted, and
 * the read path never joins them, so `secretKeys` is the NAMES of the credentials held and nothing
 * else. No endpoint returns a stored value, including `GET /api/connectors/{slug}`.
 *
 * That is why this screen has no masked field to round-trip. There is nothing to mask: the form
 * starts blank every time, and a blank box means "leave the stored credential alone" rather than
 * "set it to blank". See `toSecretsPayload`.
 */
export interface Connector {
    id: string;
    name: string;
    slug: string;
    /** The enum name as the server serialises it, so a mode this build predates arrives as its text. */
    auth: string;
    baseUrl: string;
    settings: Record<string, string>;
    /** Names only, never values. */
    secretKeys: string[];
    enabled: boolean;
    probePath: string;
    lastTestedAt: string | null;
    /** Prose the server wrote, "HTTP 200 in 34 ms". Never a response body. */
    lastTestResult: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SaveConnectorInput {
    name: string;
    slug: string;
    baseUrl: string;
    auth: string;
    settings: Record<string, string>;
    enabled: boolean;
    probePath: string;
    /**
     * Credentials to store, keyed by name. Write only.
     *
     * Absent means "change nothing". A key with an empty value deletes that credential. Build it
     * with `toSecretsPayload` rather than by hand.
     */
    secrets?: Record<string, string>;
}

export interface TestConnectorResult {
    succeeded: boolean;
    statusCode: number | null;
    elapsedMs: number;
    error: string | null;
}

/** One non-secret setting an auth mode reads out of `settings`. */
export interface AuthSetting {
    key: string;
    label: string;
    placeholder?: string;
    /**
     * What the sender actually does when this setting is blank, in the operator's words.
     *
     * It is per setting because the two are not the same. `ConnectorSender.TryAttachAuthAsync`
     * returns early on a blank `HeaderName`, so that call never leaves the process. A blank
     * `Username` is not checked at all: the Basic arm reads it with `GetValueOrDefault(...) ??
     * string.Empty` and sends `Authorization: Basic base64(":password")`, so the provider answers
     * 401 and the operator is owed a message that says so rather than one that sends them looking
     * for a refusal on this side.
     *
     * Written for the case where the credential is stored and only this setting is blank. `configGap`
     * checks the credential first, so this text is never shown while the credential is missing too.
     */
    whenMissing: string;
    /** Sent only when set. A blank optional setting is not a gap. */
    optional?: boolean;
}

export interface AuthMode {
    value: string;
    label: string;
    description: string;
    /** The credential name the sender looks for, or null when the mode needs none. */
    secretKey: string | null;
    settings: AuthSetting[];
    /** Set when the backend refuses this mode outright, so the form can say so before a save. */
    unsupported?: string;
}

/**
 * The modes, their credential names and their settings, copied from `ConnectorSecretKeys`,
 * `ConnectorSettingKeys` and `ConnectorSender.TryAttachAuthAsync`.
 *
 * The names have to match exactly. The sender asks for a secret by key ("Token"), so storing a
 * bearer token under any other name gives a connector that looks configured, passes a save, and
 * fails every call with "no Token secret is stored".
 */
export const CONNECTOR_AUTH_MODES: AuthMode[] = [
    {
        value: 'None',
        label: 'None',
        description: 'No credential is attached. For a public endpoint.',
        secretKey: null,
        settings: [],
    },
    {
        value: 'BearerToken',
        label: 'Bearer token',
        description: 'Sent as Authorization: Bearer.',
        secretKey: 'Token',
        settings: [],
    },
    {
        value: 'Basic',
        label: 'Basic',
        description: 'The username is configuration, the password is a credential.',
        secretKey: 'Password',
        settings: [
            {
                key: 'Username',
                label: 'Username',
                placeholder: 'reporting-bot',
                whenMissing:
                    'Username is not set, so this connector authenticates as an empty username. The call is still sent, and the provider answers it.',
            },
        ],
    },
    {
        value: 'ApiKeyHeader',
        label: 'API key header',
        description: 'The key is sent as the header you name.',
        secretKey: 'ApiKey',
        settings: [
            {
                key: 'HeaderName',
                label: 'Header name',
                placeholder: 'X-Api-Key',
                whenMissing:
                    'HeaderName is not set, so a call through this connector is refused before it is sent.',
            },
        ],
    },
    {
        value: 'OAuth2ClientCredentials',
        label: 'OAuth2 client credentials',
        description:
            'Before each call the API asks the token URL for a token with the client id and secret, and sends it as Authorization: Bearer. Needs barakoCMS 4.6 or later; an older API refuses this mode at send time.',
        secretKey: 'ClientSecret',
        settings: [
            {
                key: 'TokenUrl',
                label: 'Token URL',
                placeholder: 'https://identity.example.com/connect/token',
                whenMissing: 'TokenUrl is not set, so a call through this connector is refused before it is sent.',
            },
            {
                key: 'ClientId',
                label: 'Client id',
                placeholder: 'the-client-id',
                whenMissing: 'ClientId is not set, so the token request has no client to name and is refused.',
            },
            {
                key: 'Scope',
                label: 'Scope (optional)',
                placeholder: 'invoices.read invoices.write',
                whenMissing: '',
                optional: true,
            },
        ],
    },
];

export function authModeFor(auth: string): AuthMode | undefined {
    return CONNECTOR_AUTH_MODES.find((mode) => mode.value === auth);
}

/**
 * Turns a name into a slug the server will accept.
 *
 * `ConnectorRules.Check` wants `^[a-z0-9][a-z0-9-]{0,62}$`, and the slug cannot be changed after a
 * create: `UpdateConnectorEndpoint` overwrites whatever is sent with the stored one, because a
 * request definition references a connector by slug and a rename would break those silently.
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 63)
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

/**
 * The `secrets` half of a save, built from what the operator actually typed.
 *
 * This is the write-only rule in one function, so read `SaveConnectorRequest` next to it. In
 * `UpdateConnectorEndpoint` an ABSENT key leaves the stored credential alone and a key with an
 * EMPTY value deletes it. Those have to mean different things because the API never returns a
 * stored value: the box always renders blank, so if blank meant "delete" then correcting a base URL
 * would wipe the token.
 *
 * So a blank box is omitted, and clearing a credential is a separate deliberate act that arrives
 * here through `cleared`. The only values that leave this function are ones typed this session,
 * which is what makes it impossible to post a placeholder back as if it were the credential.
 *
 * Returns undefined when nothing changed, so `secrets` is left off the request body entirely.
 */
export function toSecretsPayload(
    typed: Readonly<Record<string, string>>,
    cleared: readonly string[] = [],
): Record<string, string> | undefined {
    const payload: Record<string, string> = {};

    for (const [key, value] of Object.entries(typed)) {
        // Trimmed, and a value that is only whitespace counts as untouched rather than as a delete.
        // A pasted token routinely carries a trailing newline, and no provider issues a credential
        // whose value depends on the space around it.
        const trimmed = value.trim();
        if (trimmed.length > 0) payload[key] = trimmed;
    }

    // A typed value wins: asking to clear and then typing a replacement is a replacement.
    for (const key of cleared) {
        if (!(key in payload)) payload[key] = '';
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
}

/** The credential names a connector stores encrypted (`ConnectorSecretKeys.All`). */
export const CONNECTOR_SECRET_KEYS = ['Token', 'Password', 'ApiKey', 'ClientSecret'] as const;

/**
 * The setting names the auth modes read, which the API takes whatever their words, so `TokenUrl` is
 * a setting and not a credential. Compared exactly, as the API's own list is.
 */
const KNOWN_SETTING_KEYS: ReadonlySet<string> = new Set([
    'Username', 'HeaderName', 'TokenUrl', 'ClientId', 'Scope', 'Audience', 'ClientAuth', 'IdempotencyHeader',
]);

/**
 * The stored settings whose names read as a credential, which barakoCMS 4.7 refuses on a save.
 *
 * A connector saved before 4.7 can hold one, and the screen sends the settings back whole, so it
 * could not be saved at all until the setting goes. Settings are stored and returned as plain text;
 * a credential belongs in the secrets, which are encrypted and never returned.
 */
export function credentialNamedSettings(
    settings: Readonly<Record<string, string>> | undefined,
    parts?: readonly string[],
): string[] {
    return Object.keys(settings ?? {}).filter((key) => !KNOWN_SETTING_KEYS.has(key) && readsAsCredential(key, parts));
}

export type ProbeOutcome = 'untested' | 'succeeded' | 'failed';

/**
 * Whether the last probe worked, read back out of the only thing the server stores about it.
 *
 * `TestConnectorResponse.Succeeded` is the answer to the test call and is not persisted:
 * `Connector.LastTestResult` holds `ConnectorCallResult.Describe()`, which is "HTTP 200 in 34 ms"
 * when a response came back at all and "The request timed out. after 2000 ms" when it did not.
 *
 * Success is 200 to 299, matching `HttpResponseMessage.IsSuccessStatusCode`, which is what the
 * server itself used to decide `Succeeded`. A 302 or a 404 is a failed probe here as it is there,
 * which is the point of `probePath` being configurable.
 */
export function probeOutcome(connector: Pick<Connector, 'lastTestResult'>): ProbeOutcome {
    const result = connector.lastTestResult;
    if (!result || result.trim().length === 0) return 'untested';

    const match = /^HTTP (\d{3}) in /.exec(result);
    if (!match) return 'failed';

    const status = Number(match[1]);
    return status >= 200 && status < 300 ? 'succeeded' : 'failed';
}

/**
 * What is wrong with this connector's configuration, in the operator's words, or null.
 *
 * Read off `ConnectorSender.TryAttachAuthAsync` so an operator sees it on the screen instead of
 * discovering it in the first workflow run. Not every gap is a refusal, and the message says which
 * it is: a missing secret and a missing `HeaderName` stop the call on this side, while a missing
 * `Username` does not, because the Basic arm defaults it to empty and sends the request anyway.
 * It is a hint, not a gate: the server decides, and an auth mode this build does not recognise is
 * left alone rather than reported as broken.
 *
 * The credential is checked before the settings. A missing credential is a refusal in every mode,
 * so it is the message that stays true whatever else is blank. A fresh Basic connector has neither
 * a Username nor a Password, and the Username message says the call is still sent, which it is
 * not until the Password exists.
 */
export function configGap(
    connector: Pick<Connector, 'auth' | 'settings' | 'secretKeys'>,
): string | null {
    const mode = authModeFor(connector.auth);
    if (!mode) return null;
    if (mode.unsupported) return mode.unsupported;

    if (mode.secretKey && !connector.secretKeys.includes(mode.secretKey)) {
        return `No ${mode.secretKey} is stored, so a call through this connector is refused before it is sent.`;
    }

    for (const setting of mode.settings) {
        if (setting.optional) continue;
        const value = connector.settings?.[setting.key];
        if (!value || value.trim().length === 0) {
            return setting.whenMissing;
        }
    }

    return null;
}

const QUERY_KEY = ['connectors'];

/** Rows per page on the connectors screen. The server caps a page at 100 and this stays under it. */
export const CONNECTORS_PAGE_SIZE = 25;

/**
 * One page of connectors, in name order.
 *
 * `GET /api/connectors` is paged like every list endpoint, so the screen asks for a page and
 * renders the controls rather than reading the first hundred and calling that the list. The page
 * number is part of the key, and the mutations invalidate the `['connectors']` prefix, so every
 * page refetches after a save.
 */
export function useConnectors(page: number) {
    const params = { page, pageSize: CONNECTORS_PAGE_SIZE };

    return useQuery({
        queryKey: [...QUERY_KEY, params],
        queryFn: async () =>
            (await api.get<Paginated<Connector>>('/api/connectors', { params })).data,
    });
}

export function useCreateConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: SaveConnectorInput) =>
            (await api.post<Connector>('/api/connectors', input)).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useUpdateConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: SaveConnectorInput) =>
            (
                await api.put<Connector>(
                    `/api/connectors/${encodeURIComponent(input.slug)}`,
                    input,
                )
            ).data,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useDeleteConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (slug: string) => {
            await api.delete(`/api/connectors/${encodeURIComponent(slug)}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

export function useTestConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (slug: string) =>
            (
                await api.post<TestConnectorResult>(
                    `/api/connectors/${encodeURIComponent(slug)}/test`,
                )
            ).data,
        // The probe writes LastTestedAt and LastTestResult, so the list is stale the moment this
        // returns and the column an operator came here to read would still show the old answer.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
}

/**
 * Whether this save would be refused for moving the token URL without the client secret.
 *
 * `PUT /api/connectors/{slug}` refuses a `TokenUrl` that is new or changed (the whole URL, path
 * included) unless `ClientSecret` is entered again or cleared in the same request, because the
 * secret is sent to that URL. Only an edit of a connector that holds a `ClientSecret` can trip it.
 */
export function tokenUrlNeedsSecret(input: {
    storedTokenUrl: string | undefined;
    tokenUrl: string | undefined;
    secretStored: boolean;
    secretTyped: boolean;
    secretCleared: boolean;
}): boolean {
    if (!input.secretStored || input.secretTyped || input.secretCleared) return false;
    const next = (input.tokenUrl ?? '').trim();
    // Removing the token URL is not refused: the secret then goes nowhere.
    return next.length > 0 && next !== (input.storedTokenUrl ?? '').trim();
}
