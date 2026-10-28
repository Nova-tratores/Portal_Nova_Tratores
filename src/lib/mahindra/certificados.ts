// Certificados de garantia do portal de concessionárias da Mahindra (dealerportal.mahindrabrasil.com.br,
// aba "Garantia"). Leitura PURA do HTML (testes em __tests__/certificados.test.ts); quem baixa as
// páginas é ./portal-dealer-server.ts. O certificado traz a DATA DA ENTREGA TÉCNICA — a partir dela a
// loja conta a entrega do trator (José, 27/10/2026): 30/60/90 dias, revisões e a previsão da 300 h.

export interface LinhaCertificado {
  itemId: number;
  proprietario: string;
  status: string;
  chassi: string;
  criadoEm: string | null;
  modelo: string;
}

export interface DocumentoCertificado { tipo: string; url: string; data: string | null }

export interface Certificado {
  itemId: number;
  status: string | null;
  modelo: string | null;
  rodagem: string | null;
  chassi: string;
  motor: string | null;
  bombaInjetora: string | null;
  nfMahindra: string | null;
  horasEntrega: number | null;
  bateriaSerie: string | null;
  bateriaMarca: string | null;
  proprietario: string | null;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  concessionaria: string | null;
  entregaTecnica: boolean | null;
  responsavelTecnico: string | null;
  /** data da entrega técnica (ISO) */
  dataEntrega: string | null;
  nfConcessionaria: string | null;
  /** data da NF da concessionária (ISO) */
  dataNfConcessionaria: string | null;
  banco: string | null;
  linhaCredito: string | null;
  documentos: DocumentoCertificado[];
}

const BASE = 'https://dealerportal.mahindrabrasil.com.br';

/** O PDF do certificado de garantia assinado entre os documentos anexados (senão o primeiro). */
export function pdfDoCertificado<T extends { tipo: string; url: string }>(docs: T[] | null | undefined): T | null {
  const l = docs || [];
  return l.find((d) => /certificado/i.test(d.tipo)) || l[0] || null;
}

const entidades = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const limpo = (s: string | null | undefined) => { const t = entidades(String(s ?? '')).replace(/\s+/g, ' ').trim(); return t || null; };
const semTags = (s: string) => s.replace(/<[^>]*>/g, ' ');

/** "20/10/2026" (ou "20/10/2026 14:46") → "2026-10-20". */
export function dataBRparaISO(s: string | null | undefined): string | null {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Chassi do portal vem às vezes com ponto ou espaço no fim ("MDI09520PT0006593."). */
export const chassiLimpo = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Linhas da lista de certificados (grade da aba Garantia). */
export function lerListaCertificados(html: string): LinhaCertificado[] {
  const linhas: LinhaCertificado[] = [];
  for (const tr of html.matchAll(/<tr[^>]*class="dxgvDataRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const id = tr[1].match(/CERTEDIT\/mid\/\d+\/ItemId\/(\d+)/);
    if (!id) continue;
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limpo(semTags(m[1])) || '');
    linhas.push({
      itemId: Number(id[1]), proprietario: tds[0] || '', status: tds[1] || '', chassi: chassiLimpo(tds[3]),
      criadoEm: tds[4] || null, modelo: tds[5] || '',
    });
  }
  return linhas;
}

/** Valor de um campo do formulário do certificado pelo fim do id ("txtNrMotor_I"). */
function campo(html: string, sufixo: string): string | null {
  const re = new RegExp(`<input[^>]*id="[^"]*CertificadoDetail_${sufixo}"[^>]*>`);
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return limpo(tag.match(/\svalue="([^"]*)"/)?.[1]);
}

/** Certificado aberto (página CERTEDIT/ItemId/N). */
export function lerCertificado(html: string, itemId: number): Certificado {
  const c = (s: string) => campo(html, s);
  const horas = c('txtNrHoras_I');
  const entrega = c('ddEntrega_I');
  const documentos: DocumentoCertificado[] = [];
  for (const tr of html.matchAll(/<tr[^>]*id="[^"]*gdDocs_DXDataRow\d+"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    const href = tr[1].match(/href="([^"]*Docs\/[^"]*)"/)?.[1];
    if (!href) continue;
    const caminho = href.replace(/^(\.\.\/)+/, '/').replace(/^~/, '');
    documentos.push({
      tipo: limpo(semTags(tds[1] || '')) || 'Documento',
      url: `${BASE}${caminho.startsWith('/') ? '' : '/'}${caminho}`,
      data: dataBRparaISO(limpo(semTags(tds[3] || ''))),
    });
  }
  return {
    itemId,
    status: c('cboStatus_I'),
    modelo: c('ddModelos_I'),
    rodagem: c('ddOpcaoRodagem_I'),
    chassi: chassiLimpo(c('txtChassis_I')),
    motor: c('txtNrMotor_I'),
    bombaInjetora: c('txtNrBomba_I'),
    nfMahindra: c('txtNF_I'),
    horasEntrega: horas != null && /^\d+([.,]\d+)?$/.test(horas) ? Number(horas.replace(',', '.')) : null,
    bateriaSerie: c('txtNrSerieBateria_I'),
    bateriaMarca: c('txtMarcaBateria_I'),
    proprietario: c('txtNome_I'),
    documento: c('txtCPF'),
    telefone: c('txtTelefone'),
    email: c('txtEmail_I'),
    cep: c('txtCEP_I'),
    endereco: c('txtEndereco_I'),
    numero: c('txtNumero_I'),
    complemento: c('txtComplemento_I'),
    cidade: c('txtCidade_I'),
    estado: c('txtEstado_I'),
    concessionaria: c('cboDealer_I'),
    entregaTecnica: entrega == null ? null : /^S/i.test(entrega),
    responsavelTecnico: c('txtVendedor_I'),
    dataEntrega: dataBRparaISO(c('txtDataAquisicao_I')),
    nfConcessionaria: c('txtNFDealer_I'),
    dataNfConcessionaria: dataBRparaISO(c('txtDataNFDealer_I')),
    banco: c('ddBanco_I'),
    linhaCredito: c('ddLinhasCredito_I'),
    documentos,
  };
}
