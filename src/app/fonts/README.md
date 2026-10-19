# Fonts

The three typefaces the console uses, as files in the repository. `src/app/layout.tsx` loads them
with `next/font/local`, so `next build` reads them from disk and asks no other host for a font.
ESLint refuses `next/font/google` (see `eslint.config.mjs`), which is what fetched them before.

Each file is the one Google Fonts served to `next/font/google` for the import the root layout used
to make, byte for byte. That is on purpose: the same file is the only way to be sure the same
glyphs, hinting and metrics reach the browser.

| File | Family | Covers | Size |
| --- | --- | --- | --- |
| `bricolage-grotesque-latin-wght.woff2` | Bricolage Grotesque | weights 200 to 800 and the `opsz` axis (12 to 96), variable; the layout declares 500 to 700 | 76,868 bytes |
| `instrument-sans-latin-wght.woff2` | Instrument Sans | weights 400 to 700, variable | 29,904 bytes |
| `jetbrains-mono-latin-wght.woff2` | JetBrains Mono 2.211 | weights 100 to 800, variable; the layout declares 400 to 500 | 31,340 bytes |

All three are the `latin` subset (U+0000-00FF and a few more, so ñ and the rest of Latin-1), normal
style. 138,112 bytes in total.

## Where they came from

Bricolage Grotesque and Instrument Sans were fetched on 2026-10-19; JetBrains Mono on 2026-10-01.
The weight a stylesheet names decides how wide a file Google answers with, so the two new requests
asked for the whole axis and the layout narrows it.

| File | Stylesheet | Font URL | SHA-256 |
| --- | --- | --- | --- |
| `bricolage-grotesque-latin-wght.woff2` | `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap` | `https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9K6as8bTXq_nANBjzKo3IeZx8z6up5BeSl9D4dj_x9PpZBMlGIInHWVyNJ.woff2` | `85f55a58a31e61a2e19e8bb25fed503181bf2a6b4cab76c589992cfaac377447` |
| `instrument-sans-latin-wght.woff2` | `https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&display=swap` | `https://fonts.gstatic.com/s/instrumentsans/v4/pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1ZuWi3g.woff2` | `6219bc4bfdfc5d9b2201dcdf046218b122a758f932e25ed5f168f929b7ca2311` |
| `jetbrains-mono-latin-wght.woff2` | `https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap` | `https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwgknk-4.woff2` | `2c32b9b3ee358c119e210f6f5195f9bd34894d78a785ff2e95d60e718e400af4` |

The stylesheet lists one `@font-face` per subset, and the font URL is the one in the block marked
`/* latin */`. Google picks the files by `User-Agent`, so the stylesheet only lists these URLs for
the one `next/font/google` sends:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36
```

A client with no browser `User-Agent` is given TTF. The font URLs above answer with the recorded checksums
whatever the client.

## Licences

All three are under the SIL Open Font License 1.1. The licence files are the `OFL.txt` of each
family in [google/fonts](https://github.com/google/fonts) at commit
`9710da1eacb3be272583c3224dcb70f9da6eadbb`, unchanged:

| Licence file | From |
| --- | --- |
| `OFL-bricolage-grotesque.txt` | `ofl/bricolagegrotesque/OFL.txt` |
| `OFL-instrument-sans.txt` | `ofl/instrumentsans/OFL.txt` |
| `OFL-jetbrains-mono.txt` | `ofl/jetbrainsmono/OFL.txt` |

Each woff2 also carries its copyright line and the licence URL in its `name` table. The Dockerfile
copies the three licence files into the image, at `/app/font-licences/`.

## Adding or replacing a font

Put the woff2 here with its licence beside it as `OFL-<family>.txt`, add a row to both tables, and
name the file in `src/app/layout.tsx`. `src/test/font-imports.test.ts` fails if the layout names a
file that is not here or has no licence file. Only `latin` is vendored: `next/font/local` takes one
file per face and has no `unicode-range` per file, so a second subset needs its own `@font-face`.
