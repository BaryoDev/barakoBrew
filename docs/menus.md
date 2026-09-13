# Navigation menus

A menu is ordinary content. barakoCMS has no menu endpoints of its own: a menu is an entry of a
content type named `menu`, served anonymously at `GET /api/public/menu/{slug}` like any other
publicly deliverable type.

## The content type

| Field   | Type   | Holds                          |
| ------- | ------ | ------------------------------ |
| `Name`  | string | what the menu is called        |
| `Slug`  | slug   | how a site asks for it (`main`) |
| `Items` | json   | the items, in order            |

Turn on public delivery for the type, or the site cannot read it.

## The shape of `Items`

A list of items. Each item has a label and a link, may open in a new tab, and may hold one level
of children.

```json
[
    { "Label": "Blog", "Url": "/blog", "OpenInNewTab": false },
    {
        "Label": "Docs",
        "Url": "/docs",
        "OpenInNewTab": false,
        "Children": [{ "Label": "Guide", "Url": "/docs/guide" }]
    }
]
```

This is what `public.menu()` in `@baryodev/barako-client` reads. It accepts the keys in PascalCase
or camelCase, skips an item with no label, and ignores children below the first level. The API
itself stores whatever list it is given.

## Editing it in the console

The console shows the menu editor for the field named `Items` on the type named `menu`, and only
there. Another name gets the plain JSON editor. The editor:

- moves an item up or down among its siblings, nests a top-level item under the one above it, and
  moves a child back out, all with buttons that work from the keyboard;
- keeps every key an item already has, its casing included, and changes only order and nesting;
- refuses to nest an item that has its own children, since that would make a level the client
  drops;
- shows the value as JSON when it cannot show it as a list without losing part of it, for example a
  third level or a label that is not text. "Edit as JSON" is always available.
