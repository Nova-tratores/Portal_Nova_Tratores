// NFS-e Nacional (Sefin Nacional) direto, com o certificado A1 da empresa
// (José, 14/10/2026): hoje só o CANCELAMENTO (evento e101101).
//
// Leiaute 1.01 (pedRegEvento/infPedReg), conferido no XSD oficial:
//   infPedReg Id = "PRE" + chave(50) + tipo do evento(6) — pattern PRE[0-9]{56}
//   ordem: tpAmb, verAplic, dhEvento, CNPJAutor, chNFSe, e101101{xDesc, cMotivo, xMotivo}
// Assinatura XMLDSig enveloped no infPedReg: C14N 1.0, RSA-SHA256, digest SHA-256
// (o mesmo que a NFePHP usa). Envio: POST {base}/nfse/{chave}/eventos com mTLS e
// JSON { pedidoRegistroEventoXmlGZipB64 }.
//
// O XML é montado aqui sem espaços entre tags, então a canonicalização C14N do
// infPedReg e do SignedInfo é o próprio texto + o xmlns herdado — sem lib de XML.
import { createHash, createSign } from "crypto";
import { gzipSync, gunzipSync } from "zlib";
import https from "https";
import forge from "node-forge";

const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
export const SEFIN_PRODUCAO = "https://sefin.nfse.gov.br/SefinNacional";
export const SEFIN_RESTRITA = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional";

export type MotivoCancelamento = "1" | "2" | "9";
export const MOTIVOS_CANCELAMENTO: Record<MotivoCancelamento, string> = {
  "1": "Erro na emissão",
  "2": "Serviço não prestado",
  "9": "Outros",
};

interface Certificado { keyPem: string; certPem: string; certB64: string }
const cacheCert = new Map<string, Certificado>();

/** Certificado A1 da empresa (env NFSE_CERT_PFX_BASE64 / NFSE_CERT_SENHA; Castro com sufixo _CASTRO). */
export function certificadoDaEmpresa(empresa: "NOVA" | "CASTRO" = "NOVA"): Certificado {
  const ja = cacheCert.get(empresa);
  if (ja) return ja;
  const suf = empresa === "CASTRO" ? "_CASTRO" : "";
  const b64 = process.env[`NFSE_CERT_PFX_BASE64${suf}`] || "";
  const senha = process.env[`NFSE_CERT_SENHA${suf}`] || "";
  if (!b64 || !senha) throw new Error(`Certificado da NFS-e não configurado (NFSE_CERT_PFX_BASE64${suf} / NFSE_CERT_SENHA${suf}).`);
  // Node (OpenSSL 3) recusa o PKCS12 legado: lê com node-forge e vira PEM
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(Buffer.from(b64, "base64").toString("binary"))), senha);
  const keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0]
    || (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])[0];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!keyBag?.key || !certBags.length) throw new Error("Não consegui ler a chave e o certificado do PFX.");
  const rsa = keyBag.key as forge.pki.rsa.PrivateKey;
  const chavePub = forge.pki.setRsaPublicKey(rsa.n, rsa.e);
  // o certificado do titular é o que casa com a chave privada
  const doTitular = certBags.find((b) => b.cert && forge.pki.publicKeyToPem(b.cert.publicKey) === forge.pki.publicKeyToPem(chavePub))?.cert || certBags[0].cert!;
  const certPem = forge.pki.certificateToPem(doTitular);
  const c: Certificado = {
    keyPem: forge.pki.privateKeyToPem(rsa),
    certPem,
    certB64: certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ""),
  };
  cacheCert.set(empresa, c);
  return c;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
/** "2026-10-14T17:05:09-03:00" (fuso de São Paulo, sem milissegundos) */
export function agoraBR(d = new Date()): string {
  const sp = new Date(d.getTime() - 3 * 3600_000);
  return sp.toISOString().slice(0, 19) + "-03:00";
}
/** CNPJ do emitente dentro da chave da NFS-e (cMun 7 + amb 1 + tpInsc 1 + CNPJ 14 …) */
export const cnpjDaChave = (chave: string) => chave.slice(9, 23);

/** XML do pedido de cancelamento JÁ ASSINADO. Puro (só depende do certificado). */
export function montarCancelamentoAssinado(opts: {
  chave: string; motivo: MotivoCancelamento; texto: string; cert: Certificado; tpAmb?: "1" | "2"; dhEvento?: string;
}): { xml: string; id: string } {
  const chave = String(opts.chave || "").replace(/\D/g, "");
  if (chave.length !== 50) throw new Error("Chave da NFS-e inválida (precisa ter 50 dígitos).");
  const texto = String(opts.texto || "").replace(/\s+/g, " ").trim();
  if (texto.length < 15 || texto.length > 255) throw new Error("O motivo precisa ter entre 15 e 255 letras.");
  if (!MOTIVOS_CANCELAMENTO[opts.motivo]) throw new Error("Motivo de cancelamento inválido.");
  const id = `PRE${chave}101101`;
  const corpo =
    `<tpAmb>${opts.tpAmb || "1"}</tpAmb><verAplic>PortalNT-1.0</verAplic><dhEvento>${opts.dhEvento || agoraBR()}</dhEvento>` +
    `<CNPJAutor>${cnpjDaChave(chave)}</CNPJAutor><chNFSe>${chave}</chNFSe>` +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>${opts.motivo}</cMotivo><xMotivo>${esc(texto)}</xMotivo></e101101>`;
  // C14N do infPedReg: herda o xmlns do pedRegEvento
  const infC14n = `<infPedReg xmlns="${NS_NFSE}" Id="${id}">${corpo}</infPedReg>`;
  const digest = createHash("sha256").update(infC14n, "utf8").digest("base64");
  const signedInfo =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${id}"><Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
    `</Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const assinatura = createSign("RSA-SHA256").update(signedInfo, "utf8").sign(opts.cert.keyPem, "base64");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<pedRegEvento xmlns="${NS_NFSE}" versao="1.01">` +
    `<infPedReg Id="${id}">${corpo}</infPedReg>` +
    `<Signature xmlns="${NS_DSIG}">${signedInfo.replace(` xmlns="${NS_DSIG}"`, "")}` +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${opts.cert.certB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature></pedRegEvento>`;
  return { xml, id };
}

