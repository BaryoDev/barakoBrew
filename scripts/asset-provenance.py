#!/usr/bin/env python3
"""Fail the build when an image carries provenance or identity metadata.

Vendored from https://github.com/arnelirobles/lean-agent-method (MIT), section 9. Kept as a
copy rather than a dependency because a check that can fail to install is a check that can
be skipped.

Agents that generate images embed a signed manifest naming the tool that made them.
Nothing that reads the text of a diff can see it. This walks every asset in a tree,
parses the container, and reports anything that is not image data.

    python3 asset-provenance.py .              # scan, exit 1 on a finding
    python3 asset-provenance.py . --strip      # remove the offending parts in place
    python3 asset-provenance.py . --quiet      # only print findings

Stripping filters chunks. It never re-encodes, so the compressed image stream stays
identical byte for byte and any hash you took of the pixels still means something.
Every strip is verified before the file is written back.

No dependencies. Python 3.8 or newer.
"""

import argparse
import os
import struct
import sys
import zlib

# Directories that hold copies, builds or someone else's code. Findings there are noise.
SKIP_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "vendor", "venv", ".venv",
    "__pycache__", ".next", ".nuxt", ".svelte-kit", "dist", "build", "out",
    "target", ".tox", ".mypy_cache", ".pytest_cache", ".gradle", "Pods",
}

# PNG chunks that carry no identity: image data, transparency, animation frames and
# colour rendering. Anything outside this set is reported, including chunks nobody has
# standardised yet, which is how a new provenance format gets caught.
PNG_KEEP = {
    b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS",
    b"acTL", b"fcTL", b"fdAT",
    b"gAMA", b"cHRM", b"sRGB", b"bKGD", b"sBIT", b"pHYs", b"hIST", b"sPLT",
}

