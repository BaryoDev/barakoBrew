# Page blocks

A page built from blocks holds them in a json field named `Blocks`: an ordered list of
`{ "type": ..., "props": { ... } }`. barakoPress renders that list, and publishes which blocks it
can render at `GET /api/blocks` on the site. The console reads that document and builds the editor
from it, so it offers exactly the blocks that site can show and knows nothing else about the site.

## Turning it on

Set `NEXT_PUBLIC_PRESS_URL` on the console to the site's address, for example
`https://rckoronadal.org`. Like `NEXT_PUBLIC_API_URL` it is read at container start, so no rebuild.

The console fetches `{NEXT_PUBLIC_PRESS_URL}/api/blocks` from the browser, without the session. The
site has to answer that request from the console's origin: either the console is served from the
same origin as the site, or the site's `/api/blocks` sends an `Access-Control-Allow-Origin` header
that allows the console.

Any json field named `Blocks` (in any casing) on any content type gets the block editor. barakoPress
reads `Blocks` on the page type unless its `pageFields.blocks` says otherwise.

## What the editor does

- Lists the blocks in order. Each opens to a form built from its fields.
- Adds a block from a palette of the blocks the schema lists.
- Reorders by dragging a row's handle, or with its Move up and Move down buttons from the keyboard.
- Removes a block.
- Edits blocks nested in a `slots` field (columns, for example), with a list per slot, between the
  field's `min` and `max`.
- Edits a `list` field as entries of its item kind: a box per entry for text, links and numbers, and
  a row that opens to a sub-form for a list of groups. Entries are added, removed, and moved with
  Move up and Move down, between the list's `min` and `max` (100 when it names no `max`). A `group`
  field is a sub-form of its fields. Lists and groups nest three deep, as the site reads them.
- Marks what the site would refuse to render: a missing required prop, a link with an unsafe scheme,
  a number out of range, a value that is not one of a select's options, a wrong number of slot
  lists, a list with too few or too many entries, a group missing a required part. The site skips a
  block with any of these, so the row says how many problems it has, and an entry of a list says its
  own.

Saving is the ordinary entry save, with the entry's version and `If-Match`.

## Data bindings

A site that publishes a version 2 schema also says which scopes and formats it renders, and which
of a block's fields accept a placeholder. Beside each of those fields the editor shows **Use data**,
which builds one from a scope, a field, a format and a fallback:

```
Welcome to {{site.Name}}
{{item.Price | money ?? Ask us}}
{{query.class}}
```

Nobody types the braces. The scope list and the format list come from the site, so a deployment that
adds either gets it in the picker without a console release. The field list comes from
`GET /api/content-types`: `site` offers the fields of the `site` type, `page` the fields of the type
the entry being edited belongs to, and `item` the fields of whatever the enclosing block loads. Each
also offers the handful of names barakoPress lays over an entry, such as `Title` and `Slug`, so
`{{item.Title}}` works whatever the field is called. `query` is whatever the address carries, so it
takes a typed name.

`item` only holds a row inside a block that loads content or repeats over it. The picker says so
rather than hiding the option.

A binding is never resolved here. barakoPress resolves it on the server as the request's tenant, so
no binding makes a visitor's browser call the API.

### When a bound field goes away

Remove a field from a content type and every block binding it says so: the row shows how many data
problems it has, and the field says which name is gone and what the page will show instead, which is
the fallback or nothing. It is a warning and not an error, because the page still renders.

## Saved blocks

A saved block, which barakoPress calls a preset, is a named arrangement of blocks stored as data in
the `Presets` field of the tenant's `site` entry. It is not code, so one published barakoPress image
serves every site and each one has its own.

Open a block and choose **Save as a reusable block** to store it, with a name and a palette label.
Every `{{props.X}}` inside it becomes a setting the block asks for where it is used. Saved blocks
appear in the palette under Saved blocks, and a saved block never replaces one the site ships: the
site ignores such a name, so the editor does too.

The site type needs a JSON field called `Presets` for this. Without one the palette says so and
nothing offers to save.

## Tones and style recipes

A tenant's own tones (`Tones`) and style recipes (`StyleRecipes`) are site settings, edited on the
Theme and Style recipes screens. The editor reads them from the same `site` entry as saved blocks:

- Every tone field, which is a select offering the six built-in tones, also offers the tenant's
  tones after them, leaving out one whose colours do not resolve, since the site drops it. The site does the same when it knows the tenant, but the console reads
  `/api/blocks` without saying which tenant it edits, so it adds them itself.
