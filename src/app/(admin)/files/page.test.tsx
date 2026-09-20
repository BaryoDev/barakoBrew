import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import type { StoredFile } from '@/hooks/use-files';
import { MAX_UPLOAD_BYTES } from '@/lib/files';

vi.mock('@/lib/api', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
    return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const session = vi.hoisted(() => ({
    user: { userId: '', username: '', roles: [] as string[] },
}));

vi.mock('@/hooks/use-auth', () => ({
    useAuth: () => ({ user: session.user, isAuthenticated: true, isLoading: false, logout: vi.fn(), requireAuth: vi.fn() }),
}));

// Radix sizes its dialogs with one, and jsdom ships no implementation.
globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// jsdom has no object URLs either, and the preview and the viewer both live on them.
const objectUrls = { created: [] as Blob[], revoked: [] as string[] };
URL.createObjectURL = vi.fn((blob: Blob) => {
    objectUrls.created.push(blob);
    return `blob:mock/${objectUrls.created.length}`;
});
URL.revokeObjectURL = vi.fn((url: string) => {
    objectUrls.revoked.push(url);
});

const { toast } = await import('sonner');
const { api } = await import('@/lib/api');
const { UploadsProvider } = await import('@/components/uploads-provider');
const { UploadTray } = await import('@/components/upload-tray');
const { default: FilesPage } = await import('./page');

const ME = '00000000-0000-0000-0000-00000000000a';
const SOMEONE_ELSE = '00000000-0000-0000-0000-00000000000b';

function file(overrides: Partial<StoredFile>): StoredFile {
    return {
        id: 'f1',
        fileName: 'cover.png',
        contentType: 'image/png',
        size: 2048,
        isPublic: true,
        publicUrl: null,
        alt: null,
        caption: null,
        uploadedBy: ME,
        createdAt: '2026-09-01T10:00:00Z',
        ...overrides,
    };
}

const MINE_PUBLIC = file({ id: 'f1', fileName: 'cover.png' });
const THEIRS_PRIVATE = file({
    id: 'f2',
    fileName: 'bylaws.pdf',
    contentType: 'application/pdf',
    size: 3 * 1024 * 1024,
    isPublic: false,
    uploadedBy: SOMEONE_ELSE,
});

function pageOf(items: StoredFile[], totalItems = items.length, page = 1) {
    const totalPages = Math.ceil(totalItems / 20);
    return {
        items,
        page,
        pageSize: 20,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    };
}

function httpError(status: number, data: unknown) {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
        status,
        data,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
    });
}

/** The screen and the tray together, which is how the layout mounts them. */
function renderPage() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <UploadsProvider>
                <FilesPage />
                <UploadTray />
            </UploadsProvider>
        </QueryClientProvider>
    );
}

beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    session.user = { userId: ME, username: 'rosa', roles: ['Editor'] };
    objectUrls.created = [];
    objectUrls.revoked = [];
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
});

