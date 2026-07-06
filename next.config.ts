import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit precisa dos arquivos de fonte (.afm) do próprio pacote em runtime;
  // bundlado ele perde o caminho (ENOENT Helvetica.afm). Externo resolve.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
