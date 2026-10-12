'use client';

import Link from 'next/link';
import { useRequests } from '@/hooks/use-requests';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * The Request action's one parameter: the slug of a request definition. Method, URL, headers, body
 * and success rule live on that definition (Settings, Requests), so the builder picks one and shows
 * what it will send rather than asking for the slug by hand.
 *
 * Falls back to a plain input when the list cannot be read, for example for a role without
 * ManageRequests, so the action can still be saved with a slug typed in.
 */
export function RequestParameterField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data, isError } = useRequests();
  const requests = data?.items ?? [];
  const chosen = requests.find((r) => r.slug === value);

  if (isError || (data && requests.length === 0)) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          Request
        </Label>
        <Input
          id={id}
          value={value}
          className="font-mono text-xs"
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.value)}
        />
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {isError
            ? 'The requests could not be listed, so type the slug of one.'
            : 'No requests are configured yet.'}{' '}
          <Link href="/settings/requests" className="underline">
            Set one up under Settings, Requests
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        Request
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full font-mono text-xs">
          <SelectValue placeholder="Choose a request" />
        </SelectTrigger>
        <SelectContent>
          {value && !chosen && <SelectItem value={value}>{value}</SelectItem>}
          {requests.map((r) => (
            <SelectItem key={r.slug} value={r.slug}>
              {r.name} ({r.slug})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen ? (
        <dl
          aria-label="What this request sends"
          className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md px-3 py-2 font-mono text-xs"
        >
          <dt className="text-muted-foreground">Method</dt>
          <dd>{chosen.method}</dd>
          <dt className="text-muted-foreground">Connector</dt>
          <dd>{chosen.connectorSlug}</dd>
          <dt className="text-muted-foreground">Path</dt>
          <dd className="break-all">{chosen.pathTemplate}</dd>
          {Object.keys(chosen.headerTemplates).length > 0 && (
            <>
              <dt className="text-muted-foreground">Headers</dt>
              <dd className="break-all">{Object.keys(chosen.headerTemplates).join(', ')}</dd>
            </>
          )}
          {chosen.bodyTemplate && (
            <>
              <dt className="text-muted-foreground">Body</dt>
              <dd>{chosen.bodyContentType}</dd>
            </>
          )}
        </dl>
      ) : null}
      <p className="text-muted-foreground text-xs">
        <Link href="/settings/requests" className="underline">
          Edit requests under Settings, Requests
        </Link>
      </p>
    </div>
  );
}
