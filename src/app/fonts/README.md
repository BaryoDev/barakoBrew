# Fonts

The three typefaces the console uses, as files in the repository. `src/app/layout.tsx` loads them
with `next/font/local`, so `next build` reads them from disk and asks no other host for a font.
ESLint refuses `next/font/google` (see `eslint.config.mjs`), which is what fetched them before.

Each file is the one Google Fonts served to `next/font/google` for the import the root layout used
to make, byte for byte. That is on purpose: the same file is the only way to be sure the same
glyphs, hinting and metrics reach the browser.

| File | Family | Covers | Size | Google Fonts version |
| --- | --- | --- | --- | --- |
| `sora-latin-600.woff2` | Sora 2.000 | weight 600, static | 15,048 bytes | v17 |
| `manrope-latin-wght.woff2` | Manrope 4.504 | weights 200 to 800, variable | 24,576 bytes | v20 |
| `jetbrains-mono-latin-wght.woff2` | JetBrains Mono 2.211 | weights 400 to 800, variable | 31,340 bytes | v24 |

All three are the `latin` subset, normal style. 70,964 bytes in total.

## Where they came from

Fetched on 2026-10-01. The stylesheet request names the weights, and Google answers with a file cut
to that range, which is why Sora is static and JetBrains Mono starts at 400.

| File | Stylesheet | Font URL | SHA-256 |
| --- | --- | --- | --- |
| `sora-latin-600.woff2` | `https://fonts.googleapis.com/css2?family=Sora:wght@600&display=swap` | `https://fonts.gstatic.com/s/sora/v17/xMQOuFFYT72X5wkB_18qmnndmSeMmU-NKQJDA8i1P4w.woff2` | `931ddd0959495d5f051282976e2256861836f22d23c695768fade16da2cbed46` |
| `manrope-latin-wght.woff2` | `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap` | `https://fonts.gstatic.com/s/manrope/v20/xn7gYHE41ni1AdIRggexSvfedN4.woff2` | `e310b55a7fd9677f5e3555e6c6c4d064fa1f1d24393f0ddbe217cea12a8c432f` |
| `jetbrains-mono-latin-wght.woff2` | `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap` | `https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwgknk-4.woff2` | `2c32b9b3ee358c119e210f6f5195f9bd34894d78a785ff2e95d60e718e400af4` |

The stylesheet lists one `@font-face` per subset. The font URL is the one in the block marked
`/* latin */`, and the request needs a browser's `User-Agent` or Google answers with TTF.

## Licences

All three are under the SIL Open Font License 1.1. The licence files are the `OFL.txt` of each
family in [google/fonts](https://github.com/google/fonts) at commit
`9710da1eacb3be272583c3224dcb70f9da6eadbb`, unchanged:

| Licence file | From |
| --- | --- |
| `OFL-sora.txt` | `ofl/sora/OFL.txt` |
| `OFL-manrope.txt` | `ofl/manrope/OFL.txt` |
| `OFL-jetbrains-mono.txt` | `ofl/jetbrainsmono/OFL.txt` |

Each woff2 also carries its copyright line and the licence URL in its `name` table. The Dockerfile
copies the three licence files into the image, at `/app/font-licences/`.

## Adding or replacing a font

Put the woff2 here with its licence beside it as `OFL-<family>.txt`, add a row to both tables, and
name the file in `src/app/layout.tsx`. `src/test/font-imports.test.ts` fails if the layout names a
file that is not here or has no licence file. Only `latin` is vendored: `next/font/local` takes one
file per face and has no `unicode-range` per file, so a second subset needs its own `@font-face`.
