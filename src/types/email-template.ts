// Email templates are content of the types the `email` blueprint creates (barakoCMS
// Blueprints/email.json). The names are the API's, fixed in EmailTemplateRenderer.

export const EMAIL_TEMPLATE_TYPE = 'email-template';
export const EMAIL_LAYOUT_TYPE = 'email-layout';

/** The Email action parameter that names a template by id or slug. */
export const TEMPLATE_PARAMETER = 'Template';

/** POST /api/email-templates/{id}/preview (Features/EmailTemplates/Preview/Models.cs). */
export interface EmailTemplatePreview {
    subject: string;
    /** Empty when `problem` says the template could not be rendered. */
    html: string;
    status: string;
    /** Whether a workflow naming this template would send it now. Only a published one is sent. */
    sendable: boolean;
    problem: string | null;
    warnings: { field: string; message: string }[];
    notes: string[];
}