describe('the files list', () => {
    it('shows each file with its name, type, size, visibility and upload date', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC, THEIRS_PRIVATE]) });
        renderPage();

        await screen.findByText('cover.png');
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);

        const first = within(rows[0]);
        expect(first.getByText('image/png')).toBeInTheDocument();
        expect(first.getByText('2.0 KB')).toBeInTheDocument();
        expect(first.getByText('Public')).toBeInTheDocument();
        expect(first.getByText('1 Sep 2026')).toBeInTheDocument();

        const second = within(rows[1]);
        expect(second.getByText('bylaws.pdf')).toBeInTheDocument();
        expect(second.getByText('3.0 MB')).toBeInTheDocument();
        expect(second.getByText('Private')).toBeInTheDocument();
    });

    it('asks for twenty at a time and moves to the next page', async () => {
        vi.mocked(api.get).mockImplementation(async (_url, config) => {
            const page = (config?.params as { page: number }).page;
            return { data: pageOf([file({ id: `p${page}`, fileName: `page-${page}.png` })], 45, page) };
        });
        renderPage();

        await screen.findByText('page-1.png');
        expect(api.get).toHaveBeenCalledWith('/api/files', { params: { page: 1, pageSize: 20 } });

        fireEvent.click(screen.getByRole('button', { name: /Next/ }));

        await screen.findByText('page-2.png');
        expect(api.get).toHaveBeenCalledWith('/api/files', { params: { page: 2, pageSize: 20 } });
    });

    it('says the account cannot manage files on a 403, and offers no upload', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(403, {}));
        renderPage();

        await screen.findByText('Your account cannot manage files');
        expect(screen.queryByRole('button', { name: /Upload file/ })).not.toBeInTheDocument();
        // Not the generic failure, which tells the reader to check their connection.
        expect(screen.queryByText(/Couldn.t load files/)).not.toBeInTheDocument();
    });

    it('shows the retry state, not the access message, when the list fails for another reason', async () => {
        vi.mocked(api.get).mockRejectedValue(httpError(500, {}));
        renderPage();

        await screen.findByText(/Couldn.t load files/);
        expect(screen.queryByText('Your account cannot manage files')).not.toBeInTheDocument();
    });
});

describe('who sees which control', () => {
    it('offers delete only on files this account uploaded when it holds no admin role', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC, THEIRS_PRIVATE]) });
        renderPage();

        await screen.findByText('cover.png');
        expect(screen.getByRole('button', { name: 'Delete cover.png' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete bylaws.pdf' })).not.toBeInTheDocument();
    });

    it('offers delete on every file to an Admin', async () => {
        session.user = { userId: SOMEONE_ELSE.replace('b', 'c'), username: 'ana', roles: ['Admin'] };
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC, THEIRS_PRIVATE]) });
        renderPage();

        await screen.findByText('cover.png');
        expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(2);
    });

    it('offers a copy link only for a public file', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC, THEIRS_PRIVATE]) });
        renderPage();

        await screen.findByText('cover.png');
        expect(screen.getAllByRole('button', { name: /^Copy link to / })).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Copy link to cover.png' })).toBeInTheDocument();
    });
});

async function openUpload() {
    vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC]) });
    renderPage();
    await screen.findByText('cover.png');
    fireEvent.click(screen.getByRole('button', { name: /Upload file/ }));
    return screen.findByLabelText('Choose a file');
}

function choose(input: HTMLElement, chosen: File) {
    fireEvent.change(input, { target: { files: [chosen] } });
}

