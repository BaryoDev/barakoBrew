'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAccess } from '@/hooks/use-access';
import { useSchemas } from '@/hooks/use-schemas';
import {
  ImportRefused,
  sectionSize,
  useConfigRoutes,
  useExportBundle,
  useImportBundle,
  type ImportReport,
  type PortabilityBundle,
} from '@/hooks/use-portability';
import { apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { IconArchive, IconDisk, IconWarning } from '@/components/icons';

const CARD = 'bg-card rounded-xl border p-6 shadow-[var(--shadow-card)]';

// Who the page is offered to when the API cannot say what the caller holds (no /api/me before 4.7).
const LEGACY_ROLES = ['SuperAdmin', 'Admin'] as const;

/** A section is a list of documents, or an object from each document's key to the document. */
function isSection(value: unknown): value is PortabilityBundle['contents'] {
  return typeof value === 'object' && value !== null;
}

/** What a bundle has to look like before anything is sent to the server. */
function readBundle(text: string): PortabilityBundle {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('That file is not a content bundle.');
  }

  const bundle = parsed as Partial<PortabilityBundle>;

  // Both sections, checked here rather than left to the server. A file with the right extension and
  // the wrong shape otherwise reaches the import endpoint as an empty bundle and reports a
  // successful import of nothing, which reads as "it worked". A section is an array (a bundle from
  // before the config routes) or an object keyed by id or name (what the config export writes).
  if (!isSection(bundle.contentTypes) || !isSection(bundle.contents)) {
    throw new Error('That file is missing contentTypes or contents, so it is not a bundle this can import.');
  }

  return {
    ...(typeof bundle.version === 'number' ? { version: bundle.version } : {}),
    contentTypes: bundle.contentTypes,
    contents: bundle.contents,
  };
}

