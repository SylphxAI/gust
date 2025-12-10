import './global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://gust.sylphx.com'),
  title: {
    default: 'Gust - High-Performance HTTP Server Framework',
    template: '%s | Gust',
  },
  description:
    'High-performance HTTP server framework for Bun and Node.js. Native Rust acceleration with 220k+ req/s, portable apps for serverless/edge, and batteries-included middleware.',
  keywords: [
    'http server',
    'bun',
    'nodejs',
    'rust',
    'wasm',
    'high performance',
    'serverless',
    'edge',
    'middleware',
    'typescript',
  ],
  authors: [{ name: 'Sylphx', url: 'https://github.com/SylphxAI' }],
  creator: 'Sylphx',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://gust.sylphx.com',
    siteName: 'Gust',
    title: 'Gust - High-Performance HTTP Server Framework',
    description:
      'High-performance HTTP server framework for Bun and Node.js. Native Rust acceleration with 220k+ req/s.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Gust - High-Performance HTTP Server Framework',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gust - High-Performance HTTP Server Framework',
    description:
      'High-performance HTTP server framework for Bun and Node.js. Native Rust acceleration with 220k+ req/s.',
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
