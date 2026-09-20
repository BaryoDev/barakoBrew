import { describe, expect, it, vi } from 'vitest';
import { MAX_CONCURRENT_UPLOADS, UploadQueue, type UploadRequest } from './upload-queue';

function fileOf(name: string, size = 1024): File {
    const file = new File(['x'], name, { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: size });
    return file;
}

function request(name: string, isPublic = false): UploadRequest {
    return { file: fileOf(name), isPublic };
}

/** A send that hands back the controls for each call, so a test decides when an upload finishes. */
function controllable() {
    const calls: {
        name: string;
        progress: (fraction: number) => void;
        resolve: () => void;
        reject: (reason: Error) => void;
    }[] = [];
    const send = vi.fn((sent: UploadRequest, onProgress: (fraction: number) => void) => {
        return new Promise<void>((resolve, reject) => {
            calls.push({ name: sent.file.name, progress: onProgress, resolve: () => resolve(), reject });
        });
    });
    return { send, calls };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

describe('the upload queue', () => {
    it('uploads two at a time and starts the third only when one finishes', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);

        queue.add([request('one.png'), request('two.png'), request('three.png')]);

        expect(calls.map((call) => call.name)).toEqual(['one.png', 'two.png']);
        expect(MAX_CONCURRENT_UPLOADS).toBe(2);
        expect(queue.getSnapshot().map((job) => job.status)).toEqual(['uploading', 'uploading', 'queued']);

        calls[0].resolve();
        await settle();

        expect(calls.map((call) => call.name)).toEqual(['one.png', 'two.png', 'three.png']);
        expect(queue.getSnapshot().map((job) => job.status)).toEqual(['done', 'uploading', 'uploading']);
    });

    it('reports how far an upload has got', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);
        queue.add([request('one.png')]);

        expect(calls).toHaveLength(1);
        calls[0].progress(0.25);
        expect(queue.getSnapshot()[0].progress).toBe(0.25);

        calls[0].progress(0.75);
        expect(queue.getSnapshot()[0].progress).toBe(0.75);

        calls[0].resolve();
        await settle();
        expect(queue.getSnapshot()[0]).toMatchObject({ status: 'done', progress: 1 });
    });

    it('keeps the reason a refused upload gave, and sends it again on retry', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);
        queue.add([request('big.png')]);

        expect(calls).toHaveLength(1);
        calls[0].reject(new Error('This file is 12.0 MB. The limit is 10 MB.'));
        await settle();

        const failed = queue.getSnapshot();
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({
            status: 'failed',
            error: 'This file is 12.0 MB. The limit is 10 MB.',
        });

        queue.retry(failed[0].id);
        expect(calls).toHaveLength(2);
        expect(queue.getSnapshot()[0]).toMatchObject({ status: 'uploading', error: null });

        calls[1].resolve();
        await settle();
        expect(queue.getSnapshot()[0].status).toBe('done');
    });

    it('takes a failed row off the tray when it is dismissed, and leaves one in flight alone', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);
        queue.add([request('bad.png'), request('good.png')]);

        expect(calls).toHaveLength(2);
        calls[0].reject(new Error('refused'));
        await settle();

        const jobs = queue.getSnapshot();
        expect(jobs).toHaveLength(2);
        expect(jobs[0].status).toBe('failed');

        queue.dismiss(jobs[1].id);
        expect(queue.getSnapshot()).toHaveLength(2);

        queue.dismiss(jobs[0].id);
        const left = queue.getSnapshot();
        expect(left).toHaveLength(1);
        expect(left[0].fileName).toBe('good.png');
    });

    it('tells the page whether anything would be lost by leaving', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);
        expect(queue.isBusy).toBe(false);

        queue.add([request('one.png')]);
        expect(queue.isBusy).toBe(true);

        calls[0].resolve();
        await settle();
        expect(queue.isBusy).toBe(false);
    });

    it('says a finished upload is public when it was sent that way', async () => {
        const { send, calls } = controllable();
        const uploaded = vi.fn();
        const queue = new UploadQueue(send, { onUploaded: uploaded });

        queue.add([request('cover.png', true)]);
        expect(calls).toHaveLength(1);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ isPublic: true }),
            expect.any(Function),
        );

        calls[0].resolve();
        await settle();
        expect(uploaded).toHaveBeenCalledTimes(1);
        expect(uploaded.mock.calls[0][0]).toMatchObject({ fileName: 'cover.png', status: 'done' });
    });

    it('tells every subscriber when a row changes, and stops when one unsubscribes', async () => {
        const { send, calls } = controllable();
        const queue = new UploadQueue(send);
        const seen = vi.fn();
        const unsubscribe = queue.subscribe(seen);

        queue.add([request('one.png')]);
        expect(seen.mock.calls.length).toBeGreaterThan(0);

        const before = seen.mock.calls.length;
        unsubscribe();
        calls[0].resolve();
        await settle();
        expect(seen.mock.calls.length).toBe(before);
    });
});
