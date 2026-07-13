import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit precisa dos arquivos de fonte (.afm) do próprio pacote em runtime;
  // bundlado ele perde o caminho (ENOENT Helvetica.afm). Externo resolve.
  serverExternalPackages: ["pdfkit"],
  // Sem isto o Turbopack pode inferir a raiz errada quando existe um
  // package-lock.json perdido acima do repo (ex.: C:\Users\<user>), e aí
  // externos (pdfkit/pino/rimraf) não resolvem no build.
  turbopack: { root: __dirname },
};

export default nextConfig;
