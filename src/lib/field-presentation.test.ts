import { describe, it, expect } from 'vitest';
import {
    currencyProblem,
    editorsFor,
    rolesFor,
    routeTemplateProblem,
    sectionProblem,
    tokenLengthProblem,
} from './field-presentation';

describe('the editor and role vocabulary', () => {
    it('offers each editor only on a type that can hold it', () => {
        expect(editorsFor('json').map((e) => e.name)).toEqual(['blocks', 'menu', 'links']);
        expect(editorsFor('file').map((e) => e.name)).toEqual(['image']);
        expect(editorsFor('bool')).toHaveLength(0);
    });

    it('offers each role only on a type that can hold it', () => {
        expect(rolesFor('string').map((r) => r.name)).toEqual(['title', 'summary']);
        expect(rolesFor('datetime').map((r) => r.name)).toEqual(['date']);
        expect(rolesFor('int')).toHaveLength(0);
    });
});

describe('the checks made before the API is asked', () => {
    it('refuses a section with a space at an end, and one over 60 characters', () => {
        expect(sectionProblem('')).toBeNull();
        expect(sectionProblem('Branding')).toBeNull();
        expect(sectionProblem(' Branding')).not.toBeNull();
        expect(sectionProblem('x'.repeat(61))).not.toBeNull();
    });

    it('refuses a route template that could leave the site', () => {
        expect(routeTemplateProblem('')).toBeNull();
        expect(routeTemplateProblem('/blog/{slug}')).toBeNull();
        expect(routeTemplateProblem('blog/{slug}')).not.toBeNull();
        expect(routeTemplateProblem('//other.example/{slug}')).not.toBeNull();
        expect(routeTemplateProblem('/../{slug}')).not.toBeNull();
        expect(routeTemplateProblem('/blog/{slug}/{slug}')).not.toBeNull();
        expect(routeTemplateProblem('/@other/{slug}')).not.toBeNull();
    });

    it('refuses a currency that is not three capital letters, and a scale without one', () => {
        expect(currencyProblem('USD', '')).toBeNull();
        expect(currencyProblem('USD', '4')).toBeNull();
        expect(currencyProblem('usd', '')).not.toBeNull();
        expect(currencyProblem('', '2')).not.toBeNull();
        expect(currencyProblem('USD', '9')).not.toBeNull();
    });

    it('refuses a token length outside 16 to 128', () => {
        expect(tokenLengthProblem('')).toBeNull();
        expect(tokenLengthProblem('16')).toBeNull();
        expect(tokenLengthProblem('15')).not.toBeNull();
        expect(tokenLengthProblem('129')).not.toBeNull();
    });
});
