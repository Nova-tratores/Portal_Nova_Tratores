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
  // Página pública da garantia Mahindra (QR code do adesivo). Arquivo estático
  // em public/garantia/ — fora do (portal), sem login.
  // Notas fiscais mudaram do Estoque para o Financeiro (22/10/2026): links e
  // favoritos antigos seguem valendo (a query ?campo=&q= vai junto).
  // Telas aposentadas em 29/10/2026 (o arquivo /financeiro/notas cobre as duas):
  // /ajustes/notas (NF de venda ao vivo na Omie) → saída; /visual-estoque/notas-entrada → entrada.
  async redirects() {
    return [
      { source: "/estoque/notas", destination: "/financeiro/notas", permanent: false },
      // Recebimentos (Omie) virou parte da tela única de Recebimentos (10/11/2026).
      { source: "/estoque/recebimentos-omie", destination: "/estoque/recebimentos", permanent: false },
      // telas de contas que saíram do Ajustes para o Financeiro › Caixa (09/11/2026)
      { source: "/ajustes/correcao-contas", destination: "/financeiro/caixa/correcao-contas", permanent: false },
      { source: "/ajustes/baixa-contas", destination: "/financeiro/caixa/baixar-contas", permanent: false },
      { source: "/ajustes/boletos-fornecedor", destination: "/financeiro/caixa/boletos-fornecedor", permanent: false },
      { source: "/ajustes/notas", destination: "/financeiro/notas?tipo=saida", permanent: false },
      { source: "/visual-estoque/notas-entrada", destination: "/financeiro/notas?tipo=entrada", permanent: false },
    ];
  },
  async rewrites() {
    return [
      { source: "/garantia", destination: "/garantia/index.html" },
      // QR por trator (adesivo de 30 mm): /garantia/K7P2QX abre a mesma página,
      // que lê o código do endereço. O middleware leva o /GARANTIA/ maiúsculo do QR para cá.
      // QUALQUER coisa depois de /garantia/ abre a página (endereço digitado errado não dá 404);
      // as fotos, o manifest e o sw.js são arquivos de public/ e vêm antes desta regra.
      { source: "/garantia/:resto+", destination: "/garantia/index.html" },
      // Roleta da Black Friday 2026 (13/11/2026): página pública em public/black-friday/, sem login.
      // Um link por setor: /black-friday?setor=comercial | posvendas | pecas. Grava pelas funções do sql/campanhas.sql.
      { source: "/black-friday", destination: "/black-friday/index.html" },
    ];
  },
  async headers() {
    return [
      {
        // O SW da página da garantia mora em /garantia/ mas cuida de "/garantia"
        // (sem barra) — precisa da permissão de escopo. no-cache: versão nova
        // do SW chega na próxima visita.
        source: "/garantia/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/garantia" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
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
