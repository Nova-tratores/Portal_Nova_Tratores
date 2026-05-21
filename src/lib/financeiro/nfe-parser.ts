// =====================================================================
// PARSER DE NF-e — extrai dados estruturados do XML para auto-preencher
// o formulário de Contas a Pagar.
//
// Funciona no browser (DOMParser nativo) e em Node 18+ (via 'linkedom' ou
// 'jsdom' — mas hoje só usamos no client). Sem dependência externa.
//
// Compatível com NF-e v3.10 e v4.00. Usa busca por localName para ignorar
// namespace (`http://www.portalfiscal.inf.br/nfe`).
// =====================================================================

export interface DadosNFe {
  numero: string;            // ide/nNF
  serie: string;             // ide/serie
  chave: string;             // infNFe/@Id (44 dígitos sem prefixo "NFe")
  dataEmissao: string;       // ISO yyyy-mm-dd
  valorTotal: number;        // total/ICMSTot/vNF (sempre número)
  cnpjEmitente: string;      // emit/CNPJ (só dígitos)
  nomeEmitente: string;      // emit/xNome
  fantasiaEmitente?: string; // emit/xFant
  enderecoEmitente?: {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cep?: string;
    municipio?: string;
    uf?: string;
  };
}

// ---------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------

/** Pega o primeiro elemento filho com o localName indicado (case-sensitive). */
function findEl(parent: Element | Document, localName: string): Element | null {
  // getElementsByTagName aceita "*" para todos; depois filtramos por localName
  const all = parent.getElementsByTagName(localName);
  if (all.length > 0) return all[0];
  // Fallback para XML com namespace que possa quebrar getElementsByTagName em alguns runtimes
  const wild = parent.getElementsByTagName("*");
  for (let i = 0; i < wild.length; i++) {
    if (wild[i].localName === localName) return wild[i];
  }
  return null;
}

function textOf(parent: Element | Document, localName: string): string {
  const el = findEl(parent, localName);
  return el?.textContent?.trim() || "";
}

function soDigitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

// ---------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------

export function parseNFeXML(xmlText: string): DadosNFe {
  if (!xmlText || !xmlText.trim()) {
    throw new Error("XML vazio.");
  }

  // No browser, DOMParser é global. Em ambientes que não têm, precisa polyfill;
  // mas no nosso uso (UploadNFeXml.js no client) sempre vai haver DOMParser.
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser não disponível neste ambiente — use no browser.");
  }

  const dom = new DOMParser().parseFromString(xmlText, "application/xml");

  // detecta erro de parse
  const parseError = dom.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("XML inválido: " + (parseError.textContent || "erro de parse"));
  }

  const infNFe = findEl(dom, "infNFe");
  if (!infNFe) {
    throw new Error("XML não parece ser uma NF-e (sem elemento <infNFe>).");
  }

  const ide = findEl(infNFe, "ide");
  const emit = findEl(infNFe, "emit");
  const total = findEl(infNFe, "total");
  if (!ide || !emit || !total) {
    throw new Error("XML não parece ser uma NF-e válida (faltam <ide>, <emit> ou <total>).");
  }

  // Chave: vem em infNFe/@Id, formato "NFe12345..." (46 chars: "NFe" + 44 dígitos)
  const idAttr = infNFe.getAttribute("Id") || "";
  const chave = idAttr.replace(/^NFe/i, "").replace(/\D/g, "").slice(0, 44);

  // Número e série
  const numero = textOf(ide, "nNF");
  const serie = textOf(ide, "serie");

  // Data de emissão: dhEmi (v4) ou dEmi (v3.10)
  const dhEmi = textOf(ide, "dhEmi") || textOf(ide, "dEmi");
  const dataEmissao = dhEmi ? dhEmi.slice(0, 10) : "";

  // Emitente
  const cnpjEmitente = soDigitos(textOf(emit, "CNPJ") || textOf(emit, "CPF"));
  const nomeEmitente = textOf(emit, "xNome");
  const fantasiaEmitente = textOf(emit, "xFant") || undefined;

  // Endereço emitente
  const enderEmit = findEl(emit, "enderEmit");
  const enderecoEmitente = enderEmit
    ? {
        logradouro: textOf(enderEmit, "xLgr") || undefined,
        numero: textOf(enderEmit, "nro") || undefined,
        bairro: textOf(enderEmit, "xBairro") || undefined,
        cep: textOf(enderEmit, "CEP") || undefined,
        municipio: textOf(enderEmit, "xMun") || undefined,
        uf: textOf(enderEmit, "UF") || undefined,
      }
    : undefined;

  // Valor total: total/ICMSTot/vNF
  const icmsTot = findEl(total, "ICMSTot");
  const valorTotalStr = icmsTot ? textOf(icmsTot, "vNF") : "";
  const valorTotal = parseFloat(valorTotalStr) || 0;

  return {
    numero,
    serie,
    chave,
    dataEmissao,
    valorTotal,
    cnpjEmitente,
    nomeEmitente,
    fantasiaEmitente,
    enderecoEmitente,
  };
}

