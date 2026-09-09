# Third party notices

barakoBrew is licensed under MPL-2.0, in `LICENSE`. That covers the code in this repository.

The container image published as `ghcr.io/baryodev/barako-admin` also redistributes third party
software. All of it is under a permissive licence. This file ships at
`/app/THIRD-PARTY-NOTICES.md` inside the image, because a statement about what an image
redistributes is worth little if it only exists in a repository nobody pulls.

## The image carries no copyleft

It used to. `sharp` is an optional dependency of Next.js itself, so `npm ci` installs it whatever
this repository asks for, and `next build` traced its prebuilt [libvips](https://www.libvips.org/)
binaries into the standalone output that the runtime stage copies. Those binaries are
LGPL-3.0-or-later, and 27MB of them shipped in every image while an audit of this project's direct
dependencies said there was no copyleft at all ([#76](https://github.com/BaryoDev/barakoBrew/issues/76)).

Nothing here renders a remote image, so the optimiser that wants `sharp` is off, and `@img` is
excluded from output tracing in `next.config.ts`. Turning the optimiser off was not sufficient on its
own: tracing copied the binaries either way.

## Checked rather than asserted

Two gates, because what comes in and what goes out are different questions.

- `scripts/check-licences.sh` reads the installed tree and fails on anything outside the allow list
  in `CONTRIBUTING.md`. It carries one named exception, the `@img/sharp-libvips-*` binaries, because
  `npm ci` installs them regardless and the tree is not the artifact. It prints that exception on
  every run.
- `scripts/check-image-licences.sh` reads the image. It refuses copyleft, and it refuses a package
  that does not say what it is licensed as. One named exception: `next/dist/compiled/busboy`, a copy
  Next vendors with nothing but a name in its `package.json`. busboy is MIT and that copy is covered
  by Next's own MIT licence. It is named rather than matched by directory, so a second licence-less
  stub appearing under `dist/compiled` fails and gets looked at instead of inheriting the reasoning.
  CI runs the gate on the image it builds, and two fixtures prove it refuses rather than leaving that
  to trust.

A listing for a given image is available from the image:

```bash
docker run --rm --entrypoint sh ghcr.io/baryodev/barako-admin:latest \
  -c 'cat /app/THIRD-PARTY-NOTICES.md'
```

## If `sharp` comes back

Then this file needs its LGPL section again, and that section has to carry the relinking right:
LGPL-3.0 permits distribution as part of a larger work, and attaches the obligation that a recipient
can replace the library with their own build. Saying "you may replace it" is worth nothing without
naming the file to replace, which for an Alpine image is
`/app/node_modules/@img/sharp-libvips-linuxmusl-<arch>/lib/libvips-cpp.so.<version>`. Source for
those builds is at <https://github.com/lovell/sharp-libvips>, and libvips itself is at
<https://github.com/libvips/libvips>.

Where image resizing belongs when the console needs it is
[#80](https://github.com/BaryoDev/barakoBrew/issues/80). Whatever that decides, the image gate is
what keeps this file honest.
