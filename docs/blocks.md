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
- Marks what the site would refuse to render: a missing required prop, a link with an unsafe scheme,
  a number out of range, a value that is not one of a select's options, a wrong number of slot
  lists. The site skips a block with any of these, so the row says how many problems it has.

Saving is the ordinary entry save, with the entry's version and `If-Match`.

## What it keeps

- A block whose type the schema does not list is shown read-only with its props, can be moved or
  removed, and is saved exactly as it was.
- A prop no field declares, and any key beside `type` and `props`, is kept through edits.
- A field kind the console does not know is edited as JSON.

## When there is no schema

With no `NEXT_PUBLIC_PRESS_URL`, when `/api/blocks` cannot be read, when it publishes a schema version
other than 1, or when the stored value is not a list, the field is the JSON editor it always was,
with a note saying why.

## The schema the editor expects

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

The editor warns when a page holds more than 100 blocks in total or nests them more than four levels
deep, which are the limits barakoPress reads to.
