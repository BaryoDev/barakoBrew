export function FieldError({ message, id }: { message?: string | null; id?: string }) {
    if (!message) return null;
    return (
        <p id={id} className="text-destructive text-xs">
            {message}
        </p>
    );
}