function requisitar(url: string, metodo: "GET" | "POST", cert: Certificado, corpo?: string): Promise<{ status: number; texto: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: metodo,
      key: cert.keyPem, cert: cert.certPem, timeout: 60_000,
      headers: { Accept: "application/json", ...(corpo ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) } : {}) },
    }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, texto: Buffer.concat(partes).toString("utf8") }));
    });
    req.on("timeout", () => { req.destroy(new Error("O sistema nacional não respondeu em 60 s.")); });
    req.on("error", reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

export interface ResultadoCancelamento {
  ok: boolean;
  /** já estava cancelada (E1102) */
  jaCancelada?: boolean;
  erro?: string;
  codigos?: string[];
  /** XML do evento autorizado (protocolo do cancelamento) */
  eventoXml?: string;
  status?: number;
}

/** Cancela a NFS-e no sistema nacional. Escrita REAL quando base = produção. */
export async function cancelarNfseNacional(opts: {
  chave: string; motivo: MotivoCancelamento; texto: string; empresa?: "NOVA" | "CASTRO"; base?: string; tpAmb?: "1" | "2";
}): Promise<ResultadoCancelamento> {
  const cert = certificadoDaEmpresa(opts.empresa || "NOVA");
  const { xml } = montarCancelamentoAssinado({ chave: opts.chave, motivo: opts.motivo, texto: opts.texto, cert, tpAmb: opts.tpAmb });
  const corpo = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: gzipSync(Buffer.from(xml, "utf8")).toString("base64") });
  const base = opts.base || SEFIN_PRODUCAO;
  const r = await requisitar(`${base}/nfse/${opts.chave}/eventos`, "POST", cert, corpo);
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(r.texto); } catch { /* corpo não-JSON */ }
  const b64 = String(j.eventoXmlGZipB64 || "");
  if (r.status >= 200 && r.status < 300 && b64) {
    let eventoXml = "";
    try { eventoXml = gunzipSync(Buffer.from(b64, "base64")).toString("utf8"); } catch { eventoXml = b64; }
    return { ok: true, eventoXml, status: r.status };
  }
  // o Sefin devolve { erro: [{ codigo, descricao }] } (visto no ambiente de testes, 15/10/2026)
  const erros = ([j.erro, j.erros, j.Erros].find((x) => Array.isArray(x)) || []) as Record<string, unknown>[];
  const codigos = erros.map((e) => String(e.Codigo || e.codigo || "")).filter(Boolean);
  const msg = erros.map((e) => `${e.Codigo || e.codigo || ""} ${e.Descricao || e.descricao || ""}${e.Complemento || e.complemento ? ` (${e.Complemento || e.complemento})` : ""}`.trim()).join(" · ")
    || String(j.message || j.mensagem || r.texto || `HTTP ${r.status}`).slice(0, 500);
  return { ok: false, jaCancelada: codigos.includes("E1102"), erro: msg, codigos, status: r.status };
}

export type SituacaoNacional = "autorizada" | "cancelada" | "substituida" | "nao_encontrada" | "erro";
/** Situação da NFS-e direto no sistema nacional (eventos de cancelamento/substituição). Só leitura. */
export async function consultarSituacaoNacional(chave: string, empresa: "NOVA" | "CASTRO" = "NOVA"): Promise<{ situacao: SituacaoNacional; detalhe?: string }> {
  const cert = certificadoDaEmpresa(empresa);
  const k = String(chave || "").replace(/\D/g, "");
  if (k.length !== 50) return { situacao: "erro", detalhe: "chave inválida" };
  try {
    const canc = await requisitar(`${SEFIN_PRODUCAO}/nfse/${k}/eventos/101101/1`, "GET", cert);
    if (canc.status === 200) return { situacao: "cancelada" };
    const subst = await requisitar(`${SEFIN_PRODUCAO}/nfse/${k}/eventos/105102/1`, "GET", cert);
    if (subst.status === 200) return { situacao: "substituida" };
    const nota = await requisitar(`${SEFIN_PRODUCAO}/nfse/${k}`, "GET", cert);
    if (nota.status === 200) return { situacao: "autorizada" };
    if (nota.status === 404) return { situacao: "nao_encontrada" };
    return { situacao: "erro", detalhe: `HTTP ${nota.status}` };
  } catch (e) { return { situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) }; }
}
