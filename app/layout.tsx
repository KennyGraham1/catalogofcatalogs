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
  // Read the nonce injected by middleware. Next.js uses it when rendering its
  // own inline bootstrap scripts, which is what eliminates 'unsafe-inline'.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Expose the nonce so Next.js can apply it to its inline scripts */}
        {nonce && <meta name="csp-nonce" content={nonce} />}
      </head>
      <body className={inter.className}>
        <SessionProvider>
          <ErrorBoundary>
            <Layout>
              {children}
            </Layout>
            <Analytics />
          </ErrorBoundary>
        </SessionProvider>
      </body>
    </html>
  );
}
