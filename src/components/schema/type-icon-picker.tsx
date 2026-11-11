'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { useSetIcon } from '@/hooks/use-schemas';
import { apiErrorMessage } from '@/lib/api';
import { checkSvg } from '@/lib/icon-svg';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TYPE_GLYPHS, TypeIcon, iconId } from '@/components/schema/type-icon';
import type { ContentTypeIcon } from '@/types/schema';

/**
 * The type header's icon control: a 44px button that opens twenty glyphs and a Custom SVG box.
 *
 * A glyph is saved as `{ name }`. Pasted markup is checked here for the fast message (a viewBox and
 * one shape), cleaned, and sent as `{ svg }`; the API's own refusal is shown as it words it. The
 * saved icon is drawn from the type list the response refreshes, through a registered symbol.
 */
export function TypeIconPicker({
  typeName,
  displayName,
  icon,
}: {
  typeName: string;
  displayName: string;
  icon: ContentTypeIcon | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const setIcon = useSetIcon(typeName);
  const panelId = useId();
  const current = iconId(icon);

  const save = (next: ContentTypeIcon | null, done: string) =>
    setIcon.mutate(next, {
      onSuccess: () => {
        toast.success(done);
        setProblem(null);
      },
      onError: (error) => setProblem(apiErrorMessage(error, 'The icon could not be saved.')),
    });

  const useCustom = () => {
    const checked = checkSvg(custom);
    if (!checked.ok) {
      setProblem(checked.error);
      return;
    }
    setProblem(null);
    save({ svg: checked.svg }, `${displayName} icon updated`);
    setCustom('');
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Change icon"
          title="Change icon"
          onClick={() => setOpen((v) => !v)}
          className="bg-primary/10 text-primary hover:border-primary focus-visible:ring-ring grid size-11 shrink-0 place-items-center rounded-xl border outline-none focus-visible:ring-[3px]"
        >
          <TypeIcon icon={icon} className="size-[22px]" />
        </button>
        <p className="text-muted-foreground text-[13px]">
          The icon shows in the type list and in Entries. Stored as <code className="font-mono text-xs">icon</code>{' '}
          on the definition.
        </p>
      </div>

      {open && (
        <div id={panelId} className="mt-3 space-y-4 rounded-lg border p-4">
          <div role="group" aria-label="Icons" className="flex flex-wrap gap-2">
            {TYPE_GLYPHS.map((glyph) => {
              const on = current === glyph.name;
              return (
                <button
                  key={glyph.name}
                  type="button"
                  aria-pressed={on}
                  aria-label={glyph.label}
                  title={glyph.label}
                  disabled={setIcon.isPending}
                  onClick={() => save({ name: glyph.name }, `${displayName} icon updated`)}
                  className={cn(
                    'focus-visible:ring-ring grid size-10 place-items-center rounded-lg border outline-none focus-visible:ring-[3px]',
                    on ? 'border-primary bg-primary/10 text-primary' : 'hover:border-ring/50'
                  )}
                >
                  {glyph.render({ className: 'size-5' })}
                </button>
              );
            })}
            {current?.startsWith('ic-custom-') && (
              <button
                type="button"
                aria-pressed
                aria-label="Custom icon"
                title="Custom icon"
                className="border-primary bg-primary/10 text-primary grid size-10 place-items-center rounded-lg border"
              >
                <TypeIcon icon={icon} className="size-5" />
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor={`${panelId}-svg`} className="text-sm font-medium">
              Custom SVG
            </label>
            <Textarea
              id={`${panelId}-svg`}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setProblem(null);
              }}
              rows={4}
              spellCheck={false}
              aria-invalid={problem !== null}
              aria-describedby={`${panelId}-note`}
              placeholder='<svg viewBox="0 0 32 32"><path d="..."/></svg>'
              className="font-mono text-xs"
            />
            <p
              id={`${panelId}-note`}
              role={problem ? 'alert' : undefined}
              className={cn('text-[12.5px]', problem ? 'text-destructive' : 'text-muted-foreground')}
            >
              {problem ??
                'Paste one SVG, 32 by 32 works best. It needs a viewBox and at least one shape. Scripts, styles, fill, stroke and event attributes are stripped and shapes are drawn in the text colour.'}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={setIcon.isPending || custom.trim() === ''}
                onClick={useCustom}
              >
                Use this SVG
              </Button>
              {icon && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={setIcon.isPending}
                  onClick={() => save(null, `${displayName} icon cleared`)}
                >
                  Clear icon
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
