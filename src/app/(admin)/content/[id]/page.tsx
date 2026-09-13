'use client';

import { use } from 'react';
import { ContentEditor } from '@/components/content/content-editor';

export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ContentEditor id={id} />;
}
