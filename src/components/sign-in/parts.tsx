import { Button } from '@/components/ui/button';

/** The 42px form control the sign-in card uses, on the page tint rather than the card's white. */
export const FIELD = 'h-[42px] bg-background text-sm';

export function SubmitButton({
    pending,
    pendingLabel,
    disabled,
    children,
}: {
    pending: boolean;
    pendingLabel: string;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    return (
        <Button
            type="submit"
            disabled={pending || disabled}
            className="h-12 w-full text-[14.5px] font-bold shadow-[var(--shadow-accent)] transition-transform hover:-translate-y-px"
        >
            {pending ? pendingLabel : children}
        </Button>
    );
}
