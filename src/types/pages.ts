// Types for the Pages module (BarakoCMS.Pages, barakoCMS 4.2.0).

/** One page in `GET /api/pages/tree`. Title and slug are null when the caller may not read them. */
export interface PageTreeItem {
    id: string;
    title: string | null;
    slug: string | null;
    /** Null when the parent chain does not reach a root. Such a page is listed at the top level. */
    path: string | null;
    status: string;
    showInNavigation: boolean;
    order: number | null;
    children: PageTreeItem[];
}

/** The `Modules:Pages` names the API writes the tree through. */
export interface PageTreeOptions {
    contentType: string;
    parentField: string;
    showInNavigationField: string;
    orderField: string;
    titleField: string;
    maxDepth: number;
    reservedSlugs: string[];
    homeSlug: string | null;
}

/** `contract` is the module's own version, independent of `X-Api-Contract-Version`. */
export interface PageTreeResponse {
    contract: number;
    truncated: boolean;
    options: PageTreeOptions;
    items: PageTreeItem[];
}
