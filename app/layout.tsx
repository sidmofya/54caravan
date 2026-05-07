import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The 54 Caravan",
  description: "A mobile-first cinematic portal experience.",
  metadataBase: new URL("https://54caravan.com"),
  openGraph: {
    title: "The 54 Caravan",
    description: "A mobile-first cinematic portal experience.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0905",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-x-hidden">{children}</body>
    </html>
  );
}
