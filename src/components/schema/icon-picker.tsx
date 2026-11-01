'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSetTypeIcon } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { checkCustomSvg } from '@/lib/custom-icon';
import { TYPE_GLYPHS, TypeIcon } from '@/components/icons/type-icon';
import { IconSearch } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ContentTypeDefinition, ContentTypeIcon } from '@/types/schema';

/**
 * The icon a type is drawn with, in the type header. A 44px button opens a picker with the sprite
 * glyphs and a box for custom SVG. Custom markup is checked here for a fast message and again by
 * the API, whose refusal is shown as it is.
 */
export function IconPicker({ schema }: { schema: ContentTypeDefinition }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Change icon for ${schema.displayName}`}
          className="bg-secondary text-primary hover:bg-secondary/70 focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-[3px]"
        >
          <TypeIcon icon={schema.icon} className="size-5" />
        </button>
      </DialogTrigger>
      {open && <PickerDialog key={schema.name} schema={schema} onDone={() => setOpen(false)} />}
    </Dialog>
  );
}

function PickerDialog({ schema, onDone }: { schema: ContentTypeDefinition; onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [name, setName] = useState<string | null>(schema.icon?.name ?? null);
  const [custom, setCustom] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const setIcon = useSetTypeIcon(schema.name);

  const glyphs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return TYPE_GLYPHS.filter((g) => g.label.toLowerCase().includes(needle) || g.name.includes(needle));
  }, [search]);

  const check = custom.trim() ? checkCustomSvg(custom) : null;
  const localError = check && !check.ok ? check.error : null;

  const commit = (icon: ContentTypeIcon | null, done: string) =>
    setIcon.mutate(icon, {
      onSuccess: () => {
        toast.success(done);
        onDone();
      },
      onError: (error) => setRefusal(apiErrorMessage(error, 'The icon could not be saved.')),
    });

  const save = () => {
    setRefusal(null);
    if (check) {
      if (check.ok) commit({ svg: check.svg }, 'Icon saved');
      return;
    }
    if (name) commit({ name }, 'Icon saved');
  };

  const canSave = check ? check.ok : name !== null && name !== schema.icon?.name;

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Icon for {schema.displayName}</DialogTitle>
        <DialogDescription>Pick a glyph, or paste your own SVG.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <IconSearch className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <Input
          type="search"
          aria-label="Search icons"
          placeholder="Search icons"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {glyphs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No icon matches that search.</p>
      ) : (
        <div role="group" aria-label="Icons" className="grid grid-cols-5 gap-2">
          {glyphs.map(({ name: id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={!custom.trim() && name === id}
              onClick={() => {
                setName(id);
                setCustom('');
                setRefusal(null);
              }}
              className="hover:bg-secondary focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-secondary flex h-12 items-center justify-center rounded-lg border outline-none focus-visible:ring-[3px]"
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="customSvg">Custom SVG</Label>
        <Textarea
          id="customSvg"
          value={custom}
          placeholder='<svg viewBox="0 0 24 24"><path d="..."/></svg>'
          className="font-mono text-xs"
          aria-invalid={localError ? true : undefined}
          onChange={(e) => {
            setCustom(e.target.value);
            setRefusal(null);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Needs a viewBox and a shape. Scripts, styles, fill, stroke and event attributes are removed, and
          shapes take the text colour.
        </p>
        {localError && <p className="text-destructive text-sm">{localError}</p>}
        {check?.ok && (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            Preview
            <span className="bg-secondary text-primary inline-flex size-8 items-center justify-center rounded-lg">
              <TypeIcon icon={{ svg: check.svg }} className="size-5" />
            </span>
          </p>
        )}
      </div>

      {refusal && (
        <p role="alert" className="text-destructive text-sm">
          {refusal}
        </p>
      )}

      <DialogFooter>
        {schema.icon && (
          <Button type="button" variant="outline" disabled={setIcon.isPending} onClick={() => commit(null, 'Icon removed')}>
            Remove icon
          </Button>
        )}
        <Button type="button" disabled={!canSave || setIcon.isPending} onClick={save}>
          {setIcon.isPending ? 'Saving...' : 'Save icon'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
