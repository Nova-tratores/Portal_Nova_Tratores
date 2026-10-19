// =============================================================================
// INTELIGÊNCIA DE VENDAS — placar da equipe comercial (supervisão). Lib PURA.
//
// Um vendedor por linha, cruzando:
//   CRM dos vendedores ... visitas (GPS, retroativa, retorno combinado,
//                          pós-vendas acionado) e negócios
//   propostas (portal) ... abertas, paradas, sem próximo contato, ganhas/perdidas
//   Omie ................. pedidos de máquina e de peças faturados (12 meses)
//   carteira ............. clientes da base em que ele é o vendedor
// O nome do vendedor muda de fonte pra fonte ("DOUGRAS BOMFIM" no CRM,
// "DOUGRAS MOGRS DE JESUS BOMFIM" no Omie): `mesmoVendedor` casa os dois.
// =============================================================================
import { dataISO, diasEntre, somarDias, textoNorm } from './normalizar';
import type { ClienteIV, FonteProposta } from './tipos';

export interface FonteVisitaEquipe {
  id: number;
  vendedor_id: number | null;
  propriedade_id: number | null;
  tipo: string | null;
  data_visita: string | null;
  latitude: number | null;
  retroativa: boolean | null;
  acionar_pos_vendas: boolean | null;
  pos_vendas_resolvido: boolean | null;
  data_proximo_contato: string | null;
  resumo: string | null;
  proximos_passos: string | null;
  cliente_nome: string | null;
  propriedade_nome: string | null;
  deleted_at?: string | null;
}

export interface FonteNegocioEquipe { id: number; vendedor_id: number | null; status: string | null; valor: number | null; updated_at: string | null }
export interface FontePedido { vendedor: string | null; data_emissao: string | null; valor_total: number | null; categoria: string | null; cancelada: string | null; etapa: string | null; cliente: string | null }

const ABERTOS_CRM = ['prospeccao', 'andamento', 'solicitacao_proposta', 'apresentacao_proposta', 'contorno_objecoes'];
const MAQUINA = /venda de (tratores|implementos)/i;
const PECAS = /revenda de pe[cç]as/i;

/** "Joaquim Fernando Leme" × "JOAQUIM FERNANDO LEME" × "DOUGRAS MOGRS DE JESUS BOMFIM" × "DOUGRAS BOMFIM". */
export function mesmoVendedor(a: unknown, b: unknown): boolean {
  const ta = textoNorm(a).replace(/^tecnicos? /, '').split(' ').filter((t) => t.length > 2 && !['dos', 'das', 'de'].includes(t));
  const tb = textoNorm(b).replace(/^tecnicos? /, '').split(' ').filter((t) => t.length > 2 && !['dos', 'das', 'de'].includes(t));
  if (!ta.length || !tb.length) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (curto.length === 1) return curto[0] === longo[0] && curto[0].length >= 5; // "FERNANDO", "PAULO"… só com o 1º nome
  return curto[0] === longo[0] && curto.every((t) => longo.includes(t));
}

export type Situacao = 'ativo' | 'atencao' | 'parado' | 'sem_crm';

export interface LinhaEquipe {
  id: number;
  nome: string;
  situacao: Situacao;
  // CRM
  visitas7: number; visitas30: number; visitas90: number;
  presenciais30: number; semGps30: number; retroativas30: number;
  clientesVisitados30: number;
  /** visitas por semana, 8 semanas, da mais antiga à atual */
  visitasSemanas: number[];
  ultimaVisita: string; diasSemVisita: number | null;
  retornosVencidos: number;
  posVendasPendentes: number;
  negociosAbertos: number; valorNegocios: number;
  // propostas
  propostasAbertas: number; valorPropostas: number; propostasParadas: number; semProximoContato: number;
  ganhas90: number; perdidas90: number;
  // Omie 12 meses
  pedidosMaquina12m: number; vendasMaquina12m: number; vendasPecas12m: number;
  // carteira
  carteira: number; carteiraComOportunidade: number; carteiraSemVisita: number;
  alertas: string[];
  ultimasVisitas: FonteVisitaEquipe[];
  propostas: { id: number; cliente: string; oque: string; valor: number; fase: string; dias: number | null; proximo: string }[];
}

