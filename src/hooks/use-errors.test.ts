import { describe, expect, it } from 'vitest';
import { referenceHref, resolveBody } from './use-errors';

describe('resolveBody', () => {
    it('sends a reference and remarks, trimmed', () => {
        expect(resolveBody({ reference: '  PROJ-42 ', note: ' fixed in the release\n' })).toEqual({
            reference: 'PROJ-42',
            note: 'fixed in the release',
        });
    });

    it('leaves blank fields off, so resolving with an empty dialog sends what it always sent', () => {
        expect(resolveBody({ reference: '   ', note: '' })).toEqual({});
        expect(resolveBody({})).toEqual({});
    });
});

describe('referenceHref', () => {
    it('links an https reference such as an Azure DevOps work item or a pull request', () => {
        expect(referenceHref('https://dev.azure.com/org/project/_workitems/edit/1234')).toBe(
            'https://dev.azure.com/org/project/_workitems/edit/1234',
        );
        expect(referenceHref('http://jira.example.com/browse/PROJ-42')).toBe('http://jira.example.com/browse/PROJ-42');
    });

    it('does not link a bare ticket number', () => {
        expect(referenceHref('AB#1234')).toBeNull();
        expect(referenceHref('PROJ-42')).toBeNull();
        expect(referenceHref('#129')).toBeNull();
    });

    it('does not link a script or data URL, because the value becomes an href', () => {
        expect(referenceHref('javascript:alert(1)')).toBeNull();
        expect(referenceHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('gives null for nothing', () => {
        expect(referenceHref(null)).toBeNull();
        expect(referenceHref('')).toBeNull();
    });
});
