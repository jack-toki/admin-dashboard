import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JRL Finance",
  description: "Personal finance dashboard",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#CFCFCE" },
    { media: "(prefers-color-scheme: dark)",  color: "#0B1722" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
