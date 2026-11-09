import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  fallback: ['Arial', 'Helvetica Neue', 'sans-serif'],
  adjustFontFallback: true,
});

export const metadata = { title: 'Toki · Client Automation Dashboard' };

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body className={inter.className} style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
