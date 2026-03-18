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
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