# WebP chunks that are the picture itself. EXIF, XMP, ICCP and C2PA are not.
WEBP_KEEP = {b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ANIM", b"ANMF"}

# What a chunk or segment actually is, for the report.
WHAT = {
    "caBX": "C2PA provenance manifest",
    "c2pa": "C2PA provenance manifest",
    "C2PA": "C2PA provenance manifest",
    "eXIf": "Exif camera and device data",
    "EXIF": "Exif camera and device data",
    "XMP ": "XMP packet, often holds the generating tool",
    "iTXt": "text, this is where XMP hides in a PNG",
    "tEXt": "text",
    "zTXt": "compressed text",
    "tIME": "last modified timestamp",
    "iCCP": "colour profile, carries a profile name",
    "ICCP": "colour profile, carries a profile name",
    "APP1": "Exif or XMP",
    "APP11": "JUMBF, the box format C2PA ships in",
    "APP13": "Photoshop resource block",
    "COM": "comment",
}

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif"}


class Finding:
    def __init__(self, path, kind, detail, size=None):
        self.path, self.kind, self.detail, self.size = path, kind, detail, size

    def __str__(self):
        size = " %d bytes" % self.size if self.size is not None else ""
        return "  %s: %s%s  (%s)" % (self.path, self.kind, size, self.detail)


def png_chunks(data):
    """Yield (type, start, end, payload) for every chunk. Raises on a malformed file."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    i = 8
    while i + 8 <= len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        ctype = data[i + 4:i + 8]
        end = i + 12 + length
        if end > len(data):
            raise ValueError("chunk %r runs past the end of the file" % ctype)
        yield ctype, i, end, data[i + 8:i + 8 + length]
        i = end
        if ctype == b"IEND":
            break


def scan_png(path, data):
    found, seen_end = [], None
    for ctype, _, end, payload in png_chunks(data):
        name = ctype.decode("latin1")
        if ctype == b"IEND":
            seen_end = end
        if ctype not in PNG_KEEP:
            found.append(Finding(path, "PNG chunk %s" % name,
                                 WHAT.get(name, "not image data"), len(payload)))
    if seen_end is None:
        found.append(Finding(path, "truncated",
                             "no IEND chunk, the file is cut short or malformed"))
    elif seen_end != len(data):
        found.append(Finding(path, "trailing data after IEND",
                             "bytes appended past the end of the image",
                             len(data) - seen_end))
    return found


def webp_chunks(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not a WebP")
    i = 12
    while i + 8 <= len(data):
        ctype = data[i:i + 4]
        length = struct.unpack("<I", data[i + 4:i + 8])[0]
        end = i + 8 + length + (length & 1)   # RIFF pads odd lengths to even
        if end > len(data) + 1:
            raise ValueError("chunk %r runs past the end of the file" % ctype)
        yield ctype, i, end, data[i + 8:i + 8 + length]
        i = end


def scan_webp(path, data):
    found = []
    declared = struct.unpack("<I", data[4:8])[0] + 8
    for ctype, _, _, payload in webp_chunks(data):
        name = ctype.decode("latin1")
        if ctype not in WEBP_KEEP:
            found.append(Finding(path, "WebP chunk %s" % name,
                                 WHAT.get(name, "not image data"), len(payload)))
    if not any(t in (b"VP8 ", b"VP8L") for t, _, _, _ in webp_chunks(data)):
        found.append(Finding(path, "truncated",
                             "no VP8 or VP8L chunk, the file is cut short or malformed"))
    if declared < len(data):
        found.append(Finding(path, "trailing data after the RIFF container",
                             "bytes appended past the declared size",
                             len(data) - declared))
    return found


def jpeg_segments(data):
    """Yield (marker, start, end, payload) up to the start of scan data."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            break
        marker = data[i + 1]
        if marker == 0xDA:            # start of scan, pixels follow
            yield marker, i, len(data), b""
            return
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        end = i + 2 + length
        yield marker, i, end, data[i + 4:end]
        i = end


def scan_jpeg(path, data):
    found, saw_scan = [], False
    for marker, _, _, payload in jpeg_segments(data):
        if 0xE0 <= marker <= 0xEF:                       # APPn
            n = marker - 0xE0
            if n == 0:                                   # APP0 is JFIF, structural
                continue
            name = "APP%d" % n
            found.append(Finding(path, "JPEG segment %s" % name,
                                 WHAT.get(name, "application metadata"), len(payload)))
        elif marker == 0xFE:                             # COM
            found.append(Finding(path, "JPEG segment COM", WHAT["COM"], len(payload)))
        elif marker == 0xDA:
            saw_scan = True
    if not saw_scan:
        found.append(Finding(path, "truncated",
                             "no start of scan, the file is cut short or malformed"))
    return found


def scan_svg(path, data):
    found = []
    low = data.lower()
    for needle, what in ((b"<metadata", "metadata element"),
                         (b"<?xpacket", "XMP packet"),
                         (b"c2pa", "C2PA marker"),
                         (b"<dc:creator", "Dublin Core creator"),
                         (b"inkscape", "editor namespace"),
                         (b"sodipodi", "editor namespace"),
                         (b"<!-- generator", "generator comment")):
        if needle in low:
            found.append(Finding(path, "SVG %s" % what, "not drawing data"))
    return found


def scan_bytes_fallback(path, data):
    """Last net, for formats with no parser here. Cheap and catches the obvious."""
    low = data.lower()
    for needle in (b"c2pa", b"jumbf", b"contentcredentials", b"<?xpacket"):
        if needle in low:
            return [Finding(path, "provenance marker %r" % needle.decode(),
                            "found in the raw bytes")]
    return []


SCANNERS = {".png": scan_png, ".webp": scan_webp,
            ".jpg": scan_jpeg, ".jpeg": scan_jpeg, ".svg": scan_svg}


def scan_file(path):
    data = open(path, "rb").read()
    ext = os.path.splitext(path)[1].lower()
    scanner = SCANNERS.get(ext)
    if scanner is None:
        return scan_bytes_fallback(path, data)
    try:
        return scanner(path, data)
    except ValueError as exc:
        return [Finding(path, "unreadable", str(exc))]


def strip_png(data):
    """Keep only chunks that are the picture. IDAT bytes are copied, never recompressed."""
    out = [data[:8]]
    for ctype, start, end, _ in png_chunks(data):
        if ctype in PNG_KEEP:
            out.append(data[start:end])
        if ctype == b"IEND":
            break
    return b"".join(out)


def strip_webp(data):
    body = []
    for ctype, start, end, _ in webp_chunks(data):
        if ctype in WEBP_KEEP:
            body.append(data[start:end])
    body = b"".join(body)
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


def strip_jpeg(data):
    out, tail = [data[:2]], None
    for marker, start, end, _ in jpeg_segments(data):
        if marker == 0xDA:
            tail = data[start:]
            break
        if 0xE0 <= marker <= 0xEF and marker != 0xE0:
            continue
        if marker == 0xFE:
            continue
        out.append(data[start:end])
    return b"".join(out) + (tail or b"")


def image_payload(path, data):
    """The compressed picture itself, so a strip can be proved not to have touched it."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".png":
        return b"".join(p for t, _, _, p in png_chunks(data) if t in (b"IDAT", b"fdAT"))
    if ext == ".webp":
        return b"".join(p for t, _, _, p in webp_chunks(data)
                        if t in (b"VP8 ", b"VP8L", b"ALPH"))
    if ext in (".jpg", ".jpeg"):
        for marker, start, _, _ in jpeg_segments(data):
            if marker == 0xDA:
                return data[start:]
    return b""


STRIPPERS = {".png": strip_png, ".webp": strip_webp,
             ".jpg": strip_jpeg, ".jpeg": strip_jpeg}


def strip_file(path):
    """Returns (changed, message). Refuses to write if the picture would change."""
    ext = os.path.splitext(path)[1].lower()
    stripper = STRIPPERS.get(ext)
    if stripper is None:
        return False, "no safe filter for %s, remove the metadata by hand" % ext
    before = open(path, "rb").read()
    after = stripper(before)
    if after == before:
        return False, "nothing to remove"
    was, now = image_payload(path, before), image_payload(path, after)
    if was != now:
        return False, "REFUSED, the image data would have changed"
    open(path, "wb").write(after)
    return True, "removed %d bytes, image data identical (%s)" % (
        len(before) - len(after), "sha1 %s" % _sha1(now)[:12])


def _sha1(b):
    import hashlib
    return hashlib.sha1(b).hexdigest()


def walk(roots):
    for root in roots:
        if os.path.isfile(root):
            yield root
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in sorted(filenames):
                if os.path.splitext(name)[1].lower() in IMAGE_EXTS:
                    yield os.path.join(dirpath, name)


def main():
    ap = argparse.ArgumentParser(
        description="Fail the build when an image carries provenance or identity metadata.")
    ap.add_argument("paths", nargs="*", default=["."],
                    help="files or directories to scan, default the current directory")
    ap.add_argument("--strip", action="store_true",
                    help="remove the offending parts in place, without re-encoding")
    ap.add_argument("--quiet", action="store_true", help="print findings only")
    args = ap.parse_args()

    files = list(walk(args.paths))
    findings = []
    for path in files:
        findings.extend(scan_file(path))

    if findings:
        print("Provenance and metadata found in %d of %d assets:\n"
              % (len({f.path for f in findings}), len(files)))
        for f in findings:
            print(f)
        if args.strip:
            print("\nStripping:")
            failed = False
            for path in sorted({f.path for f in findings}):
                changed, msg = strip_file(path)
                print("  %s: %s" % (path, msg))
                failed = failed or not changed
            if failed:
                print("\nSome files were not cleaned. Fix those by hand.")
                return 1
            left = [f for p in sorted({f.path for f in findings}) for f in scan_file(p)]
            if left:
                print("\nStill dirty after stripping:")
                for f in left:
                    print(f)
                return 1
            print("\nAll clean. Re-run without --strip in CI.")
            return 0
        n = len(findings)
        print("\n%d finding%s. Run again with --strip to remove them."
              % (n, "" if n == 1 else "s"))
        return 1

    if not args.quiet:
        print("%d asset%s scanned, no provenance or identity metadata."
              % (len(files), "" if len(files) == 1 else "s"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
