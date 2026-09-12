import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContractGate } from './contract-gate';
import { recordContractVersion, __resetContractForTests, SUPPORTED_CONTRACT } from '@/lib/api-contract';

/**
 * What the console shows instead of itself.
 *
 * The supported range used to be one number, so the branch that prints a range was unreachable and
 * the screen said "This console speaks 1" whatever happened. With two versions supported it is the
 * line every mismatch shows, and it is the line somebody acts on, so it is asserted rather than read.
 */
describe('the screen shown when the API does not fit', () => {
    beforeEach(() => __resetContractForTests());

    // Literal versions, not the ends of SUPPORTED_CONTRACT. Derived from the constant this passes
    // whatever the range holds, including the range that sent the console blank against contract 2.
    it('renders the console against contract 1 and contract 2', () => {
        for (const version of [1, 2]) {
            __resetContractForTests();
            recordContractVersion(String(version));

            const { unmount } = render(
                <ContractGate>
                    <p>the console</p>
                </ContractGate>
            );

            expect(screen.getByText('the console'), `contract ${version} was refused`).toBeInTheDocument();
            unmount();
        }
    });

    it('names the whole range it speaks, not a single version', () => {
        recordContractVersion(String(SUPPORTED_CONTRACT.max + 1));

        render(
            <ContractGate>
                <p>the console</p>
            </ContractGate>
        );

        expect(screen.queryByText('the console')).not.toBeInTheDocument();

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('This API is newer than this console');
        expect(alert).toHaveTextContent(`${SUPPORTED_CONTRACT.min} to ${SUPPORTED_CONTRACT.max}`);
        expect(alert).toHaveTextContent(String(SUPPORTED_CONTRACT.max + 1));
    });
});
