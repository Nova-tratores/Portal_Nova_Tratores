// Separar máquinas recebidas em lote — regras PURAS (client-safe).
// Alguns fabricantes faturam N máquinas numa linha só da NF (um SKU do fornecedor
// com quantidade N). A Nova identifica cada máquina pelo SKU = chassi/série e pelo
// Projeto da Omie. A Omie não divide a linha no recebimento, então a separação é
// depois da entrada: o produto da nota vira a 1ª máquina (código = série 1) e as
// outras viram produtos novos, cada um com 1 un. e o mesmo custo.

export const MAX_POR_VEZ = 10; // limite do ajustarEstoque (1 origem + 9 novas)
export const SERIE_MAX = 60;
export const PROJETO_MAX = 70; // limite do IncluirProjeto
export const DESCRICAO_MAX = 120; // limite do campo descricao do produto na Omie

/** Família que é máquina (não Peças, não vazia). */
export function familiaDeMaquina(familia: unknown): boolean {
  const f = String(familia ?? '').trim();
  return !!f && !/pe[cç]a/i.test(f);
}

/** Tira da descrição do fornecedor o trecho de série/certificado ("CERT. DE GARANTIA NR. 45832 NUMERO DE SERIE: G0725 37111"). */
export function descricaoBase(descricao: unknown): string {
  let s = String(descricao ?? '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\|+/g, ' ');
  s = s.replace(/\s*(CERT\.?\s*DE\s*GARANTIA|N[UÚ]MERO\s+DE\s+S[EÉ]RIE|NRO?\.?\s+(DE\s+)?S[EÉ]RIE|S[EÉ]RIE\s*:|CHASSI\s*:?).*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizarSerie(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function descricaoDaMaquina(base: string, serie: string): string {
  const b = descricaoBase(base);
  const sufixo = ` SÉRIE ${normalizarSerie(serie)}`;
  return (b.slice(0, Math.max(0, DESCRICAO_MAX - sufixo.length)) + sufixo).trim();
}

export function projetoDaMaquina(marca: unknown, modelo: unknown, serie: string): string {
  const partes = [String(marca ?? '').trim(), String(modelo ?? '').trim(), normalizarSerie(serie)].filter(Boolean);
  return partes.join(' ').toUpperCase().replace(/\s+/g, ' ').slice(0, PROJETO_MAX);
}

export interface MaquinaSeparar { serie: string; descricao: string; projeto: string }

/** Erros das linhas (vazio = pode seguir). `codigosExistentes` = códigos já usados na conta (minúsculos). */
export function validarMaquinas(maqs: MaquinaSeparar[], estoqueAtual: number, codigosExistentes: Set<string> = new Set()): string[] {
  const erros: string[] = [];
  if (maqs.length < 2) erros.push('Informe pelo menos 2 máquinas.');
  if (maqs.length > MAX_POR_VEZ) erros.push(`No máximo ${MAX_POR_VEZ} máquinas por vez.`);
  if (maqs.length > estoqueAtual) erros.push(`O produto tem só ${estoqueAtual} no estoque; não dá para separar ${maqs.length}.`);
  const vistas = new Set<string>();
  maqs.forEach((m, i) => {
    const s = normalizarSerie(m.serie);
    const n = i + 1;
    if (!s) erros.push(`Máquina ${n}: falta a série/chassi.`);
    else {
      if (s.length > SERIE_MAX) erros.push(`Máquina ${n}: série com mais de ${SERIE_MAX} letras.`);
      if (vistas.has(s)) erros.push(`Máquina ${n}: série ${s} repetida.`);
      if (codigosExistentes.has(s.toLowerCase())) erros.push(`Máquina ${n}: já existe produto com o código ${s} na Omie.`);
      vistas.add(s);
    }
    if (!String(m.descricao ?? '').trim()) erros.push(`Máquina ${n}: falta a descrição.`);
    if (String(m.descricao ?? '').length > DESCRICAO_MAX) erros.push(`Máquina ${n}: descrição com mais de ${DESCRICAO_MAX} letras.`);
    if (!String(m.projeto ?? '').trim()) erros.push(`Máquina ${n}: falta o nome do projeto.`);
  });
  return erros;
}

/** Linha de nota recebida que ainda precisa separar. */
export interface LinhaRecebida {
  idReceb: number; conta: string; numeroNfe: string; fornecedor: string; emissao: string | null; recebidoEm: string | null;
  seq: number; codigoFornecedor: string; descricaoNota: string; qtde: number; idProduto: number;
}
export interface ProdutoAtual { codigo: string; descricao: string; familia: string | null; estoque: number; inativo: boolean }

export function precisaSeparar(l: LinhaRecebida, p: ProdutoAtual | undefined): boolean {
  if (!(l.qtde > 1) || !(l.idProduto > 0) || !p || p.inativo) return false;
  return familiaDeMaquina(p.familia) && p.estoque > 1;
}
