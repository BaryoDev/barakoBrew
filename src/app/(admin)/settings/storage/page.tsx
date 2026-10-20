'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  useSaveStorageSettings,
  useStorageSettings,
  useTestStorageSettings,
} from '@/hooks/use-storage-settings';
import { apiErrorMessage } from '@/lib/api';
import { useAccess } from '@/hooks/use-access';
import { PageHeader } from '@/components/patterns/page-header';
import { TableSkeleton } from '@/components/patterns/table-skeleton';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import type {
  StorageProvider,
  StorageSettings,
  StorageSettingsRequest,
  StorageTestResult,
} from '@/types/storage-settings';

interface Form {
  provider: StorageProvider;
  bucket: string;
  region: string;
  serviceUrl: string;
  publicBaseUrl: string;
  usePublicReadAcl: boolean;
  accessKey: string;
  /** Only what was typed. Never filled from the API, which does not send it. */
  secretKey: string;
}

function initialForm(data: StorageSettings): Form {
  const s3 = data.s3;
  return {
    provider: data.provider === 's3' ? 's3' : 'postgres',
    bucket: s3?.bucket ?? '',
    region: s3?.region ?? 'us-east-1',
    serviceUrl: s3?.serviceUrl ?? '',
    publicBaseUrl: s3?.publicBaseUrl ?? '',
    usePublicReadAcl: s3?.usePublicReadAcl ?? false,
    accessKey: s3?.accessKey ?? '',
    secretKey: '',
  };
}

function toRequest(form: Form, data: StorageSettings): StorageSettingsRequest {
  if (form.provider === 'postgres') return { provider: 'postgres' };
  return {
    provider: 's3',
    s3: {
      bucket: form.bucket.trim(),
      region: form.region.trim(),
      serviceUrl: form.serviceUrl.trim() || null,
      publicBaseUrl: form.publicBaseUrl.trim() || null,
      usePublicReadAcl: form.usePublicReadAcl,
      forcePathStyle: data.s3?.forcePathStyle ?? true,
      accessKey: form.accessKey.trim(),
      // Null keeps the stored secret, so a blank box never clears it.
      secretKey: form.secretKey === '' ? null : form.secretKey,
    },
  };
}

function providerName(provider: string) {
  return provider === 's3' ? 'S3' : 'Database';
}

export default function StorageSettingsPage() {
  const { data, isLoading } = useStorageSettings();
  if (isLoading || !data) return <TableSkeleton />;
  return <StorageForm data={data} />;
}