- A field named `recipe` stays a text box, since the site takes a bound name such as
  `card-{{item.Product}}`, and offers the tenant's recipe names as suggestions. A name the site has
  no recipe for is flagged, and the block then draws its own look.

The site type needs JSON fields called `Tokens`, `Tones` and `StyleRecipes`. The API stores a field
its type does not declare, but its public delivery sends only declared fields, so the site would
never read it. Without one, the screen says so in place of the editor, a value stored under that
name does not hold back a save, and the block form offers nothing from it.

The Theme and Style recipes screens check names and values with the patterns barakoPress uses, and
refuse to save one it would drop. barakoPress checks them again when it reads the settings.

## What it keeps

- A block whose type the schema does not list is shown read-only with its props, can be moved or
  removed, and is saved exactly as it was.
- A prop no field declares, and any key beside `type` and `props`, is kept through edits.
- A field kind the console does not know is edited as JSON, and so is a list whose item kind it does
  not know or a list or group nested deeper than the site reads.

## When there is no schema

With no `NEXT_PUBLIC_PRESS_URL`, when `/api/blocks` cannot be read, when it publishes a schema version
this console does not read, or when the stored value is not a list, the field is the JSON editor it
always was, with a note saying why.

## Against a site that publishes version 1

A version 1 schema has no `bindings` key, so the editor offers no binding picker, marks no data
problems, reads no content types and no site settings, and shows one palette with no layer headings.
That is the editor exactly as it was before bindings existed, which is what an older barakoPress
renders correctly: it prints `{{site.Name}}` as those characters, so offering to write one would be
putting a mistake into a page.

## The schema the editor expects

Version 1:

```json
{
    "version": 1,
    "blocks": [
        {
            "type": "callToAction",
            "label": "Call to action",
            "perViewer": false,
            "fields": [
                { "name": "heading", "kind": "text", "label": "Heading", "required": true },
                { "name": "href", "kind": "url", "label": "Button link", "required": true }
            ]
        }
    ]
}
```

| Kind       | Control                                  | Value                          |
| ---------- | ---------------------------------------- | ------------------------------ |
| `text`     | text box                                 | string                         |
| `markdown` | the markdown composer, with preview      | string                         |
| `url`      | url box                                  | string, `/`, `#`, http, https or mailto |
| `number`   | number box, checked against `min`/`max`  | number                         |
| `boolean`  | switch                                   | true or false                  |
| `select`   | a select of `options`                    | one of `options`               |
| `slots`    | a list of block lists, `min` to `max`    | array of arrays of blocks      |
| `list`     | entries of `item`, `min` to `max`        | array of the item's values     |
| `group`    | a sub-form of `fields`                   | object keyed by field name     |

Version 2 adds three things, all optional to a reader and all additive:

```json
{
    "version": 2,
    "bindings": {
        "scopes": ["site", "page", "item", "query", "props"],
        "formats": ["text", "date", "datetime", "time", "money", "number", "upper", "lower"]
    },
    "blocks": [
        {
            "type": "text",
            "label": "Text",
            "layer": "primitive",
            "perViewer": false,
            "fields": [{ "name": "value", "kind": "text", "required": true, "bindable": true }]
        }
    ]
}
```

| Key        | Means                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| `bindings` | The scopes and formats a placeholder may name. Absent means no picker anywhere. |
| `layer`    | `primitive`, `block`, `data` or `preset`, which is how the palette groups.      |
| `bindable` | Whether that field's value may hold a placeholder. The site resolves it.        |

A `list` names what each entry is in `item`: `text`, `url`, `number` (with its own `min` and `max`)
or `group` (with its own `fields`). A `group` names its parts in `fields`. Both carry `bindable`, and
a bindable list or group may hold one placeholder in place of its entries, `{{item.Tags}}`, which the
site resolves to the array or object it names. The editor offers that on an empty list or group and
shows a bound one as the placeholder, with a way back to entries. A text box inside either gets the
same Use data control as any other.

```json
{
    "name": "stages",
    "kind": "list",
    "min": 2,
    "max": 6,
    "bindable": true,
    "item": {
        "kind": "group",
        "label": "Stage",
        "bindable": true,
        "fields": [{ "name": "label", "kind": "text", "required": true, "bindable": true }]
    }
}
```

The editor warns when a page holds more than 100 blocks in total or nests them more than four levels
deep, which are the limits barakoPress reads to.
