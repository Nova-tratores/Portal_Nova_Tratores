// Onde PROVAVELMENTE está um trator vendido que ainda não foi localizado em campo
// (trator_localizacao). Casa o dono do trator (tabela `tratores`, nome digitado)
// pelo NOME COMPLETO com: a fazenda marcada pelo GPS do carro do técnico
// (clientes_localizacoes) e as visitas presenciais com GPS do app de vendas.
// Regra estrita de propósito: nome parecido ("José Nunes Filho" × "José Afonso
// Gabriel Filho") punha pino errado no mapa. Só aceita o nome inteiro igual ou,
// em nome longo, 1 letra de diferença (LAUDAIR × LAUDEIR). Regras puras.
import { umaLetraDeDiferenca } from './tratores-cidade';

/** Nome do dono comparável: sem acento, sem "E OUTROS", NETO/FILHO/JUNIOR. */
export function chaveDono(s: string | null | undefined): string {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\b(E OUTROS?|E OUTRAS?|NETO|FILHO|JUNIOR|JR)\b/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

// nome de lugar, não de gente: não identifica o dono
const GENERICO = /^(FAZ|FAZENDA|SITIO|CHACARA|ESTANCIA|GRANJA|RANCHO|NOVA TRATORES)\b/;

export function mesmoDonoEstrito(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = chaveDono(a), y = chaveDono(b);
  if (x.length < 8 || y.length < 8 || GENERICO.test(x) || GENERICO.test(y)) return false;
  if (!x.includes(' ') || !y.includes(' ')) return false; // nome de uma palavra só não basta
  return x === y || (x.length >= 12 && umaLetraDeDiferenca(x, y));
}

export interface FonteLocal {
  nomes: (string | null)[];          // nomes que podem ser do dono (cliente, propriedade)
  lat: number; lng: number;
  origem: 'fazenda' | 'visita';
  detalhe: string | null;            // "Fazenda X · técnico Y" / "visita de Z"
  quando: string | null;
}

export interface PinoProvavel {
  lat: number; lng: number;
  modelo: string | null; cliente: string | null; chassis_fim: string;
  origem: 'fazenda' | 'visita'; detalhe: string | null; quando: string | null;
}

/**
 * Para cada trator sem localização confirmada, o ponto mais confiável que casa
 * com o dono: fazenda do técnico vence visita; entre iguais, a mais recente.
 */
export function pinosProvaveis(
  tratores: { Chassis: string; Modelo: string | null; Cliente: string | null }[],
  fontes: FonteLocal[],
): PinoProvavel[] {
  const peso = (f: FonteLocal) => (f.origem === 'fazenda' ? 1 : 0);
  const out: PinoProvavel[] = [];
  for (const t of tratores) {
    const casam = fontes.filter((f) => f.nomes.some((n) => mesmoDonoEstrito(t.Cliente, n)));
    if (!casam.length) continue;
    casam.sort((a, b) => peso(b) - peso(a) || String(b.quando || '').localeCompare(String(a.quando || '')));
    const f = casam[0];
    out.push({
      lat: f.lat, lng: f.lng, modelo: t.Modelo, cliente: t.Cliente, chassis_fim: String(t.Chassis).slice(-6),
      origem: f.origem, detalhe: f.detalhe, quando: f.quando,
    });
  }
  return out;
}
