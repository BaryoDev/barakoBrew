import { IconTimes } from '@/components/icons';

/** The inline error under a sign-in field. The field itself carries aria-invalid for the border. */
export function FieldError({ id, message, hint }: { id: string; message: string; hint?: string }) {
    return (
        <div id={id} role="alert" className="text-destructive text-[12.5px] leading-snug">
            <p className="flex items-start gap-1.5 font-semibold">
                <IconTimes className="mt-0.5 size-3 shrink-0" />
                <span>{message}</span>
            </p>
            {hint ? <p className="text-[var(--faint)] mt-1 pl-[18px] text-xs font-normal">{hint}</p> : null}
        </div>
    );
}