function StorageForm({ data }: { data: StorageSettings }) {
  const save = useSaveStorageSettings();
  const test = useTestStorageSettings();
  const canChange = useAccess().can('manage_storage', ['SuperAdmin', 'Admin']);

  const [form, setForm] = useState<Form>(() => initialForm(data));
  // The request a test passed for, as text. Any edit makes the form differ from it, which is what
  // clears the pass.
  const [passedFor, setPassedFor] = useState<string | null>(null);
  const [result, setResult] = useState<StorageTestResult | null>(null);
  const [replacingSecret, setReplacingSecret] = useState(false);
  const [saved, setSaved] = useState(false);

  const locked = data.readOnly || !canChange;
  const s3Available = data.availableProviders.includes('s3');
  const secretStored = !!data.s3?.secretSet && !data.s3.secretUnreadable;
  const showSecretSet = secretStored && !replacingSecret;
  const request = toRequest(form, data);
  const requestKey = JSON.stringify(request);
  const testPassed = passedFor === requestKey;
  const needsTest = form.provider === 's3';
  const canSave = !locked && !save.isPending && (!needsTest || testPassed);

  const edit = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const runTest = () => {
    const sent = requestKey;
    test.mutate(request, {
      onSuccess: (outcome) => {
        setResult(outcome);
        setPassedFor(outcome.ok ? sent : null);
      },
      onError: (error) => {
        setResult(null);
        setPassedFor(null);
        toast.error(apiErrorMessage(error, 'The connection could not be tested.'));
      },
    });
  };

  const submit = () => {
    save.mutate(request, {
      onSuccess: (fresh) => {
        setForm(initialForm(fresh));
        setSaved(true);
        setReplacingSecret(false);
        setPassedFor(null);
        toast.success('Storage settings saved');
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'The settings could not be saved.')),
    });
  };

  return (
    <>
      <PageHeader
        title="Storage"
        description="Where new uploads go. Files already stored stay where they are."
      />

      <div className="max-w-2xl space-y-4">
        {data.readOnly && (
          <Card>
            <CardContent className="pt-6 text-sm" data-testid="storage-read-only">
              Storage is set in the deployment&apos;s configuration, so it cannot be changed here.
              {data.environmentKeys.length > 0 && (
                <>
                  {' '}Set by{' '}
                  {data.environmentKeys.map((key, i) => (
                    <span key={key}>
                      {i > 0 && ', '}
                      <code>{`FILES__S3__${key.toUpperCase()}`}</code>
                    </span>
                  ))}
                  . Remove them and restart to choose it here.
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SegmentedControl
              aria-label="Provider"
              value={form.provider}
              disabled={locked}
              onValueChange={(value) => edit({ provider: value as StorageProvider })}
            >
              <SegmentedControlItem value="postgres">Database</SegmentedControlItem>
              <SegmentedControlItem value="s3" disabled={!s3Available}>
                S3
              </SegmentedControlItem>
            </SegmentedControl>
            {!s3Available && (
              <p className="text-muted-foreground text-xs">
                S3 is not installed on this deployment. Add <code>BarakoCMS.Files.S3</code> and restart.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              New uploads go to {providerName(data.activeProvider)} right now.
            </p>
          </CardContent>
        </Card>

        {form.provider === 's3' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">S3 bucket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="s3-bucket">Bucket</Label>
                <Input
                  id="s3-bucket"
                  value={form.bucket}
                  disabled={locked}
                  onChange={(e) => edit({ bucket: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-region">Region</Label>
                <Input
                  id="s3-region"
                  value={form.region}
                  disabled={locked}
                  placeholder="us-east-1"
                  onChange={(e) => edit({ region: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-endpoint">Endpoint (optional)</Label>
                <Input
                  id="s3-endpoint"
                  value={form.serviceUrl}
                  disabled={locked}
                  placeholder="https://s3.example.com"
                  onChange={(e) => edit({ serviceUrl: e.target.value })}
                />
                <p className="text-muted-foreground text-xs">
                  Leave empty for AWS. Set it for R2, SeaweedFS, Garage or another S3-compatible store.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-public-url">Public base URL (optional)</Label>
                <Input
                  id="s3-public-url"
                  value={form.publicBaseUrl}
                  disabled={locked}
                  placeholder="https://cdn.example.com"
                  onChange={(e) => edit({ publicBaseUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="s3-public-acl"
                    checked={form.usePublicReadAcl}
                    disabled={locked}
                    onCheckedChange={(checked) => edit({ usePublicReadAcl: checked === true })}
                  />
                  <Label htmlFor="s3-public-acl">Use the public-read ACL</Label>
                </div>
                <p className="text-muted-foreground text-xs">
                  Off by default. R2, SeaweedFS and Garage do not support object ACLs, so leave it
                  off there and serve public files through the public base URL.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-access-key">Access key</Label>
                <Input
                  id="s3-access-key"
                  autoComplete="off"
                  value={form.accessKey}
                  disabled={locked}
                  onChange={(e) => edit({ accessKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-secret-key">Secret key</Label>
                {showSecretSet ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Secret set</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => setReplacingSecret(true)}
                    >
                      Replace
                    </Button>
                  </div>
                ) : (
                  <Input
                    id="s3-secret-key"
                    type="password"
                    autoComplete="new-password"
                    value={form.secretKey}
                    disabled={locked}
                    placeholder={data.s3?.secretUnreadable ? 'Stored, but unreadable. Enter it again.' : 'Not set'}
                    onChange={(e) => edit({ secretKey: e.target.value })}
                  />
                )}
                <p className="text-muted-foreground text-xs">
                  Stored encrypted and never shown again. Leaving it blank keeps the stored one.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {result && !test.isPending && (
          <Card>
            <CardContent className="pt-6 text-sm" role="status" data-testid="storage-test-result">
              {result.ok ? (
                <p>Connection works. {result.message}</p>
              ) : (
                <p>
                  The test failed at the <strong>{result.step ?? 'unknown'}</strong> step
                  {result.errorCode ? <> with <code>{result.errorCode}</code></> : null}.{' '}
                  {result.message}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          {needsTest && (
            <Button variant="outline" onClick={runTest} disabled={locked || test.isPending}>
              {test.isPending ? 'Testing…' : 'Test connection'}
            </Button>
          )}
          <Button onClick={submit} disabled={!canSave}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {needsTest && !testPassed && !locked && (
          <p className="text-muted-foreground text-xs">
            Save unlocks once a test passes for the values above. Changing any of them asks for a new test.
          </p>
        )}
        {!data.readOnly && !canChange && (
          <p className="text-muted-foreground text-xs">
            Changing storage needs the Manage storage capability, which your roles do not hold.
          </p>
        )}
        {saved && (
          <p className="text-sm" role="status">
            Saved. New uploads use {providerName(form.provider)} from now on. Files already stored stay
            where they are and keep downloading.
          </p>
        )}
        {data.updatedAt && (
          <p className="text-muted-foreground text-xs">
            Last changed {new Date(data.updatedAt).toLocaleString()}
            {data.updatedBy ? ` by ${data.updatedBy}` : ''}.
          </p>
        )}
      </div>
    </>
  );
}
