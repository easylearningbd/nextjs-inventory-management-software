import type { Metadata } from "next";
import "./gildedglow.css";
import ToasterProvider from "@/components/ToasterProvider";

export const metadata: Metadata = {
  title: "GildedGlow",
  description: "Inventory & POS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ToasterProvider />
      </body>
    </html>
  );
}
