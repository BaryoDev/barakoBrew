# The page tree

`/pages` shows the pages of a site as a tree and lets you arrange it. It needs the Pages module on
the API (`BarakoCMS.Pages`, barakoCMS 4.2.0), which serves `GET /api/pages/tree`.

## What the screen does

- Drag a page by its handle. The top quarter of another row drops before it, the bottom quarter
  after it, and the middle puts it inside, at the end of its children. While dragging, the row
  under the pointer shows the path the page would get.
- The move buttons on each row do the same from the keyboard: up, down, into the page above, and
  out of its parent.
- A switch per page sets whether it shows in the navigation.
- Each row shows the page's status and path, links to the entry editor, and has a button to add a
  page under it, which opens a new entry with the parent already set.
- The pencil changes a page's slug, with a preview of the new path.

## How a move is written

Through the ordinary content update, one entry at a time, never a bulk endpoint. For each page it
reads the entry, sets the fields, and saves with the entry's `version` and its ETag as `If-Match`.

The pages in the list a page lands in are numbered 1, 2, 3 in their new order, and only a page whose
number or parent changes is saved. Moving a page to the top level removes its parent field.

The API refuses a page as its own parent, a cycle, a tree deeper than `MaxDepth`, and a reserved
slug on a top-level page. Its message is shown on the row it refused. A 412, or an entry whose
parent no longer matches the tree, means someone else changed the page: the tree reloads and the
row says so.

## Redirects

A move to another parent, or a new slug, changes the address of the page and of every page below
it. The screen then lists each old and new path and offers to add a redirect for each through
`POST /api/redirects`. They are temporary (302) unless you tick Permanent. A redirect the API
refuses, for example because the old path already redirects somewhere, is named on its line.

## Field names

The API's `Modules:Pages` options name the type and fields. It does not report them, so the console
uses the defaults, which match the blog blueprint's `page` type:

| Option                  | Default            |
| ----------------------- | ------------------ |
| `ContentType`           | `page`             |
| `ParentField`           | `ParentPage`       |
| `ShowInNavigationField` | `ShowInNavigation` |
| `OrderField`            | `NavigationOrder`  |
| `HomeSlug`              | `home`             |

The tree itself reads correctly whatever the options are. A site that renames the fields sees its
tree, but moves and the navigation switch write the default names. The slug field is the page type's
field of type `slug`.

## When the tree is not available

- **A 404** from the tree endpoint means the module is not enabled. The screen says so and links to
  the entries list.
- **A contract it does not read.** Each body carries `contract`. This console reads contract 1. Any
  other value, or none, lists the pages without nesting and turns moving off.
- **`truncated`** means the site has more pages than the API reads for one tree (`MaxPages`, 1000 by
  default). The screen says some pages are missing.
