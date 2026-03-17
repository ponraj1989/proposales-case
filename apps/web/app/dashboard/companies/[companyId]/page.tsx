'use client';

import { useParams, useRouter } from 'next/navigation';
import {
  PageHeader,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  DataTable,
  Badge,
  type Column,
} from '@proposales/ui';
import { useCompanyTemplates } from '@/lib/hooks';

export default function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const id = Number(companyId);
  const { data, isLoading, error } = useCompanyTemplates(id);

  const templates: Record<string, unknown>[] = data?.data
    ? Array.isArray(data.data) ? data.data : [data.data]
    : [];

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: 'title',
      header: 'Template',
      render: (item) => (
        <p className="font-medium text-gray-900">{(item.title || 'Untitled') as string}</p>
      ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (item) => <Badge variant="outline">{(item.language || '—') as string}</Badge>,
    },
    {
      key: 'uuid',
      header: 'UUID',
      render: (item) => (
        <span className="font-mono text-xs text-gray-500">{(item.uuid as string)?.slice(0, 12)}...</span>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={`Company #${companyId}`}
        description="Company templates"
        actions={
          <Button variant="outline" onClick={() => router.push('/dashboard/companies')}>
            ← Back
          </Button>
        }
      />

      {error && (
        <div className="rounded-card border border-error-200 bg-error-50 p-4">
          <p className="text-sm text-error-700">{error.message}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Templates ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={templates}
            keyExtractor={(item) => item.uuid as string}
            loading={isLoading}
            emptyMessage="No templates found for this company."
          />
        </CardContent>
      </Card>
    </div>
  );
}
