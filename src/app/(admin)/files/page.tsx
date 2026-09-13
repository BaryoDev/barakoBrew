'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  deleteRefusal,
  isForbidden,
  useDeleteFile,
  useFiles,
  useUploadFile,
  type DeleteRefusal,
  type StoredFile,
} from '@/hooks/use-files';
import { useAuth } from '@/hooks/use-auth';
import { apiErrorMessage, getApiUrl } from '@/lib/api';
import { UPLOAD_RULES, canDeleteFile, formatBytes, publicFileLink, uploadProblem } from '@/lib/files';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/patterns/empty-state';
import { ErrorState } from '@/components/patterns/error-state';
import { StatusBadge } from '@/components/patterns/status-badge';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { PaginationControls } from '@/components/patterns/pagination-controls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { IconArchive, IconCopy, IconLock, IconPlus, IconTrash } from '@/components/icons';

const HEAD =
  'h-auto bg-background py-3 text-[10.5px] font-extrabold tracking-[0.12em] uppercase text-[var(--faint)]';

const META = 'text-muted-foreground font-mono text-[11.5px] tabular-nums';

function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}) {
  const upload = useUploadFile();
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(false);

  const problem = file ? uploadProblem(file) : null;
  const refused = upload.isError ? apiErrorMessage(upload.error, 'The upload failed.') : null;
  const canUpload = file !== null && problem === null && !upload.isPending;

  function reset() {
    setFile(null);
    setIsPublic(false);
    upload.reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || problem) return;
    try {
      const uploaded = await upload.mutateAsync({ file, isPublic });
      toast.success(`Uploaded ${uploaded.fileName}`);
      reset();
      onUploaded();
      onOpenChange(false);
    } catch {
      // The reason is rendered in the dialog from upload.error, next to the file it is about.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Upload a file</DialogTitle>
            <DialogDescription>{UPLOAD_RULES}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="file-input">Choose a file</Label>
              <Input
                id="file-input"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif,application/pdf"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  upload.reset();
                }}
              />
              {file && (
                <p className={META}>
                  {file.name}, {formatBytes(file.size)}
                </p>
              )}
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="file-public">Public</Label>
                <p id="file-public-help" className="text-muted-foreground text-xs">
                  Anyone with the link can open a public file. This cannot be changed after upload.
                </p>
              </div>
              <Switch
                id="file-public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
                aria-describedby="file-public-help"
              />
            </div>

            {problem ? (
              <p role="alert" className="text-destructive text-sm">
                {problem}
              </p>
            ) : refused ? (
              <p role="alert" className="text-destructive text-sm">
                {refused}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canUpload}>
              {upload.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FilesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useFiles(page);
  const remove = useDeleteFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [target, setTarget] = useState<StoredFile | null>(null);
  const [refusal, setRefusal] = useState<DeleteRefusal | null>(null);

  const files = data?.items ?? [];

  function closeDelete() {
    setTarget(null);
    setRefusal(null);
  }

  async function onDelete(force: boolean) {
    if (!target) return;
    const name = target.fileName;
    // Deleting the only row on a later page would leave the screen on a page that no longer exists.
    const emptiesPage = files.length === 1 && page > 1;

    try {
      await remove.mutateAsync({ id: target.id, force });
      closeDelete();
      if (emptiesPage) setPage((p) => p - 1);
      toast.success(`Deleted ${name}`);
    } catch (err) {
      const blocked = deleteRefusal(err);
      if (blocked && !force) {
        setRefusal(blocked);
        return;
      }
      closeDelete();
      toast.error(apiErrorMessage(err, 'Could not delete the file.'));
    }
  }

  async function copyLink(file: StoredFile) {
    const link = publicFileLink(file, getApiUrl());
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error(`Could not copy the link. It is ${link}`);
    }
  }

  const uploadButton = (
    <Button size="sm" onClick={() => setUploadOpen(true)}>
      <IconPlus />
      Upload file
    </Button>
  );

  // Listing and uploading need the same capability, so a list that loaded is the evidence that the
  // upload control is worth offering. The roles in the token cannot say that: upload_files can be
  // granted to any role, and the console never sees capabilities.
  const forbidden = isError && isForbidden(error);

  return (
    <>
      <PageHeader
        title="Files"
        description="Images and PDFs uploaded to this tenant, newest first."
        actions={data ? uploadButton : undefined}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : forbidden ? (
        <EmptyState
          icon={IconLock}
          title="Your account cannot manage files"
          description="Listing and uploading files needs the upload_files capability. The Admin role has it by default."
        />
      ) : isError ? (
        <ErrorState entity="files" onRetry={() => refetch()} />
      ) : files.length === 0 ? (
        <EmptyState
          icon={IconArchive}
          title="No files uploaded yet"
          description="Upload an image or a PDF so entries can use it."
          action={uploadButton}
        />
      ) : (
        <>
          <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-background">
                  <TableHead className={`${HEAD} pl-6`}>Name</TableHead>
                  <TableHead className={`${HEAD} hidden sm:table-cell`}>Type</TableHead>
                  <TableHead className={`${HEAD} hidden text-right md:table-cell`}>Size</TableHead>
                  <TableHead className={HEAD}>Visibility</TableHead>
                  <TableHead className={`${HEAD} hidden md:table-cell`}>Uploaded</TableHead>
                  <TableHead className={`${HEAD} pr-6 text-right`}>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id} className="hover:bg-background">
                    <TableCell className="max-w-[18rem] truncate py-3.5 pl-6 text-[13.5px] font-bold">
                      {file.fileName}
                    </TableCell>
                    <TableCell className={`${META} hidden py-3.5 sm:table-cell`}>{file.contentType}</TableCell>
                    <TableCell className={`${META} hidden py-3.5 text-right md:table-cell`}>
                      {formatBytes(file.size)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <StatusBadge tone={file.isPublic ? 'accent' : 'muted'} dot={false}>
                        {file.isPublic ? 'Public' : 'Private'}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className={`${META} hidden py-3.5 md:table-cell`}>
                      {format(new Date(file.createdAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="py-3.5 pr-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {file.isPublic && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyLink(file)}
                            aria-label={`Copy link to ${file.fileName}`}
                          >
                            <IconCopy />
                            Copy link
                          </Button>
                        )}
                        {canDeleteFile(user, file) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTarget(file)}
                            aria-label={`Delete ${file.fileName}`}
                          >
                            <IconTrash />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data && <PaginationControls page={data} onPageChange={setPage} />}
        </>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={() => setPage(1)} />

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && closeDelete()}>
        <AlertDialogContent>
          {refusal ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>This file is still in use</AlertDialogTitle>
                <AlertDialogDescription>
                  {target?.fileName} is used by {refusal.total} {refusal.total === 1 ? 'entry' : 'entries'}.
                  Deleting it anyway leaves them pointing at a file that is gone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="space-y-1 text-sm">
                {refusal.usages.map((usage) => (
                  <li key={usage.id}>
                    <span className="font-medium">{usage.title || 'Untitled entry'}</span>{' '}
                    <span className={META}>
                      {usage.contentType}, {usage.status}
                    </span>
                  </li>
                ))}
                {refusal.total > refusal.usages.length && (
                  <li className="text-muted-foreground">
                    and {refusal.total - refusal.usages.length} more
                  </li>
                )}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="destructive" onClick={() => onDelete(true)} disabled={remove.isPending}>
                  {remove.isPending ? 'Deleting...' : 'Delete anyway'}
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this file?</AlertDialogTitle>
                <AlertDialogDescription>
                  {target?.fileName} and its resized copies will be removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button variant="destructive" onClick={() => onDelete(false)} disabled={remove.isPending}>
                  {remove.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
