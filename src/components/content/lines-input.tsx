'use client';

import { useState } from 'react';
import type { Viewer } from 'barako-content-form';
import { useFindType, useSchemas } from '@/hooks/use-schemas';
import { apiErrorList } from '@/lib/api';
import { findType, linesPayload, splitLineRefusals } from '@/lib/lines';
import { LinesGrid, type LineRow } from '@/components/content/lines-grid';
import type { ContentTypeDefinition } from '@/types/schema';

/**
 * The lines of an entry about to be created: the rows, the refusals that belong to them, and what
 * a create sends. Shared by the new entry screen and the first save of a single-entry type, which
 * both take lines the same way.
 */
export function useLinesInput(schema: ContentTypeDefinition | undefined) {
    const { data: types } = useSchemas();
    const lines = schema?.lines ?? null;
    const listed = findType(types ?? [], lines?.contentType);
    // The list is one page of the types, so a line type past it is read by name.
    const lookup = useFindType(lines?.contentType, !!lines && !!types && !listed);
    const lineType = listed ?? lookup.data ?? undefined;

    const [rows, setRows] = useState<LineRow[]>([]);
    const [refusals, setRefusals] = useState<string[]>([]);

    return {
        lines,
        lineType,
        /** The type takes lines, but the one it names cannot be found, so none can be entered. */
        missing: !!lines && !!types && !lineType && !lookup.isFetching,
        rows,
        refusals,
        setRows: (next: LineRow[]) => {
            // Positions in a refusal are of the rows as they were sent.
            setRefusals([]);
            setRows(next);
        },
        reset: () => {
            setRows([]);
            setRefusals([]);
        },
        clearRefusals: () => setRefusals([]),
        /** What a create carries for the lines: no key at all for an empty grid. */
        payload: () =>
            lines && lineType
                ? linesPayload(
                      lineType,
                      lines.parentField,
                      rows.map((r) => r.values),
                  )
                : {},
        /**
         * Takes the refusals that belong at the grid, and hands back the rest. `shown` is true when
         * the grid took every one, so nothing is left to show elsewhere.
         */
        refuse: (error: unknown): { rest: string[]; shown: boolean } => {
            const list = apiErrorList(error);
            const { grid, rest } = lines ? splitLineRefusals(list) : { grid: [], rest: list };
            setRefusals(grid);
            return { rest, shown: grid.length > 0 && rest.length === 0 };
        },
    };
}

export type LinesInput = ReturnType<typeof useLinesInput>;

/** The grid under a form, or the note that the line type cannot be found. Nothing for a type without lines. */
export function LinesInput({
    input,
    header,
    headerValues,
    viewer,
}: {
    input: LinesInput;
    header: ContentTypeDefinition;
    headerValues: Record<string, unknown>;
    viewer?: Viewer;
}) {
    if (!input.lines) return null;
    if (input.lineType) {
        return (
            <LinesGrid
                lines={input.lines}
                lineType={input.lineType}
                header={header}
                headerValues={headerValues}
                rows={input.rows}
                onChange={input.setRows}
                refusals={input.refusals}
                viewer={viewer}
            />
        );
    }
    if (!input.missing) return null;
    return (
        <p className="text-muted-foreground text-sm">
            The line type {input.lines.contentType} is not in the type list, so lines cannot be entered
            here.
        </p>
    );
}
