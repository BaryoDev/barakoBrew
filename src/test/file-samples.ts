/**
 * The first bytes of one file per type the API accepts, as the formats write them. The upload check
 * reads only the start of a file, so a signature and a little tail is a valid sample.
 */
const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

export const SAMPLES: ReadonlyArray<readonly [string, Uint8Array]> = [
    ['image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, ...ascii('IHDR')])],
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii('JFIF'), 0])],
    ['image/gif', new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0])],
    ['image/webp', new Uint8Array([...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBPVP8 ')])],
    // libavif's header: an ftyp box with major brand avif.
    ['image/avif', new Uint8Array([0, 0, 0, 0x20, ...ascii('ftypavif'), 0, 0, 0, 0, ...ascii('avifmif1miafMA1B')])],
    ['application/pdf', new Uint8Array(ascii('%PDF-1.4\n%%EOF\n'))],
];

/** A File with these bytes and this declared type. */
export function sample(name: string, type: string, bytes: Uint8Array): File {
    return new File([bytes as BlobPart], name, { type });
}

/** A File of an allowed type whose bytes start the way that format does. */
export function validFile(name: string, type: string): File {
    const found = SAMPLES.find(([t]) => t === type);
    if (!found) throw new Error(`no sample for ${type}`);
    return sample(name, type, found[1]);
}
