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

export type OrigemProvavel = 'atendimento' | 'fazenda' | 'visita';

export interface FonteLocal {
  nomes: (string | null)[];          // nomes que podem ser do dono (cliente, propriedade)
  // atendimento: o local gravado na Pasta Cliente ao faturar a OS (GPS do carro do técnico)
  // casa pelo CHASSI citado na OS — vale mesmo com o trator no nome da filha/pai
  textoChassi?: string | null;
  lat: number; lng: number;
  origem: OrigemProvavel;
  detalhe: string | null;            // "Fazenda X · técnico Y" / "visita de Z"
  quando: string | null;
}

export interface PinoProvavel {
  lat: number; lng: number;
  modelo: string | null; cliente: string | null; chassis_fim: string;
  origem: OrigemProvavel; detalhe: string | null; quando: string | null;
}

/** Só letras e números, maiúsculo. */
const soAlnum = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** O texto da OS (Projeto + serviço) cita este chassi? Compara o final de 7 (6 dá colisão). */
export function citaChassi(texto: string | null | undefined, chassi: string | null | undefined): boolean {
  const fim = soAlnum(chassi).slice(-7);
  return fim.length === 7 && soAlnum(texto).includes(fim);
}

/**
 * Para cada trator sem localização confirmada, o ponto mais confiável: onde o
 * técnico atendeu ESTE chassi > fazenda do dono marcada pelo técnico > visita
 * ao dono; entre iguais, a mais recente.
 */
export function pinosProvaveis(
  tratores: { Chassis: string; Modelo: string | null; Cliente: string | null }[],
  fontes: FonteLocal[],
): PinoProvavel[] {
  const peso = (f: FonteLocal) => (f.origem === 'atendimento' ? 2 : f.origem === 'fazenda' ? 1 : 0);
  const out: PinoProvavel[] = [];
  for (const t of tratores) {
    const casam = fontes.filter((f) => (f.textoChassi && citaChassi(f.textoChassi, t.Chassis))
      || (f.origem !== 'atendimento' && f.nomes.some((n) => mesmoDonoEstrito(t.Cliente, n))));
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
