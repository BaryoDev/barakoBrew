import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { ErrorState } from './error-state';
import { parseResponse } from '@/lib/api';

function shapeError(): unknown {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        parseResponse(z.object({ items: z.array(z.unknown()) }), { versions: [] }, 'GET /x');
    } catch (error) {
        return error;
    }
    throw new Error('expected the parse to fail');
}

describe('ErrorState', () => {
    it('says the shape is wrong, not the connection, when the response did not parse', () => {
        render(<ErrorState entity="the history" error={shapeError()} />);

        expect(screen.getByRole('alert')).toHaveTextContent(/shape this console does not read/);
        expect(screen.getByRole('alert')).not.toHaveTextContent(/Check your connection/);
    });

    it('keeps the connection advice for any other failure', () => {
        render(<ErrorState entity="groups" error={new Error('Network Error')} />);

        expect(screen.getByRole('alert')).toHaveTextContent(/Check your connection/);
    });
});
