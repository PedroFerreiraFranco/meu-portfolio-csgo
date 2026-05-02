import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Inventory",
  description: "Portfólio e estudo consumindo CS2-API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
