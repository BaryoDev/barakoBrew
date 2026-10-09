'use client';

import { use } from 'react';
import { ContentEditor } from '@/components/content/content-editor';

type SearchParams = { [key: string]: string | string[] | undefined };

/**
 * One entry. `?transition=Approve` opens that transition's dialog, which is the link
 * `{{links.transition "Approve"}}` puts in a barakoCMS 4.8 workflow email.
 */
export default function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = use(params);
  const query = searchParams ? use(searchParams) : undefined;
  const transition = typeof query?.transition === 'string' ? query.transition : null;
  return <ContentEditor id={id} transition={transition} />;
}