describe('uploading', () => {
    it('states the size and type rules before a file is chosen', async () => {
        await openUpload();
        expect(screen.getByText(/PNG, JPEG, GIF, WebP, AVIF or PDF, up to 10 MB/)).toBeInTheDocument();
    });

    it('refuses a file over 10 MB without sending it', async () => {
        const input = await openUpload();
        const big = new File(['x'], 'huge.png', { type: 'image/png' });
        Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
        choose(input, big);

        expect(await screen.findByRole('alert')).toHaveTextContent('The limit is 10 MB.');
        expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('refuses an SVG without sending it', async () => {
        const input = await openUpload();
        choose(input, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Only PNG, JPEG, GIF, WebP, AVIF and PDF');
        expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    });

    it('shows the reason the server gave in the tray, with a way to retry it', async () => {
        vi.mocked(api.post).mockRejectedValue(
            httpError(422, {
                status: 422,
                errors: [{ name: 'generalErrors', reason: 'This file was refused by the virus scanner (Eicar-Test-Signature).' }],
            })
        );
        const input = await openUpload();
        choose(input, new File(['x'], 'photo.png', { type: 'image/png' }));
        fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

        const tray = await screen.findByRole('region', { name: 'Uploads' });
        expect(await within(tray).findByRole('alert')).toHaveTextContent(
            'This file was refused by the virus scanner (Eicar-Test-Signature).'
        );
        expect(api.post).toHaveBeenCalledTimes(1);

        fireEvent.click(within(tray).getByRole('button', { name: 'Dismiss photo.png' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument());
    });
});

describe('deleting', () => {
    it('names the entries that use a file and deletes only when told to anyway', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC]) });
        vi.mocked(api.delete)
            .mockRejectedValueOnce(
                httpError(409, {
                    message: 'This file is used by 3 entries. Delete with ?force=true to remove it anyway.',
                    total: 3,
                    usages: [
                        { id: 'c1', contentType: 'article', title: 'Spring roast notes', status: 'Published' },
                        { id: 'c2', contentType: 'article', title: null, status: 'Draft' },
                    ],
                })
            )
            .mockResolvedValueOnce({ data: undefined });
        renderPage();

        await screen.findByText('cover.png');
        fireEvent.click(screen.getByRole('button', { name: 'Delete cover.png' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

        const dialog = await screen.findByRole('alertdialog');
        await within(dialog).findByText('This file is still in use');
        expect(within(dialog).getByText('Spring roast notes')).toBeInTheDocument();
        expect(within(dialog).getByText('Untitled entry')).toBeInTheDocument();
        expect(within(dialog).getByText('and 1 more')).toBeInTheDocument();
        expect(api.delete).toHaveBeenCalledTimes(1);
        expect(api.delete).toHaveBeenLastCalledWith('/api/files/f1', { params: undefined });

        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete anyway' }));

        await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(2));
        expect(api.delete).toHaveBeenLastCalledWith('/api/files/f1', { params: { force: true } });
    });
});

describe('previewing before upload', () => {
    it('shows the chosen image, and releases its object URL when the dialog closes', async () => {
        const input = await openUpload();
        choose(input, new File(['x'], 'photo.png', { type: 'image/png' }));

        const preview = await screen.findByRole('img', { name: 'Preview of photo.png' });
        expect(preview).toHaveAttribute('src', 'blob:mock/1');
        expect(objectUrls.created).toHaveLength(1);
        expect(objectUrls.revoked).toEqual([]);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await waitFor(() => expect(objectUrls.revoked).toEqual(['blob:mock/1']));
    });

    it('releases the first preview when a second file is chosen', async () => {
        const input = await openUpload();
        choose(input, new File(['x'], 'photo.png', { type: 'image/png' }));
        await screen.findByRole('img', { name: 'Preview of photo.png' });

        choose(input, new File(['y'], 'other.jpg', { type: 'image/jpeg' }));

        await waitFor(() => expect(objectUrls.revoked).toEqual(['blob:mock/1']));
        expect(await screen.findByRole('img', { name: 'Preview of other.jpg' })).toHaveAttribute(
            'src',
            'blob:mock/2',
        );
    });

    it('shows a PDF as its name and size, with no preview', async () => {
        const input = await openUpload();
        const pdf = new File(['x'], 'bylaws.pdf', { type: 'application/pdf' });
        Object.defineProperty(pdf, 'size', { value: 2048 });
        choose(input, pdf);

        expect(await screen.findByText('bylaws.pdf, 2.0 KB')).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: /^Preview of / })).not.toBeInTheDocument();
        expect(objectUrls.created).toHaveLength(0);
    });
});

