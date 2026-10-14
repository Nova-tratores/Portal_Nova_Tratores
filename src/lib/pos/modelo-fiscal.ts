// Modelos fiscais dos itens de serviço da OS — parte PURA (client-safe).
//
// Um modelo guarda SÓ os campos preenchidos; o que fica vazio continua vindo do
// cadastro do serviço na Omie. Na janela de faturar, o modelo do cliente (ou o
// "Padrão") é aplicado em TODOS os itens de serviço da OS, com ajuste campo a
// campo para aquela OS. Campos = os das abas do item na Omie (Serviço · PIS,
// COFINS e CSLL · IR e INSS · Lei da Transparência · Reforma Tributária),
// conferidos na doc da API /servicos/os/ em 10/10/2026.

export type TipoCampo = 'texto' | 'aliquota' | 'sn';
export type GrupoCampo = 'servico' | 'federais' | 'transparencia' | 'reforma';

export interface CampoFiscal {
  chave: string;            // chave no modelo (= nome na Omie)
  rotulo: string;
  grupo: GrupoCampo;
  tipo: TipoCampo;
  noImpostos: boolean;      // fica dentro de ServicosPrestados[].impostos
  max?: number;             // tamanho do texto na Omie
  dica?: string;
}

export const GRUPOS: Array<{ id: GrupoCampo; rotulo: string }> = [
  { id: 'servico', rotulo: 'Serviço (ISS)' },
  { id: 'federais', rotulo: 'PIS, COFINS, CSLL, IR e INSS' },
  { id: 'transparencia', rotulo: 'Lei da Transparência dos Impostos' },
  { id: 'reforma', rotulo: 'Reforma Tributária (IBS/CBS)' },
];

