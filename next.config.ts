import type { NextConfig } from "next";

// Domínio do Chatwoot que pode embutir a página /chatwoot-app num iframe.
const CHATWOOT_ORIGIN =
  process.env.CHATWOOT_URL || "https://chatwoot-production-e3ef.up.railway.app";

const nextConfig: NextConfig = {
  // pdfkit precisa dos arquivos de fonte (.afm) do próprio pacote em runtime;
  // bundlado ele perde o caminho (ENOENT Helvetica.afm). Externo resolve.
  serverExternalPackages: ["pdfkit"],
  // Sem isto o Turbopack pode inferir a raiz errada quando existe um
  // package-lock.json perdido acima do repo (ex.: C:\Users\<user>), e aí
  // externos (pdfkit/pino/rimraf) não resolvem no build.
  turbopack: { root: __dirname },
  // (O resgate das etiquetas com /P/ maiúsculo NÃO cabe aqui: o `source` de
  //  redirects casa ignorando a caixa, então "/P/:id" pega também "/p/:id" e o
  //  redirect aponta pra si mesmo — ERR_TOO_MANY_REDIRECTS. Está no
  //  middleware.ts, onde a comparação é de string e respeita a caixa.)
  async headers() {
    return [
      {
        source: "/chatwoot-app",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${CHATWOOT_ORIGIN};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