describe('viewing an uploaded image', () => {
    it('opens the viewer on the variant that covers the screen, not the original', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC, THEIRS_PRIVATE]) });
        renderPage();

        await screen.findByText('cover.png');
        const viewButtons = screen.getAllByRole('button', { name: /^View / });
        expect(viewButtons).toHaveLength(1);
        expect(viewButtons[0]).toHaveAccessibleName('View cover.png');

        fireEvent.click(viewButtons[0]);

        const dialog = await screen.findByRole('dialog');
        // jsdom reports a 1024px screen at 1x, and 1280 is the rung above it.
        expect(within(dialog).getByRole('presentation')).toHaveAttribute(
            'src',
            'http://localhost:5005/api/public/files/f1?w=1280',
        );
        expect(within(dialog).getByText(/image\/png, 2\.0 KB/)).toBeInTheDocument();
        expect(within(dialog).getByRole('link')).toHaveAttribute(
            'href',
            'http://localhost:5005/api/public/files/f1',
        );
    });

    it('reports the size of the copy on screen once it has loaded', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC]) });
        renderPage();

        await screen.findByText('cover.png');
        fireEvent.click(screen.getByRole('button', { name: 'View cover.png' }));

        const dialog = await screen.findByRole('dialog');
        const image = within(dialog).getByRole('presentation');
        Object.defineProperty(image, 'naturalWidth', { value: 1280 });
        Object.defineProperty(image, 'naturalHeight', { value: 720 });
        fireEvent.load(image);

        expect(await within(dialog).findByText(/shown at 1280 x 720/)).toBeInTheDocument();
    });
});

describe('uploading in the background', () => {
    it('closes the dialog on Upload and finishes the upload in the tray', async () => {
        let finish: ((value: { data: unknown }) => void) | undefined;
        vi.mocked(api.post).mockImplementation(
            () => new Promise((resolve) => { finish = resolve as (value: { data: unknown }) => void; })
        );

        const input = await openUpload();
        choose(input, new File(['x'], 'photo.png', { type: 'image/png' }));
        fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

        // The dialog is gone while the request is still out.
        await waitFor(() => expect(screen.queryByLabelText('Choose a file')).not.toBeInTheDocument());
        const tray = await screen.findByRole('region', { name: 'Uploads' });
        expect(within(tray).getByText('photo.png')).toBeInTheDocument();
        expect(api.post).toHaveBeenCalledTimes(1);

        const listCallsBefore = vi.mocked(api.get).mock.calls.length;
        await act(async () => {
            finish!({ data: { id: 'f9', fileName: 'photo.png', contentType: 'image/png', size: 1, isPublic: false, publicUrl: null } });
        });

        expect(within(tray).getByText('1 finished')).toBeInTheDocument();
        // The list catches up on its own, with no reload.
        await waitFor(() => expect(vi.mocked(api.get).mock.calls.length).toBeGreaterThan(listCallsBefore));
    });

    it('queues every file chosen at once, and says how many', async () => {
        vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
        const input = await openUpload();
        fireEvent.change(input, {
            target: {
                files: [
                    new File(['a'], 'one.png', { type: 'image/png' }),
                    new File(['b'], 'two.png', { type: 'image/png' }),
                    new File(['c'], 'three.png', { type: 'image/png' }),
                ],
            },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

        const tray = await screen.findByRole('region', { name: 'Uploads' });
        const rows = within(tray).getAllByRole('listitem');
        expect(rows).toHaveLength(3);
        expect(rows.map((row) => row.textContent)).toEqual([
            expect.stringContaining('one.png'),
            expect.stringContaining('two.png'),
            expect.stringContaining('three.png'),
        ]);

        // Two out, one waiting: the queue does not open three connections at once.
        expect(api.post).toHaveBeenCalledTimes(2);
        expect(within(tray).getByText('Waiting')).toBeInTheDocument();
    });

    it('refuses a dropped file the API would refuse, and queues the rest', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: pageOf([MINE_PUBLIC]) });
        vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
        renderPage();
        await screen.findByText('cover.png');

        const good = new File(['a'], 'good.png', { type: 'image/png' });
        const bad = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
        fireEvent.drop(screen.getByRole('heading', { name: 'Files' }), {
            dataTransfer: { types: ['Files'], files: [good, bad] },
        });

        const tray = await screen.findByRole('region', { name: 'Uploads' });
        const rows = within(tray).getAllByRole('listitem');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent('good.png');
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('logo.svg: Only PNG, JPEG, GIF, WebP, AVIF and PDF')
        );
    });
});