// =====================================================================
// PARSER DA CHAVE NF-e (44 dígitos)
//
// Layout oficial: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
// Exemplo: 35 2401 12345678000199 55 001 000012345 1 00000001 0
//
// O que dá pra extrair SEM o XML:
//   - CNPJ do emitente
//   - Série
//   - Número da NF
//   - Ano e mês de emissão (dia NÃO vem na chave — só AAMM)
//
// O que NÃO dá pra extrair: nome do emitente, valor total, descrição.
// Pra esses, ou pega no XML, ou consulta SEFAZ, ou usuário preenche.
// =====================================================================

export interface DadosChaveNFe {
  chave: string;             // 44 dígitos validados
  cnpjEmitente: string;
  serie: string;
  numero: string;
  anoEmissao: number;
  mesEmissao: number;
  dataEmissaoAprox: string;  // ISO yyyy-mm-01 (dia desconhecido — primeiro do mês)
  uf: string;                // sigla da UF (SP, RS, etc.)
}

const UFS: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
  "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

/**
 * Valida e parseia uma chave NF-e de 44 dígitos. Aceita também o formato com
 * "NFe" no início (como vem em <infNFe Id="NFe...">). Lança Error se inválida.
 */
export function parseChaveNFe(raw: string): DadosChaveNFe {
  const limpa = String(raw || "").replace(/^NFe/i, "").replace(/\D/g, "");
  if (limpa.length !== 44) {
    throw new Error(`Chave NF-e inválida — esperado 44 dígitos, recebido ${limpa.length}.`);
  }

  // cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
  const cUF   = limpa.slice(0, 2);
  const aamm  = limpa.slice(2, 6);
  const cnpj  = limpa.slice(6, 20);
  const mod   = limpa.slice(20, 22);
  const serie = limpa.slice(22, 25);
  const nNF   = limpa.slice(25, 34);
  const ano2  = parseInt(aamm.slice(0, 2), 10);
  const mes   = parseInt(aamm.slice(2, 4), 10);

  if (mes < 1 || mes > 12) {
    throw new Error("Chave NF-e inválida — mês fora da faixa 01-12.");
  }
  if (mod !== "55" && mod !== "65") {
    // 55 = NF-e, 65 = NFC-e (cupom fiscal eletrônico)
    // Não bloqueia; só registra
    console.warn(`[parseChaveNFe] modelo ${mod} (esperado 55 ou 65)`);
  }

  const ano = ano2 + 2000;
  const mesPad = String(mes).padStart(2, "0");

  return {
    chave: limpa,
    cnpjEmitente: cnpj,
    serie: String(parseInt(serie, 10)),         // remove zeros à esquerda
    numero: String(parseInt(nNF, 10)),          // remove zeros à esquerda
    anoEmissao: ano,
    mesEmissao: mes,
    dataEmissaoAprox: `${ano}-${mesPad}-01`,
    uf: UFS[cUF] || cUF,
  };
}
