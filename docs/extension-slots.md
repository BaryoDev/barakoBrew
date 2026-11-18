# Extension slots

A module installed next to the console can add a component to it without a change to this repo.

There are two slot kinds, `overview-card` and `sign-in-method`.

## overview-card

It sits where the first Overview card is. With nothing
registered the slot renders nothing and the page shows "Today at a glance" from `GET /api/overview`.

A build registers a component from code at startup:

```ts
import { registerSlot } from '@/lib/extension-slots';

registerSlot('overview-card', 'MyModule', MyCard);
```

- The second argument is the module name. The component is mounted only when `GET /api/modules`
  reports that module as enabled. While the report is loading or refused, nothing mounts.
- The component gets `{ tenant, modules }` and nothing else from the page.
- Components are registered from code at build time. They are never fetched from the API or a URL.
- An unknown slot kind is a type error.

## sign-in-method

Adds a tab, with its own panel, to the sign-in page. The entry is a `SignInMethodEntry`
(`id`, `label`, `icon`, `Panel`):

```ts
import { registerSlot } from '@/lib/extension-slots';
import { QrApprovalPanel } from '@/components/sign-in/qr-approval-panel';
import { createQrApprovalApi } from '@/hooks/use-qr-approval';

const api = createQrApprovalApi({ createPath: '/api/my-module/qr/create', pollPath: '/api/my-module/qr/poll' });

registerSlot('sign-in-method', 'MyModule', {
  id: 'my-module-qr',
  label: 'Phone',
  icon: IconMobile,
  Panel: ({ flow }) => <QrApprovalPanel flow={flow} api={api} />,
});
```

- The difference from `overview-card`: the tab is drawn only when `GET /api/auth/methods` lists the
  entry's `id`. It does not use `GET /api/modules`, because that route needs a signed-in caller and
  the sign-in page has none. The module name is not used for gating.
- A panel gets `flow` and `form`. When it ends with tokens it calls `flow.completeSession(tokens)`.
  The page starts the session and redirects. A panel never touches the token store.
- `QrApprovalPanel` takes `api` (`create` and `poll`) and optional `text`. The create reply is
  `{ qrPayload, matchNumber, secret, expiresInSeconds, requestId?, intervalSeconds? }` and the QR
  encodes `qrPayload` only. A poll sends `{ secret, requestId }` in the body and gets back
  `{ status, token?, refreshToken?, intervalSeconds? }`, where `status` is `pending`, `scanned`,
  `approved`, `denied` or `expired`. An `approved` reply without a token is not a session. Any other
  shape shows the network error state.
- Entries are components registered from code at build time. A string or URL is refused.
