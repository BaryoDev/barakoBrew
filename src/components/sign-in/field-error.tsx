import { IconTimes } from '@/components/icons';

/**
 * The error banner above a sign-in form. The field it is about carries aria-invalid, which draws
 * its border in the destructive colour (the design's --bad).
 */
export function FieldError({ id, message, hint }: { id: string; message: string; hint?: string }) {
    return (
        <div
            id={id}
            role="alert"
            className="bg-destructive/10 text-destructive rounded-xl px-3.5 py-3 text-[13.5px] leading-normal"
        >
            <p className="flex items-start gap-2 font-semibold">
                <IconTimes className="mt-1 size-3 shrink-0" />
                <span>{message}</span>
            </p>
            {hint ? <p className="mt-1 pl-5 text-xs font-normal opacity-90">{hint}</p> : null}
        </div>
    );
}