export const CAMPOS_FISCAIS: CampoFiscal[] = [
  { chave: 'cNbs', rotulo: 'Código NBS', grupo: 'servico', tipo: 'texto', noImpostos: false, max: 9, dica: 'Ex.: 1.2001.50.00 (gravado só com os dígitos)' },
  { chave: 'cCodServLC116', rotulo: 'Código LC 116', grupo: 'servico', tipo: 'texto', noImpostos: false, max: 20 },
  { chave: 'cCodServMun', rotulo: 'Código do serviço municipal / CNAE', grupo: 'servico', tipo: 'texto', noImpostos: false, max: 20 },
  { chave: 'cTribServ', rotulo: 'Tipo de tributação do serviço', grupo: 'servico', tipo: 'texto', noImpostos: false, max: 2, dica: 'Código da prefeitura (varia por município)' },
  { chave: 'nAliqISS', rotulo: '% ISS', grupo: 'servico', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemISS', rotulo: 'Retém ISS', grupo: 'servico', tipo: 'sn', noImpostos: false },

  { chave: 'nAliqPIS', rotulo: '% PIS', grupo: 'federais', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemPIS', rotulo: 'Retém PIS', grupo: 'federais', tipo: 'sn', noImpostos: true },
  { chave: 'nAliqCOFINS', rotulo: '% COFINS', grupo: 'federais', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemCOFINS', rotulo: 'Retém COFINS', grupo: 'federais', tipo: 'sn', noImpostos: true },
  { chave: 'nAliqCSLL', rotulo: '% CSLL', grupo: 'federais', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemCSLL', rotulo: 'Retém CSLL', grupo: 'federais', tipo: 'sn', noImpostos: true },
  { chave: 'nAliqIRRF', rotulo: '% IR', grupo: 'federais', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemIRRF', rotulo: 'Retém IR', grupo: 'federais', tipo: 'sn', noImpostos: true },
  { chave: 'nAliqINSS', rotulo: '% INSS', grupo: 'federais', tipo: 'aliquota', noImpostos: true },
  { chave: 'cRetemINSS', rotulo: 'Retém INSS', grupo: 'federais', tipo: 'sn', noImpostos: true },

  { chave: 'nAliqFederalIBPT', rotulo: '% carga trib. aprox. federal', grupo: 'transparencia', tipo: 'aliquota', noImpostos: true },
  { chave: 'nAliqEstadualIBPT', rotulo: '% carga trib. aprox. estadual', grupo: 'transparencia', tipo: 'aliquota', noImpostos: true },
  { chave: 'nAliqMunicipalIBPT', rotulo: '% carga trib. aprox. municipal', grupo: 'transparencia', tipo: 'aliquota', noImpostos: true },

  { chave: 'cCST', rotulo: 'CST (IBS/CBS)', grupo: 'reforma', tipo: 'texto', noImpostos: true, max: 3, dica: 'Ex.: 000' },
  { chave: 'cClassTrib', rotulo: 'Classificação tributária', grupo: 'reforma', tipo: 'texto', noImpostos: true, max: 6 },
  { chave: 'cIndOPer', rotulo: 'Indicador de operação', grupo: 'reforma', tipo: 'texto', noImpostos: true, max: 6 },
  { chave: 'nAliqIbsMun', rotulo: '% IBS municipal', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
  { chave: 'nPercReducaoIbsMun', rotulo: '% redução IBS municipal', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
  { chave: 'nAliqIbsUf', rotulo: '% IBS estadual', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
  { chave: 'nPercReducaoIbsUf', rotulo: '% redução IBS estadual', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
  { chave: 'nAliqCbs', rotulo: '% CBS', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
  { chave: 'nPercReducaoCbs', rotulo: '% redução CBS', grupo: 'reforma', tipo: 'aliquota', noImpostos: true },
];

const POR_CHAVE = new Map(CAMPOS_FISCAIS.map((c) => [c.chave, c]));

/** Valores de um modelo/ajuste: só os campos preenchidos. */
export type CamposFiscais = Record<string, string | number>;

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** "1.2001.50.00" → "120015000" (é como a Omie guarda o NBS). */
export function normalizarNbs(v: unknown): string { return soDigitos(String(v ?? '')); }

/** "120015000" → "1.2001.50.00" (como a tela da Omie mostra). */
export function formatarNbs(v: unknown): string {
  const d = normalizarNbs(v);
  return d.length === 9 ? `${d[0]}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7, 9)}` : d;
}

function lerAliquota(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : NaN;
}

/**
 * Valida e normaliza os campos (vindos da tela ou do banco). Descarta vazios
 * e chaves desconhecidas. Devolve os campos limpos e a lista de erros.
 */
export function validarCampos(bruto: unknown): { campos: CamposFiscais; erros: string[] } {
  const campos: CamposFiscais = {};
  const erros: string[] = [];
  if (!bruto || typeof bruto !== 'object') return { campos, erros };
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    const c = POR_CHAVE.get(chave);
    if (!c) continue;
    if (valor === null || valor === undefined || String(valor).trim() === '') continue;
    if (c.tipo === 'aliquota') {
      const n = lerAliquota(valor);
      if (n === null) continue;
      if (Number.isNaN(n) || n < 0 || n > 100) { erros.push(`${c.rotulo}: informe um número entre 0 e 100.`); continue; }
      campos[chave] = n;
    } else if (c.tipo === 'sn') {
      const t = String(valor).trim().toUpperCase();
      if (t !== 'S' && t !== 'N') { erros.push(`${c.rotulo}: use S ou N.`); continue; }
      campos[chave] = t;
    } else {
      let t = String(valor).trim();
      if (chave === 'cNbs') {
        t = normalizarNbs(t);
        if (t.length !== 9) { erros.push('Código NBS: são 9 dígitos (ex.: 1.2001.50.00).'); continue; }
      }
      if (chave === 'cCST' && !/^\d{3}$/.test(t)) { erros.push('CST: são 3 dígitos (ex.: 000).'); continue; }
      if (c.max && t.length > c.max) { erros.push(`${c.rotulo}: no máximo ${c.max} caracteres.`); continue; }
      campos[chave] = t;
    }
  }
  return { campos, erros };
}

/** Modelo + ajustes da OS (ajuste vazio "" apaga o campo do modelo → volta ao cadastro da Omie). */
export function mesclarCampos(modelo: CamposFiscais | null | undefined, ajustes: Record<string, unknown> | null | undefined): CamposFiscais {
  const base: Record<string, unknown> = { ...(modelo || {}) };
  for (const [k, v] of Object.entries(ajustes || {})) {
    if (v === null || v === undefined || String(v).trim() === '') delete base[k];
    else base[k] = v;
  }
  return validarCampos(base).campos;
}

/** O que mudou em relação ao modelo (para o registro da OS). */
export function diferencasDoModelo(modelo: CamposFiscais | null | undefined, final: CamposFiscais): Array<{ campo: string; de: string | number | null; para: string | number | null }> {
  const m = modelo || {};
  const chaves = new Set([...Object.keys(m), ...Object.keys(final)]);
  const out: Array<{ campo: string; de: string | number | null; para: string | number | null }> = [];
  for (const k of chaves) {
    const de = m[k] ?? null; const para = final[k] ?? null;
    if (String(de ?? '') !== String(para ?? '')) out.push({ campo: k, de, para });
  }
  return out;
}

// ------------------------------------------------------------ itens da OS no Omie
export interface ItemServicoOmie {
  nIdItem?: number;
  cDescServ?: string;
  impostos?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Valor atual de um campo num item lido do ConsultarOS. */
export function valorNoItem(item: ItemServicoOmie, chave: string): string | number | null {
  const c = POR_CHAVE.get(chave);
  if (!c) return null;
  const v = c.noImpostos ? item.impostos?.[chave] : item[chave];
  if (v === null || v === undefined || v === '') return null;
  if (c.tipo === 'aliquota') { const n = lerAliquota(v); return n === null || Number.isNaN(n) ? null : n; }
  if (chave === 'cNbs') return normalizarNbs(v) || null;
  return c.tipo === 'sn' ? String(v).trim().toUpperCase() : String(v).trim();
}

/** Resumo por campo de todos os itens: valor comum, ou "varia". */
export function valoresAtuais(itens: ItemServicoOmie[]): Record<string, string | number | null | 'varia'> {
  const out: Record<string, string | number | null | 'varia'> = {};
  for (const c of CAMPOS_FISCAIS) {
    const vals = itens.map((i) => valorNoItem(i, c.chave));
    const unicos = new Set(vals.map((v) => String(v ?? '')));
    out[c.chave] = unicos.size > 1 ? 'varia' : (vals[0] ?? null);
  }
  return out;
}

/** Item para o AlterarOS: identifica por nIdItem e manda só os campos do modelo. */
export function montarItemAlteracao(item: ItemServicoOmie, campos: CamposFiscais): Record<string, unknown> | null {
  if (!item.nIdItem) return null;
  const topo: Record<string, unknown> = {};
  const impostos: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    const c = POR_CHAVE.get(k);
    if (!c) continue;
    (c.noImpostos ? impostos : topo)[k] = v;
  }
  if (!Object.keys(topo).length && !Object.keys(impostos).length) return null;
  return {
    // sem a sequência o Omie responde "alterada com sucesso" e IGNORA os impostos (OS 5352, 14/10/2026)
    ...(item.nSeqItem ? { nSeqItem: item.nSeqItem } : {}),
    nIdItem: item.nIdItem,
    cAcaoItem: 'A',
    ...topo,
    ...(Object.keys(impostos).length ? { impostos: { ...impostos, cUtilizaValorImposto: 'N' } } : {}),
  };
}

/** Confere, item a item, se a Omie gravou o que foi mandado. null = confere. */
export function conferirImpostos(itens: ItemServicoOmie[] | null | undefined, campos: CamposFiscais): string | null {
  if (!Array.isArray(itens) || !itens.length) return 'o Omie não devolveu os itens de serviço';
  for (const item of itens) {
    for (const [k, esperado] of Object.entries(campos)) {
      const lido = valorNoItem(item, k);
      const c = POR_CHAVE.get(k)!;
      const igual = c.tipo === 'aliquota'
        ? lido !== null && Math.abs(Number(lido) - Number(esperado)) < 0.00005
        : String(lido ?? '') === String(esperado);
      if (!igual) {
        return `no item "${String(item.cDescServ || item.nIdItem).split('\n')[0].slice(0, 40)}", ${c.rotulo} ficou ${lido ?? 'vazio'} (esperado ${esperado})`;
      }
    }
  }
  return null;
}

export function rotuloCampo(chave: string): string { return POR_CHAVE.get(chave)?.rotulo || chave; }

/** Para mostrar: NBS formatado, alíquota com vírgula, S/N como Sim/Não. */
export function mostrarValor(chave: string, v: string | number | null | undefined | 'varia'): string {
  if (v === 'varia') return 'varia entre os itens';
  if (v === null || v === undefined || v === '') return '—';
  const c = POR_CHAVE.get(chave);
  if (chave === 'cNbs') return formatarNbs(v);
  if (c?.tipo === 'aliquota') return `${String(v).replace('.', ',')}%`;
  if (c?.tipo === 'sn') return v === 'S' ? 'Sim' : 'Não';
  return String(v);
}
