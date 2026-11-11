# Extension slots

A module installed next to the console can add a component to it without a change to this repo.

Today there is one slot kind, `overview-card`. It sits where the first Overview card is. With nothing
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
