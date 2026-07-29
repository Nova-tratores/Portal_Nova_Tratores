import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Nova Tratores",
  description: "Portal Corporativo Nova Tratores - Acesso centralizado aos sistemas",
  // PWA — deixa "instalar na tela inicial" (some a barra do navegador no celular).
  // Tudo aditivo: no computador nada muda.
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Portal NT" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
  // deixa o usuário dar zoom (acessibilidade); não trava a escala
  maximumScale: 5,
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
