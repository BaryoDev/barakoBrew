export function FieldError({ message }: { message?: string | null }) {
    if (!message) return null;
    return <p className="text-destructive text-xs">{message}</p>;
}
