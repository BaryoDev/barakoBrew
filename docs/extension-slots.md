# Extension slots

A module installed next to the console can add a component to it without a change to this repo.

There are four slot kinds: `overview-card`, `settings-section`, `module-screen` and `sign-in-method`.

The first three are component slots. They share one props shape, and a component for a module that
`GET /api/modules` does not report as enabled is never mounted:

```ts
interface SlotProps {
  tenant: string;
  modules: readonly string[]; // the enabled module names, which is module presence
  queryClient: QueryClient;   // the console's shared client
}
```

A component gets these three and nothing else from the page. A component that throws is dropped
without taking the page down.

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
- The component gets `SlotProps` and nothing else from the page.
- Components are registered from code at build time. They are never fetched from the API or a URL.
- An unknown slot kind is a type error.

## settings-section

A section on the Settings page, above the runtime settings. With nothing registered the page is
unchanged.

```ts
registerSlot('settings-section', 'MyModule', MySection);
```

The module name and the gating are the same as `overview-card`. Sections stack in registration order.

## module-screen

The body of a module's page under Modules (`/modules/MyModule`). It renders inside the existing
module screen template, so the header and the Configuration card stay and the component replaces the
table body.

```ts
registerSlot('module-screen', 'MyModule', MyScreen);
```

- Only the component registered for the module in the address is mounted, and only while that module
  runs. Without one, the template shows its usual body.
- Navigation: the rail lists a module screen only when both hold, the module is present in
  `GET /api/modules` and a screen is registered for it. A present module with no screen gets no
  item, and a registered screen for an absent module gets none either. The item sits above
  `All modules`, so a caller who cannot see `All modules` is not offered one.

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
- Entries are components registered from code at build time. A string or URL is refused. `icon` and
  `Panel` are functions or `forwardRef` or `memo` components. A `lazy` component is not accepted.
  The ids `password` and `email-code` belong to the console and cannot be registered.
