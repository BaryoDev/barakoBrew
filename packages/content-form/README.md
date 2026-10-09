# barako-content-form

Draws an editing form from a barakoCMS content type definition. A form and a field, driven by the
definition, with field sensitivity honoured by this package rather than by whoever calls it.

It knows nothing about routing, authentication or data fetching. It is handed a definition, the
values, and the roles of the person looking at the screen, and it returns controls.

```tsx
import { ContentForm } from 'barako-content-form';

<ContentForm
    fields={definition.fields}
    values={values}
    onChange={setValues}
    viewerRoles={user.roles}
/>;
```

## Sensitivity

`viewerRoles` is required, not optional. A field marked `Sensitive` or `Hidden` that the viewer
cannot read is drawn read only, with a line saying so, and the value the caller passed is never
made editable.

Pass `viewerCapabilities` (and `viewerRoleIds`) when you know them, and the rule is the one
barakoCMS 4.6 enforces in `SensitivityService`: the seeded SuperAdmin role (by id) sees everything,
then `visibleToRoles` if the field names any, then `view_sensitive` for `Sensitive` and
`view_hidden` for `Hidden`, with `*` satisfying both. Leave them out and the older rule by name
applies: SuperAdmin sees everything, then `visibleToRoles`, then `HR` for `Sensitive` and nobody
but SuperAdmin for `Hidden`.

The API would refuse the write anyway, silently, by putting the stored value back. Drawing an
editable box over a value the server will not take is the thing this stops.

## Field names in the values

The API finds a field by its name ignoring case, so an entry can hold `title` for a field named
`Title`. The form reads a value under the field's own spelling first, then under a stored key that
differs only in case, and writes back under the key it read from (the field's name when nothing is
stored). It never adds a second spelling, which barakoCMS 4.7 refuses with a 400. `fieldValueKey`
is that lookup, exported for a host that reads the values itself.

An entry that already holds both spellings cannot be saved as it is. The form shows the other
spelling under the field, with its value and a Remove control, and drops it only when asked.
`otherSpellings` lists them.

## Host controls

`renderField` lets the host draw a field itself, for the types whose control needs data the package
does not fetch: a reference picker, a block editor, a menu tree. Return `null` and the package
draws its own. A field the viewer may not see never reaches `renderField`, so a host control cannot
forget sensitivity either.

## Licence

MIT, deliberately and separately from whatever the repository around it uses, because a component
package is bundled into its consumers' builds. See `LICENSE` beside this file.
