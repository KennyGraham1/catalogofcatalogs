import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SessionProvider } from '@/components/auth/SessionProvider';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Earthquake Catalogue Platform',
  description: 'Upload, validate, parse, and store earthquake catalogues',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading request headers keeps this layout dynamic. Next.js reads the request
  // CSP for its own scripts; next-themes needs the nonce passed explicitly.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SessionProvider>
          <ErrorBoundary>
            <Layout nonce={nonce}>
              {children}
            </Layout>
            {/* The insights script is served only on Vercel; self-hosted deployments would 404. */}
            {process.env.VERCEL ? <Analytics /> : null}
          </ErrorBoundary>
        </SessionProvider>
      </body>
    </html>
  );
}
