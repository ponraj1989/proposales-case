import * as React from 'react';
import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ title, value, change, changeType = 'neutral', icon: Icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-gray-200 bg-white p-6 shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {Icon && (
          <div className="rounded-lg bg-brand-50 p-2">
            <Icon className="h-5 w-5 text-brand-500" />
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {change && (
          <p
            className={cn('mt-1 text-sm font-medium', {
              'text-success-600': changeType === 'positive',
              'text-error-600': changeType === 'negative',
              'text-gray-500': changeType === 'neutral',
            })}
          >
            {change}
          </p>
        )}
      </div>
    </div>
  );
}
