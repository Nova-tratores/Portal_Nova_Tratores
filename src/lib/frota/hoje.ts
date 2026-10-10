// Aba HOJE da Frota — "o que fazer agora", montado de dados que já existem.
// Função PURA: recebe o que GET /api/frota/hoje leu e devolve as listas da tela.
//
//  - parados: veículo marcado parado/em manutenção na Ficha ou com problema crítico
//  - graves: pendências abertas de gravidade crítica ou grave (as que pesam)
//  - documentos: vencidos ou vencendo em 30 dias
//  - cadastro: veículo ativo sem responsável ou com cadastro incompleto
// (checklists, paradas e combustível chegam prontos de outras libs)
import { gravidadeDaPendencia, PESO, type Gravidade } from '@/lib/frota/gravidade';
import { resumoClasses, statusParado } from '@/lib/frota/classes';
import { responsavelVazio } from '@/lib/frota/responsavel';

const DIA = 86400_000;

export interface VeiculoHoje {
  id: string; placa: string; modelo: string | null; marca: string | null; descricao: string | null;
  status: string | null; ativo: boolean | null; tipo_registro: string | null; pendencia_vinculo: boolean | null;
}
export interface PendenciaHoje {
  id: string; placa: string; titulo: string; origem: string | null; gravidade?: string | null;
  componente_id: string | null; aberta_em: string | null; responsavel?: string | null;
}
export interface DocumentoHoje { veiculo_id: string; tipo: string | null; vigencia_fim: string | null }

export interface EntradaHoje {
  agora: number;
  veiculos: VeiculoHoje[];
  responsaveis: { veiculo_id: string; motorista_nome: string | null }[];
  pendencias: PendenciaHoje[];
  componentes: Map<string, { sistema?: string | null; subsistema?: string | null; componente?: string | null }>;
  documentos: DocumentoHoje[];
}

export interface Hoje {
  ativos: number;
  parados: { placa: string; modelo: string; motivos: string[] }[];
  graves: (PendenciaHoje & { gravidade: Gravidade; modelo: string })[];
  documentos: { placa: string; modelo: string; tipo: string; vigencia_fim: string; vencido: boolean; dias: number }[];
  cadastro: { placa: string; modelo: string; problemas: string[] }[];
}

const TIPO_DOC: Record<string, string> = {
  crlv: 'CRLV', seguro: 'Seguro', ipva: 'IPVA', licenciamento: 'Licenciamento', tacografo: 'Tacógrafo',
};
export const rotuloDocumento = (t: string | null) => TIPO_DOC[String(t || '').toLowerCase()] || (t ? t.toUpperCase() : 'Documento');

export function montarHoje(e: EntradaHoje): Hoje {
  const hojeIso = new Date(e.agora).toISOString().slice(0, 10);
  const limite30 = new Date(e.agora + 30 * DIA).toISOString().slice(0, 10);
  const ativos = e.veiculos.filter((v) => v.tipo_registro === 'veiculo' && v.ativo && v.status !== 'vendido');
  const porId = new Map(ativos.map((v) => [v.id, v]));
  const porPlaca = new Map(ativos.map((v) => [v.placa, v]));
  const modeloDe = (v: VeiculoHoje | undefined) => (v ? [v.marca, v.modelo || v.descricao].filter(Boolean).join(' ') : '');

  const pendPorPlaca = new Map<string, PendenciaHoje[]>();
  for (const p of e.pendencias) {
    if (!porPlaca.has(p.placa)) continue; // só veículo ativo da frota
    const arr = pendPorPlaca.get(p.placa) || [];
    arr.push(p); pendPorPlaca.set(p.placa, arr);
  }

  // PARADOS
  const parados: Hoje['parados'] = [];
  for (const v of ativos) {
    const r = resumoClasses(pendPorPlaca.get(v.placa) || [], v.status, e.componentes);
    if (!r.parado) continue;
    const motivos: string[] = [];
    if (statusParado(v.status)) motivos.push(v.status === 'manutencao' ? 'Em manutenção (Ficha)' : 'Parado (Ficha)');
    for (const p of pendPorPlaca.get(v.placa) || []) {
      if (gravidadeDaPendencia(p, e.componentes) === 'critica') motivos.push(p.titulo);
    }
    parados.push({ placa: v.placa, modelo: modeloDe(v), motivos });
  }

  // GRAVES (crítica + grave), mais urgente e mais antiga primeiro
  const graves = e.pendencias
    .filter((p) => porPlaca.has(p.placa))
    .map((p) => ({ ...p, gravidade: gravidadeDaPendencia(p, e.componentes), modelo: modeloDe(porPlaca.get(p.placa)) }))
    .filter((p) => p.gravidade === 'critica' || p.gravidade === 'grave')
    .sort((a, b) => (PESO[b.gravidade] - PESO[a.gravidade]) || String(a.aberta_em || '').localeCompare(String(b.aberta_em || '')));

  // DOCUMENTOS vencidos ou vencendo em 30 dias (só o mais urgente de cada tipo por carro)
  const docs = new Map<string, Hoje['documentos'][number]>();
  for (const d of e.documentos) {
    const v = porId.get(d.veiculo_id);
    if (!v || !d.vigencia_fim) continue;
    const fim = String(d.vigencia_fim).slice(0, 10);
    if (fim > limite30) continue;
    const chave = `${v.placa}|${d.tipo}`;
    const dias = Math.round((new Date(`${fim}T12:00:00Z`).getTime() - new Date(`${hojeIso}T12:00:00Z`).getTime()) / DIA);
    const item = { placa: v.placa, modelo: modeloDe(v), tipo: rotuloDocumento(d.tipo), vigencia_fim: fim, vencido: fim < hojeIso, dias };
    const atual = docs.get(chave);
    // um documento novo (renovado) deixa de cobrar: fica o de vigência mais longa
    if (!atual || fim > atual.vigencia_fim) docs.set(chave, item);
  }
  // se o mesmo tipo tem um documento novo fora da janela, o antigo não cobra
  const renovados = new Set(
    e.documentos.filter((d) => d.vigencia_fim && String(d.vigencia_fim).slice(0, 10) > limite30)
      .map((d) => `${porId.get(d.veiculo_id)?.placa}|${d.tipo}`),
  );
  const documentos = [...docs.entries()].filter(([k]) => !renovados.has(k)).map(([, v]) => v)
    .sort((a, b) => a.vigencia_fim.localeCompare(b.vigencia_fim));

  // CADASTRO a corrigir: sem responsável, cadastro incompleto
  const comResp = new Set(e.responsaveis.filter((r) => !responsavelVazio(r.motorista_nome)).map((r) => r.veiculo_id));
  const cadastro: Hoje['cadastro'] = [];
  for (const v of ativos) {
    const problemas: string[] = [];
    if (!comResp.has(v.id)) problemas.push('Sem responsável');
    if (v.pendencia_vinculo) problemas.push('Cadastro incompleto (só apareceu no abastecimento)');
    if (problemas.length) cadastro.push({ placa: v.placa, modelo: modeloDe(v), problemas });
  }

  return { ativos: ativos.length, parados, graves, documentos, cadastro };
}

/** Variação percentual com sinal, ou null quando não dá pra comparar. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}