const valorBR = (s: unknown): number => {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim();
  if (!t) return 0;
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Dias úteis (seg–sex) entre duas datas ISO — "3 dias sem visita" no fim de semana não é problema. */
export function diasUteisEntre(a: string, b: string): number | null {
  const total = diasEntre(a, b);
  if (total == null || total < 0) return null;
  let uteis = 0;
  for (let i = 1; i <= Math.min(total, 400); i++) {
    const d = new Date(`${somarDias(a, i)}T12:00:00Z`).getUTCDay();
    if (d !== 0 && d !== 6) uteis++;
  }
  return uteis;
}

export function montarEquipe(e: {
  vendedores: { id: number; nome: string; ativo?: boolean | null }[];
  visitas: FonteVisitaEquipe[];
  negocios: FonteNegocioEquipe[];
  propostas: (FonteProposta & { vendedor_id?: number | null; dias_na_fase?: number | null })[];
  pedidos: FontePedido[];
  clientes: ClienteIV[];
  hoje: string;
}): LinhaEquipe[] {
  const { hoje } = e;
  const d7 = somarDias(hoje, -7), d30 = somarDias(hoje, -30), d90 = somarDias(hoje, -90), d365 = somarDias(hoje, -365), d180 = somarDias(hoje, -180);
  const visitas = e.visitas.filter((v) => !v.deleted_at);

  // última visita de cada propriedade (de qualquer vendedor): retorno combinado vale só nela
  const ultimaDaProp = new Map<number, FonteVisitaEquipe>();
  for (const v of visitas) {
    if (v.propriedade_id == null) continue;
    const a = ultimaDaProp.get(v.propriedade_id);
    if (!a || String(v.data_visita) > String(a.data_visita)) ultimaDaProp.set(v.propriedade_id, v);
  }

  const linhas: LinhaEquipe[] = [];
  for (const vd of e.vendedores) {
    if (vd.ativo === false || /teste/i.test(vd.nome)) continue;
    const vv = visitas.filter((v) => v.vendedor_id === vd.id).sort((a, b) => String(b.data_visita).localeCompare(String(a.data_visita)));
    const em = (x: FonteVisitaEquipe, desde: string) => dataISO(x.data_visita) >= desde;
    const v30 = vv.filter((x) => em(x, d30));
    const ultima = vv[0] ? dataISO(vv[0].data_visita) : '';
    const diasSem = ultima ? diasUteisEntre(ultima, hoje) : null;

    const retornosVencidos = [...ultimaDaProp.values()].filter((x) => x.vendedor_id === vd.id && x.data_proximo_contato
      && dataISO(x.data_proximo_contato) < hoje).length;
    const negs = e.negocios.filter((n) => n.vendedor_id === vd.id && ABERTOS_CRM.includes(String(n.status)));

    const props = e.propostas.filter((p) => p.status !== 'Lixeira' && (p.vendedor_id === vd.id || (!p.vendedor_id && mesmoVendedor(p.vendedor_nome, vd.nome))));
    const abertas = props.filter((p) => p.em_aberto);
    const fechadas90 = props.filter((p) => !p.em_aberto && dataISO(p.fechado_em || p.status_desde) >= d90);

    const peds = e.pedidos.filter((p) => String(p.cancelada).toUpperCase() !== 'SIM' && /FATURADO|ENTREGUE/i.test(String(p.etapa))
      && dataISO(p.data_emissao) >= d365 && mesmoVendedor(p.vendedor, vd.nome));
    const maq = peds.filter((p) => MAQUINA.test(String(p.categoria)));
    const pec = peds.filter((p) => PECAS.test(String(p.categoria)));

    const carteira = e.clientes.filter((c) => c.vendedor && mesmoVendedor(c.vendedor, vd.nome));

    const l: LinhaEquipe = {
      id: vd.id, nome: vd.nome, situacao: 'ativo',
      visitas7: vv.filter((x) => em(x, d7)).length, visitas30: v30.length, visitas90: vv.filter((x) => em(x, d90)).length,
      presenciais30: v30.filter((x) => x.tipo === 'presencial').length,
      semGps30: v30.filter((x) => x.tipo === 'presencial' && !x.latitude).length,
      retroativas30: v30.filter((x) => x.retroativa).length,
      visitasSemanas: Array.from({ length: 8 }, (_, i) => {
        const ini = somarDias(hoje, -7 * (8 - i)), fim = somarDias(hoje, -7 * (7 - i));
        return vv.filter((x) => { const d = dataISO(x.data_visita); return d > ini && d <= fim; }).length;
      }),
      clientesVisitados30: new Set(v30.map((x) => x.propriedade_id).filter((x) => x != null)).size,
      ultimaVisita: ultima, diasSemVisita: diasSem, retornosVencidos,
      posVendasPendentes: vv.filter((x) => x.acionar_pos_vendas && !x.pos_vendas_resolvido).length,
      negociosAbertos: negs.length, valorNegocios: negs.reduce((s, n) => s + (Number(n.valor) || 0), 0),
      propostasAbertas: abertas.length, valorPropostas: abertas.reduce((s, p) => s + valorBR(p.Valor_Total), 0),
      propostasParadas: abertas.filter((p) => (p.dias_na_fase ?? diasEntre(dataISO(p.status_desde || p.criado_em), hoje) ?? 0) > 15).length,
      semProximoContato: abertas.filter((p) => !p.proximo_contato).length,
      ganhas90: fechadas90.filter((p) => p.status === 'Concluida-Vendido').length,
      perdidas90: fechadas90.filter((p) => p.status !== 'Concluida-Vendido').length,
      pedidosMaquina12m: maq.length, vendasMaquina12m: maq.reduce((s, p) => s + (Number(p.valor_total) || 0), 0),
      vendasPecas12m: pec.reduce((s, p) => s + (Number(p.valor_total) || 0), 0),
      carteira: carteira.length,
      carteiraComOportunidade: carteira.filter((c) => c.oportunidades.length > 0).length,
      carteiraSemVisita: carteira.filter((c) => c.qtdTratores > 0 && (!c.ultimaVisita || c.ultimaVisita < d180)).length,
      alertas: [],
      ultimasVisitas: vv.slice(0, 40),
      propostas: abertas.map((p) => ({
        id: p.id, cliente: String(p.Cliente || ''), oque: [p.Marca, p.Modelo].filter(Boolean).join(' '), valor: valorBR(p.Valor_Total),
        fase: String(p.status || ''), dias: p.dias_na_fase ?? diasEntre(dataISO(p.status_desde || p.criado_em), hoje), proximo: dataISO(p.proximo_contato),
      })).sort((a, b) => b.valor - a.valor),
    };

    if (vv.length === 0) l.alertas.push('Nunca registrou visita no CRM');
    else if ((diasSem ?? 0) > 7) l.alertas.push(`${diasSem} dias úteis sem visita`);
    else if ((diasSem ?? 0) > 3) l.alertas.push(`${diasSem} dias úteis sem visita`);
    if (l.semGps30) l.alertas.push(`${l.semGps30} visita(s) presencial(is) sem GPS em 30 dias`);
    if (l.retroativas30) l.alertas.push(`${l.retroativas30} visita(s) lançada(s) depois (retroativa) em 30 dias`);
    if (l.retornosVencidos) l.alertas.push(`${l.retornosVencidos} retorno(s) combinado(s) vencido(s)`);
    if (l.propostasParadas) l.alertas.push(`${l.propostasParadas} proposta(s) parada(s) há mais de 15 dias`);
    if (l.posVendasPendentes) l.alertas.push(`${l.posVendasPendentes} pedido(s) ao pós-vendas sem resposta`);

    l.situacao = vv.length === 0 ? 'sem_crm' : (diasSem ?? 99) > 7 ? 'parado' : (diasSem ?? 0) > 3 || l.semGps30 > 0 || l.retornosVencidos > 0 ? 'atencao' : 'ativo';
    linhas.push(l);
  }
  const ordem: Record<Situacao, number> = { parado: 0, atencao: 1, ativo: 2, sem_crm: 3 };
  return linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.visitas30 - a.visitas30 || a.nome.localeCompare(b.nome));
}
