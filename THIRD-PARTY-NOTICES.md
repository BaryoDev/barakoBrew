# Third party notices

barakoBrew is licensed under MPL-2.0, in `LICENSE`. That covers the code in this repository.

The container image published as `ghcr.io/baryodev/barako-admin` also redistributes third party
software, and two of those components are under the GNU Lesser General Public License. This file
exists because that obligation attaches to the image rather than to the source, so it has to travel
with the image. It is copied to `/app/THIRD-PARTY-NOTICES.md` in the container.

## Components under the LGPL

| Component | Version | Licence |
| --- | --- | --- |
| `@img/sharp-libvips-<platform>` | 1.3.x | LGPL-3.0-or-later |
| `@img/sharp-wasm32` | 0.35.x | Apache-2.0 AND LGPL-3.0-or-later AND MIT |

These are the prebuilt [libvips](https://www.libvips.org/) binaries that
[sharp](https://sharp.pixelplumbing.com) loads. Source, including the build scripts used to produce
the binaries, is at <https://github.com/lovell/sharp-libvips>. libvips itself is at
<https://github.com/libvips/libvips>.

Only the binary for the image's own platform is present in a given image. This image is
Alpine-based, so the package is the musl build: `@img/sharp-libvips-linuxmusl-x64` on
`linux/amd64`, `@img/sharp-libvips-linuxmusl-arm64` on `linux/arm64`.

### How they get here

Nothing in this repository asks for them. `sharp` is an optional dependency of Next.js itself, used
for image optimisation, and `next build` traces it into the standalone output that the runtime image
copies. So they arrive through the framework rather than through a choice made here, which is why an
audit of this project's direct dependencies did not see them.

### Your rights under the LGPL

LGPL-3.0 permits distribution of these libraries as part of a larger work under other terms, which
is what this image does. The obligation it attaches is that you must be able to replace them with a
modified version.

You can. The libraries are ordinary files inside the image:

```
/app/node_modules/@img/sharp-libvips-linuxmusl-arm64/lib/libvips-cpp.so.8.18.6
```

To use your own build, mount or copy your version over that file, or over the directory holding it.
Nothing is statically linked into the application and nothing verifies the library beyond loading
it, so a replacement built from the upstream source is picked up on the next start.

Confirmed against a built image rather than assumed:

```
$ docker run --rm --entrypoint sh ghcr.io/baryodev/barako-admin -c \
    'ls /app/node_modules/@img/sharp-libvips-*/lib'
glib-2.0
index.js
libvips-cpp.so.8.18.6
```

## Everything else

Every other dependency in the image is under a permissive licence. That is not a claim anyone has
to take on trust: `scripts/check-licences.sh` reads the licence of every package on disk and fails
the build on anything outside the allow list in `CONTRIBUTING.md`. The two components above are the
only exceptions, they are excepted **by package name rather than by allowing the LGPL**, and the
script prints them on every run so the exception cannot go quiet.

A full listing for a given image is available from that image:

```bash
docker run --rm --entrypoint sh ghcr.io/baryodev/barako-admin:latest \
  -c 'cat /app/THIRD-PARTY-NOTICES.md'
```
