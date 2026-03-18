import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import Providers from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proposales Platform',
  description: 'Professional proposal management powered by Proposales',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
