"use client";

import { Section, TextField } from "@/components/site/editors";
import { Label } from "@/components/ui/label";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { usePageTree } from "@/hooks/use-pages";
import {
  HOLDING_PATH_FIELD,
  PRIVATE,
  SITE_MODE_FIELD,
  holdingPageOptions,
  modeNote,
  modeOptions,
  readMode,
  sameMode,
} from "@/lib/site-mode";
import { optionLabel } from "@/lib/choice";
import type { ContentTypeDefinition } from "@/types/schema";

const SELECT =
  "border-input bg-transparent dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] sm:w-72";

const HOLDING_HINT = "Leave empty for the default holding page.";

/**
 * Mode and the holding page. Each control shows only when the site type has its field, because an
 * API from before site mode has neither and would store whatever the screen sent under a name
 * nothing reads.
 */
export function SiteModeSection({
  values,
  set,
  schema,
  published = true,
}: {
  values: Record<string, unknown>;
  set: (field: string, value: unknown) => void;
  schema: ContentTypeDefinition;
  /** False when the loaded site entry is a draft. Unknown counts as published. */
  published?: boolean;
}) {
  const modeField = schema.fields.find((f) => f.name === SITE_MODE_FIELD);
  const holdingField = schema.fields.find((f) => f.name === HOLDING_PATH_FIELD);
  const tree = usePageTree();

  if (!modeField && !holdingField) return null;

  const mode = readMode(values[SITE_MODE_FIELD]);
  const options = modeField
    ? modeOptions(modeField, values[SITE_MODE_FIELD])
    : [];
  const selected = options.find((o) => sameMode(o.value, mode))?.value ?? mode;
  const isPrivate = sameMode(mode, PRIVATE);
  // Offered means the type's own options list it, not that the stored value was appended to the list.
  const privateOffered = (modeField?.options ?? []).some((o) =>
    sameMode(o.value, PRIVATE),
  );
  const note = modeNote(mode);
  const describedBy = [
    note ? "site-mode-note" : null,
    !privateOffered ? "site-mode-private-missing" : null,
    isPrivate ? "site-mode-private-pointer" : null,
    isPrivate && !published ? "site-mode-private-draft" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const holding =
    typeof values[HOLDING_PATH_FIELD] === "string"
      ? (values[HOLDING_PATH_FIELD] as string)
      : "";
  const pages = holdingPageOptions(tree.data);
  const usePicker = tree.isLoading || pages.length > 0;

  return (
    <Section
      title="Site mode"
      description={
        privateOffered
          ? "What visitors see: the site, one holding page on every route, or nothing unless they hold a share key."
          : "What visitors see: the site, or one holding page on every route."
      }
    >
      {modeField && (
        <div className="space-y-2">
          <Label id="site-mode-label">Mode</Label>
          <SegmentedControl
            aria-labelledby="site-mode-label"
            aria-describedby={describedBy || undefined}
            value={selected}
            onValueChange={(next) => set(SITE_MODE_FIELD, next)}
          >
            {options.map((option) => (
              <SegmentedControlItem key={option.value} value={option.value}>
                {optionLabel(option)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          {note && (
            <p
              id="site-mode-note"
              className={
                isPrivate
                  ? "bg-accent text-accent-foreground rounded-md px-3 py-2 text-xs"
                  : "text-muted-foreground text-xs"
              }
            >
              {note}
              {isPrivate && " It applies once the site entry is published."}
            </p>
          )}
          {!privateOffered && (
            <p
              id="site-mode-private-missing"
              className="text-muted-foreground text-xs"
            >
              {isPrivate
                ? "Private is on, but the site type does not offer it. Add the Private option to its Mode field to keep it."
                : "Private mode is not available yet. The site type needs the Private option added to its Mode field first."}
            </p>
          )}
          {isPrivate && (
            <p
              id="site-mode-private-pointer"
              className="text-muted-foreground text-xs"
            >
              Outsiders get in with a site share key. Make one in Share links,
              further down this page.
            </p>
          )}
          {isPrivate && !published && (
            <p
              id="site-mode-private-draft"
              className="text-muted-foreground text-xs"
            >
              The site entry is a draft, so the site is not private until it is
              published.
            </p>
          )}
        </div>
      )}

      {holdingField &&
        (usePicker ? (
          <div className="space-y-1.5">
            <Label htmlFor="site-holding-path">Holding page</Label>
            <select
              id="site-holding-path"
              className={SELECT}
              value={holding}
              disabled={tree.isLoading}
              aria-describedby="site-holding-path-hint"
              onChange={(e) => set(HOLDING_PATH_FIELD, e.target.value)}
            >
              <option value="">Default holding page</option>
              {pages.map((page) => (
                <option key={page.path} value={page.path}>
                  {page.label}
                </option>
              ))}
              {holding !== "" && !pages.some((p) => p.path === holding) && (
                <option value={holding}>
                  {holding} (not in the page tree)
                </option>
              )}
            </select>
            <p
              id="site-holding-path-hint"
              className="text-muted-foreground text-xs"
            >
              {HOLDING_HINT}
            </p>
          </div>
        ) : (
          <TextField
            id="site-holding-path"
            label="Holding page"
            placeholder="/coming-soon"
            hint={`A page path. ${HOLDING_HINT}`}
            value={holding}
            onChange={(v) => set(HOLDING_PATH_FIELD, v)}
          />
        ))}
    </Section>
  );
}
