// Cidade de um trator vendido (tabela `tratores`, controle de revisões). Lá o
// cliente e a cidade são digitados à mão e a cidade erra bastante (o Uguccione
// está como PIRAJU e é de Carlópolis; o Laudair como RIBEIRÃO BONITO). Regra:
// achou o cliente no Clientes_Omie pelo nome → vale a cidade do Omie; senão, a
// digitada. Mesma regra do app de vendas (vendas-pwa/src/lib/tratoresCidade.js),
// aqui comparando município por `chaveMunicipio`. Regras puras.
import { chaveMunicipio } from './tratores-territorio';

/** Nome comparável: sem acento, maiúsculo, só letras e espaço. */
export function nomeChave(s: string | null | undefined): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** a e b diferem em no máximo 1 letra (troca, sobra ou falta). */
export function umaLetraDeDiferenca(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

export interface ClienteOmieIdx { k: string; cidade: string }

/** Linhas do Clientes_Omie ({ nome, cidade }) prontas para procurar. */
export function indexarClientesOmie(rows: { nome: string | null; cidade: string | null }[]): ClienteOmieIdx[] {
  return (rows || []).map((c) => ({ k: nomeChave(c.nome), cidade: String(c.cidade || '').trim() }))
    .filter((c) => c.k.length > 2 && c.cidade);
}

function candidatos(clientes: ClienteOmieIdx[], nome: string | null | undefined): ClienteOmieIdx[] {
  const k = nomeChave(nome);
  if (!k || k === 'NOVA TRATORES') return []; // trator da própria loja = estoque
  let c = clientes.filter((x) => x.k === k);
  if (!c.length && k.length >= 10) c = clientes.filter((x) => x.k.startsWith(k + ' ') || k.startsWith(x.k + ' '));
  if (!c.length && k.length >= 12) c = clientes.filter((x) => umaLetraDeDiferenca(x.k, k));
  return c;
}

/** "CARLOPOLIS (PR)" → "CARLOPOLIS (PR)" sem o UF para exibir: "CARLOPOLIS". */
const nomeExibir = (s: string) => String(s || '').split('/')[0].replace(/\s*\(([A-Z]{2})\)\s*$/, '').trim();

export interface CidadeTrator { chave: string; nome: string; origem: 'omie' | 'controle' }

/**
 * Cidade do trator. Homônimos no Omie em cidades diferentes: fica a do Omie que
 * bate com a digitada; nenhuma bate → a digitada.
 */
export function cidadeDoTrator(t: { Cliente?: string | null; Cidade?: string | null }, clientes: ClienteOmieIdx[]): CidadeTrator {
  const digitada = chaveMunicipio(t?.Cidade);
  const doOmie = new Map<string, string>();
  for (const c of candidatos(clientes, t?.Cliente)) {
    const ch = chaveMunicipio(c.cidade);
    if (ch) doOmie.set(ch, nomeExibir(c.cidade));
  }
  let ch: string | null = null;
  if (doOmie.size === 1) ch = [...doOmie.keys()][0];
  else if (doOmie.size > 1 && doOmie.has(digitada)) ch = digitada;
  if (ch) return { chave: ch, nome: doOmie.get(ch) || ch, origem: 'omie' };
  return { chave: digitada, nome: nomeExibir(String(t?.Cidade || '')), origem: 'controle' };
}
