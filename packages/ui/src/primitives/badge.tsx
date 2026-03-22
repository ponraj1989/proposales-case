import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-700',
        primary: 'bg-brand-100 text-brand-700',
        success: 'bg-success-100 text-success-700',
        warning: 'bg-warning-100 text-warning-700',
        error: 'bg-error-100 text-error-700',
        outline: 'border border-gray-300 text-gray-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function StatusBadge({ status }: { status: string | null }) {
  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    draft: { variant: 'default', label: 'Draft' },
    template: { variant: 'primary', label: 'Template' },
    active: { variant: 'primary', label: 'Sent' },
    sent: { variant: 'primary', label: 'Sent' },
    viewed: { variant: 'warning', label: 'Viewed' },
    expired: { variant: 'warning', label: 'Expired' },
    accepted: { variant: 'success', label: 'E-signed' },
    signed: { variant: 'success', label: 'E-signed' },
    rejected: { variant: 'error', label: 'Rejected' },
    withdrawn: { variant: 'default', label: 'Withdrawn' },
    replaced: { variant: 'default', label: 'Replaced' },
  };

  const { variant, label } = config[status ?? ''] ?? { variant: 'default' as const, label: status ?? 'Unknown' };

  return <Badge variant={variant}>{label}</Badge>;
}
