'use client';

import { SiteForm } from '@/components/site/site-form';
import { Section, Structured, UndeclaredField, declaresField } from '@/components/site/editors';
import { RecipesEditor, previewTheme } from '@/components/site/recipes-editor';
import { RECIPES_FIELD, readRecipes, recipesProblem } from '@/lib/recipes';
import { validTokens } from '@/lib/theme-tokens';

export default function RecipesPage() {
    return (
        <SiteForm
            title="Style recipes"
            description="Named looks a block can wear with its Style recipe field, in place of its own. Each is a list of CSS properties the site allows, with values that can name tokens and theme values."
            requireEntry
            problem={recipesProblem}
        >
            {({ values, set, entry, schema }) => {
                const tokens = validTokens(values.Tokens);
                return (
                    <Section
                        title="Recipes"
                        description="Write {name} in a value for a token, or {colors.surface}, {space.md}, {radii.panel}, {text.body}, {fonts.mono} and {layout.gutter} for the theme's own. The site resolves them when a block draws."
                    >
                        {declaresField(schema, RECIPES_FIELD) ? (
                            <Structured
                                field={RECIPES_FIELD}
                                label="Style recipes"
                                value={values[RECIPES_FIELD]}
                                read={readRecipes}
                                onChange={(v) => set(RECIPES_FIELD, v)}
                            >
                                {(rows) => (
                                    // Keyed on the version, as the Theme screen's held rows are, so a newer
                                    // stored value starts them again.
                                    <RecipesEditor
                                        key={`${entry?.id}-${entry?.version}`}
                                        initial={rows}
                                        tokens={tokens}
                                        theme={previewTheme(values, tokens)}
                                        onChange={(next) => set(RECIPES_FIELD, next)}
                                    />
                                )}
                            </Structured>
                        ) : (
                            <UndeclaredField field={RECIPES_FIELD} noun="style recipes" />
                        )}
                    </Section>
                );
            }}
        </SiteForm>
    );
}