/** One line each, in the tone of the warning below the counts. */
function Problems({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;

  return (
    <ul role="alert" className="text-destructive mt-3 grid gap-1 text-[12.5px]">
      {lines.map((line, i) => (
        <li key={`${i}-${line}`}>{line}</li>
      ))}
    </ul>
  );
}

function ReportSummary({ report }: { report: ImportReport }) {
  const rows: { label: string; value: number }[] = [
    { label: 'Content types created', value: report.contentTypesCreated },
    { label: 'Content types updated', value: report.contentTypesUpdated },
    { label: 'Entries created', value: report.contentsCreated },
  ];

  return (
    <div className="mt-4 rounded-lg border p-4">
      <p className="text-[13px] font-bold">
        {report.dryRun ? 'This is what an import would do' : 'Imported'}
      </p>
      <dl className="mt-3 grid gap-2 text-[13px]">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-mono tabular-nums font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <Problems lines={report.problems ?? []} />

      {report.contentsWithoutContentType > 0 && (
        <p className="text-warning mt-3 flex gap-2 text-[12.5px]">
          <IconWarning aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {report.contentsWithoutContentType} entries name a content type that is in neither this
            bundle nor your CMS. They are still created, but nothing knows which of their fields are
            public, so they will not appear in public search until a matching content type exists.
          </span>
        </p>
      )}
    </div>
  );
}

export default function PortabilityPage() {
  const exportBundle = useExportBundle();
  const importBundle = useImportBundle();

  // On the config routes the page asks for what the caller holds before offering the buttons. The
  // API still decides, so a refusal comes back as lines either way.
  const configRoutes = useConfigRoutes();
  const access = useAccess();
  const { data: schemas, isLoading: typesLoading } = useSchemas(configRoutes);
  const canManageConfig = !configRoutes || access.can('manage_config', LEGACY_ROLES);
  const canImportContent = !configRoutes || access.can('import_content', LEGACY_ROLES);
  const waitingForTypes = configRoutes && typesLoading;
  const canExport = canManageConfig;
  const canImport = canManageConfig && canImportContent;
  const importBlocked = !canManageConfig
    ? 'Importing needs the manage_config capability, which your role does not have.'
    : !canImportContent
      ? 'Importing needs the import_content capability, which your role does not have.'
      : '';

  const fileInput = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<PortabilityBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  const onExport = async () => {
    try {
      const data = await exportBundle.mutateAsync(undefined);

      // Built in the browser from the response rather than linked to the endpoint directly, because
      // the endpoint needs an Authorization header and a plain anchor cannot send one.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `barakocms-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      const left = data.withheld?.length ? ` Left out, because your role may not read them: ${data.withheld.join(', ')}.` : '';
      toast.success(
        `Exported ${sectionSize(data.contentTypes ?? [])} content types and ${sectionSize(data.contents ?? [])} entries.${left}`
      );
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  const onChooseFile = async (file: File | undefined) => {
    setReport(null);
    setProblems([]);
    setBundle(null);
    setFileName('');

    if (!file) return;

    try {
      const parsed = readBundle(await file.text());
      setBundle(parsed);
      setFileName(file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That file could not be read.');
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!bundle) return;

    setProblems([]);
    try {
      const knownTypes = schemas ? schemas.map((s) => s.name) : null;
      setReport(await importBundle.mutateAsync({ bundle, dryRun, knownTypes }));
      if (!dryRun) toast.success('Import finished.');
    } catch (error) {
      if (error instanceof ImportRefused) {
        // Each reason on its own line under the buttons, where it stays readable while the file is
        // fixed. The toast says there is more than the first line.
        setReport(null);
        setProblems(error.lines);
        const more = error.lines.length > 1 ? ` (${error.lines.length - 1} more below)` : '';
        toast.error(`${error.lines[0]}${more}`);
        return;
      }
      toast.error(apiErrorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Export and import"
        description="Take your content types and entries out as a file, or bring a file in."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-[15px] font-bold">Export</h2>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Downloads every content type and entry in this tenant as one JSON file. It holds no
            users, no roles and no credentials, so it is safe to hand to someone who is evaluating
            whether they could leave.
          </p>
          <Button className="mt-4" onClick={onExport} disabled={exportBundle.isPending || !canExport}>
            <IconArchive />
            {exportBundle.isPending ? 'Preparing...' : 'Download bundle'}
          </Button>
          {!canExport && (
            <p className="text-muted-foreground mt-2 text-[12.5px]">
              Exporting needs the manage_config capability, which your role does not have.
            </p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-[15px] font-bold">Import</h2>
          <p className="text-muted-foreground mt-1.5 text-[13px]">
            Adds the content types and entries in a bundle to this tenant. Entries are created, never
            matched to existing ones, so importing the same bundle twice gives you two copies.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a bundle file"
            onChange={(e) => onChooseFile(e.target.files?.[0])}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!canImport}>
              <IconDisk />
              Choose a file
            </Button>
            {fileName && (
              <span className="text-muted-foreground font-mono text-[12px]">{fileName}</span>
            )}
          </div>
          {!canImport && <p className="text-muted-foreground mt-2 text-[12.5px]">{importBlocked}</p>}

          {bundle && (
            <>
              <p className="text-muted-foreground mt-3 text-[13px]">
                {sectionSize(bundle.contentTypes)} content types and {sectionSize(bundle.contents)}{' '}
                entries in this file.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Preview first, and it is the button that is not destructive, so it leads. The
                    import itself creates records that have to be deleted one at a time to undo. */}
                <Button
                  variant="outline"
                  onClick={() => runImport(true)}
                  disabled={importBundle.isPending || !canImport || waitingForTypes}
                >
                  Preview
                </Button>
                <Button
                  onClick={() => runImport(false)}
                  disabled={importBundle.isPending || !canImport || waitingForTypes}
                >
                  {importBundle.isPending ? 'Working...' : 'Import'}
                </Button>
              </div>
            </>
          )}

          <Problems lines={problems} />

          {report && <ReportSummary report={report} />}
        </section>
      </div>
    </>
  );
}
