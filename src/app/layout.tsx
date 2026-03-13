import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Nova Tratores",
  description: "Portal Corporativo Nova Tratores - Acesso centralizado aos sistemas",
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
