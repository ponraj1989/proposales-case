'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

export interface ChartConfig {
  type: 'chart';
  chart_type: string;
  title: string;
  subtitle?: string;
  data: Record<string, string | number>[];
  x_key: string;
  y_key: string;
  series?: { key: string; label: string; color?: string; type?: string }[];
  x_label?: string;
  y_label?: string;
  colors: string[];
  show_legend: boolean;
  show_grid: boolean;
  height: number;
  value_prefix: string;
  value_suffix: string;
  stacked: boolean;
  insight?: string;
}

const DEFAULT_COLORS = [
  '#4461D7', '#36B37E', '#FF5630', '#FFAB00', '#6554C0',
  '#00B8D9', '#FF8B00', '#57D9A3', '#8777D9', '#FFC400',
];

function fmtVal(v: number, prefix: string, suffix: string) {
  const formatted = v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v);
  return `${prefix}${formatted}${suffix}`;
}

function CustomTooltip({
  active,
  payload,
  label,
  prefix,
  suffix,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  prefix: string;
  suffix: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500">{entry.name}:</span>
          <span className="font-semibold text-gray-800">
            {prefix}{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}{suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({ config }: { config: ChartConfig }) {
  const {
    chart_type, title, subtitle, data, x_key, y_key,
    series, colors, show_legend, show_grid, height,
    value_prefix, value_suffix, stacked, insight,
    x_label, y_label,
  } = config;

  const palette = colors?.length ? colors : DEFAULT_COLORS;

  const chart = useMemo(() => {
    const commonAxisProps = {
      tick: { fontSize: 11, fill: '#6B7280' },
      axisLine: { stroke: '#E5E7EB' },
      tickLine: false,
    };
    const grid = show_grid ? <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" /> : null;
    const legend = show_legend ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} /> : null;
    const tooltip = (
      <Tooltip
        content={<CustomTooltip prefix={value_prefix} suffix={value_suffix} />}
      />
    );

    switch (chart_type) {
      case 'bar':
      case 'stacked_bar': {
        const isStacked = chart_type === 'stacked_bar' || stacked;
        const seriesList = series?.length
          ? series
          : [{ key: y_key, label: y_label || y_key, color: palette[0] }];
        return (
          <BarChart data={data}>
            {grid}
            <XAxis dataKey={x_key} {...commonAxisProps} label={x_label ? { value: x_label, position: 'insideBottom', offset: -5, fontSize: 11 } : undefined} />
            <YAxis {...commonAxisProps} tickFormatter={(v: number) => fmtVal(v, value_prefix, value_suffix)} label={y_label ? { value: y_label, angle: -90, position: 'insideLeft', fontSize: 11 } : undefined} />
            {tooltip}
            {legend}
            {seriesList.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color || palette[i % palette.length]}
                stackId={isStacked ? 'stack' : undefined}
                radius={isStacked ? undefined : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        );
      }

      case 'line': {
        const seriesList = series?.length
          ? series
          : [{ key: y_key, label: y_label || y_key, color: palette[0] }];
        return (
          <LineChart data={data}>
            {grid}
            <XAxis dataKey={x_key} {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v: number) => fmtVal(v, value_prefix, value_suffix)} />
            {tooltip}
            {legend}
            {seriesList.map((s, i) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color || palette[i % palette.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        );
      }

      case 'area': {
        const seriesList = series?.length
          ? series
          : [{ key: y_key, label: y_label || y_key, color: palette[0] }];
        return (
          <AreaChart data={data}>
            {grid}
            <XAxis dataKey={x_key} {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v: number) => fmtVal(v, value_prefix, value_suffix)} />
            {tooltip}
            {legend}
            {seriesList.map((s, i) => {
              const color = s.color || palette[i % palette.length];
              return (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  stackId={stacked ? 'stack' : undefined}
                />
              );
            })}
          </AreaChart>
        );
      }

      case 'pie':
      case 'donut': {
        const isDonut = chart_type === 'donut';
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey={y_key}
              nameKey={x_key}
              cx="50%"
              cy="50%"
              innerRadius={isDonut ? '55%' : 0}
              outerRadius="80%"
              paddingAngle={2}
              label={({ name, percent }: { name: string; percent: number }) =>
                `${name} ${(percent * 100).toFixed(0)}%`
              }
              labelLine={{ stroke: '#9CA3AF', strokeWidth: 1 }}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            {tooltip}
            {legend}
          </PieChart>
        );
      }

      case 'radar': {
        const seriesList = series?.length
          ? series
          : [{ key: y_key, label: y_label || y_key, color: palette[0] }];
        return (
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="#E5E7EB" />
            <PolarAngleAxis dataKey={x_key} tick={{ fontSize: 11, fill: '#6B7280' }} />
            <PolarRadiusAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
            {tooltip}
            {legend}
            {seriesList.map((s, i) => {
              const color = s.color || palette[i % palette.length];
              return (
                <Radar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                />
              );
            })}
          </RadarChart>
        );
      }

      case 'composed': {
        const seriesList = series?.length
          ? series
          : [{ key: y_key, label: y_label || y_key, color: palette[0], type: 'bar' as const }];
        return (
          <ComposedChart data={data}>
            {grid}
            <XAxis dataKey={x_key} {...commonAxisProps} />
            <YAxis {...commonAxisProps} tickFormatter={(v: number) => fmtVal(v, value_prefix, value_suffix)} />
            {tooltip}
            {legend}
            {seriesList.map((s, i) => {
              const color = s.color || palette[i % palette.length];
              switch (s.type) {
                case 'line':
                  return <Line key={s.key} dataKey={s.key} name={s.label} stroke={color} strokeWidth={2} dot={{ r: 3 }} />;
                case 'area':
                  return <Area key={s.key} dataKey={s.key} name={s.label} stroke={color} fill={color} fillOpacity={0.15} />;
                default:
                  return <Bar key={s.key} dataKey={s.key} name={s.label} fill={color} radius={[4, 4, 0, 0]} />;
              }
            })}
          </ComposedChart>
        );
      }

      case 'funnel': {
        // Render funnel as horizontal bars sorted by value descending
        const sorted = [...data].sort(
          (a, b) => (Number(b[y_key]) || 0) - (Number(a[y_key]) || 0),
        );
        const maxVal = Math.max(...sorted.map((d) => Number(d[y_key]) || 0), 1);
        return (
          <div className="space-y-2 px-2 py-1">
            {sorted.map((item, i) => {
              const val = Number(item[y_key]) || 0;
              const pct = (val / maxVal) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-24 text-right text-xs font-medium text-gray-600 capitalize truncate">
                    {String(item[x_key])}
                  </span>
                  <div className="flex-1 h-7 bg-gray-50 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2 text-xs font-bold text-white transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 8)}%`,
                        backgroundColor: palette[i % palette.length],
                      }}
                    >
                      {val}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'heatmap': {
        // Simple heatmap grid using the data
        const values = data.map((d) => Number(d[y_key]) || 0);
        const maxVal = Math.max(...values, 1);
        return (
          <div className="grid gap-1 px-2 py-1" style={{ gridTemplateColumns: `repeat(${Math.min(data.length, 7)}, 1fr)` }}>
            {data.map((item, i) => {
              const val = Number(item[y_key]) || 0;
              const intensity = val / maxVal;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-md flex flex-col items-center justify-center text-xs"
                  style={{
                    backgroundColor: `${palette[0]}${Math.round(intensity * 200 + 20).toString(16).padStart(2, '0')}`,
                    color: intensity > 0.5 ? 'white' : '#374151',
                  }}
                  title={`${item[x_key]}: ${val}`}
                >
                  <span className="font-medium truncate max-w-full px-1">{String(item[x_key])}</span>
                  <span className="font-bold">{val}</span>
                </div>
              );
            })}
          </div>
        );
      }

      default:
        return (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">
            Unsupported chart type: {chart_type}
          </div>
        );
    }
  }, [chart_type, data, x_key, y_key, series, palette, show_legend, show_grid, stacked, value_prefix, value_suffix, x_label, y_label]);

  const isSvgChart = !['funnel', 'heatmap'].includes(chart_type);

  return (
    <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50">
            <svg className="h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            {chart_type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 py-4">
        {isSvgChart ? (
          <ResponsiveContainer width="100%" height={height}>
            {chart as React.ReactElement}
          </ResponsiveContainer>
        ) : (
          chart
        )}
      </div>

      {/* Insight */}
      {insight && (
        <div className="border-t border-gray-100 bg-brand-50/50 px-5 py-3">
          <div className="flex items-start gap-2">
            <svg className="h-4 w-4 text-brand-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <p className="text-xs text-brand-700">{insight}</p>
          </div>
        </div>
      )}
    </div>
  );
}
