// Checklist mensal dos veículos: quem fez, quem não fez, quem fez suspeito.
// Cruza os técnicos com veículo (tecnico_veiculos, NT Mecânico), os veículos
// da frota sem responsável e os carros de VENDEDOR (responsável da Frota que é
// vendedor do app de vendas) com os checklists do mês (veiculo_checklist e o
// Chamado Veicular do app de vendas, chamados_veiculares tipo checklist).
// Usado por GET /api/frota/checklists-mes e pela aba Hoje.
//
// Correções de 10/10/2026 (o "16 não fizeram" não era confiável):
//  - veículo com o checklist DESLIGADO na Ficha (parado no pátio) não cobra
//  - a mesma placa atribuída a dois técnicos virava duas linhas → uma linha só,
//    com os nomes juntos
//  - a placa sai sempre no formato da placa (AAA-0A00), nunca o texto cru
//    "STRADA - ATJ6211" da Rota Exata
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverPlaca, extrairPlacaDeNumPlaca, formatarPlaca } from '@/lib/frota/placa';
import { responsavelVazio, mesmaPessoa } from '@/lib/frota/responsavel';

export type StatusChecklist = 'ok' | 'suspeito' | 'em_andamento' | 'pendente';

export interface ItemChecklistMes {
  origem: 'tecnico' | 'nao_vinculado' | 'vendedor';
  tecnico_nome: string;
  placa: string;      // formatada (AAA-0A00)
  placa_key: string;  // canônica, sem hífen (para links)
  descricao: string;
  status: StatusChecklist;
  score: number | null;
  km: number | null;
  fim_em: string | null;
  checklist_id: string | null;
  /** origem 'vendedor': id em `vendedores` (app de vendas) — pra "Pedir checklist" */
  vendedor_id?: number | null;
}

export interface ResumoChecklistMes {
  total: number; pendente: number; suspeito: number; em_andamento: number; ok: number;
}

const norm = (s: string | null | undefined) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function classificarChecklist(status: string | null, score: number | null): StatusChecklist {
  const s = (status || '').toLowerCase();
  if (s === 'suspeito' || (score != null && score < 50)) return 'suspeito';
  if (s === 'completo') return 'ok';
  return 'em_andamento';
}

export type VendedorApp = { id: number; nome: string };
/** Vendedor do app de vendas que é o responsável do carro (mesmo nome, tolerante). */
export function vendedorDoResponsavel(nome: string | null | undefined, vendedores: VendedorApp[]): VendedorApp | null {
  if (responsavelVazio(nome)) return null;
  return vendedores.find((v) => mesmaPessoa(v.nome, nome)) || null;
}

export type ChamadoChecklist = { placa_id: number | string | null; placa: string | null; created_at: string };
/** Último checklist do mês feito pelo app de vendas, por placa canônica. */
export function checklistsAppPorPlaca(
  chamados: ChamadoChecklist[], placaDoSupaId: Map<string, string>,
): Map<string, ChamadoChecklist> {
  const out = new Map<string, ChamadoChecklist>();
  for (const c of chamados) {
    const p = (c.placa_id != null && placaDoSupaId.get(String(c.placa_id))) || resolverPlaca(extrairPlacaDeNumPlaca(c.placa));
    if (!p) continue;
    const atual = out.get(p);
    if (!atual || c.created_at > atual.created_at) out.set(p, c);
  }
  return out;
}

/** Link do app de vendas que abre o checklist do carro já selecionado. */
export function linkChecklistApp(placaKey: string): string {
  return `/chamado-veicular?placa=${encodeURIComponent(placaKey)}&tipo=checklist&checklist=mensal`;
}

const ORDEM: Record<StatusChecklist, number> = { pendente: 0, suspeito: 1, em_andamento: 2, ok: 3 };
const MELHOR: Record<StatusChecklist, number> = { ok: 3, em_andamento: 2, suspeito: 1, pendente: 0 };

/** Uma linha por placa: junta técnicos que dividem o carro, fica com o melhor checklist. */
export function juntarPorPlaca(itens: ItemChecklistMes[]): ItemChecklistMes[] {
  const porPlaca = new Map<string, ItemChecklistMes>();
  const semPlaca: ItemChecklistMes[] = [];
  for (const it of itens) {
    if (!it.placa_key) { semPlaca.push(it); continue; }
    const atual = porPlaca.get(it.placa_key);
    if (!atual) { porPlaca.set(it.placa_key, { ...it }); continue; }
    const nomes = new Set([...atual.tecnico_nome.split(' / '), it.tecnico_nome].filter((n) => n && n !== '—'));
    const base = MELHOR[it.status] > MELHOR[atual.status] ? { ...it } : atual;
    base.tecnico_nome = [...nomes].join(' / ') || '—';
    porPlaca.set(it.placa_key, base);
  }
  return [...porPlaca.values(), ...semPlaca];
}

export function ordenarEResumir(itens: ItemChecklistMes[]): { itens: ItemChecklistMes[]; resumo: ResumoChecklistMes } {
  const ord = [...itens].sort((a, b) => (ORDEM[a.status] - ORDEM[b.status]) || a.tecnico_nome.localeCompare(b.tecnico_nome));
  return {
    itens: ord,
    resumo: {
      total: ord.length,
      pendente: ord.filter((i) => i.status === 'pendente').length,
      suspeito: ord.filter((i) => i.status === 'suspeito').length,
      em_andamento: ord.filter((i) => i.status === 'em_andamento').length,
      ok: ord.filter((i) => i.status === 'ok').length,
    },
  };
}

export async function listarChecklistsMes(supabase: SupabaseClient, mes: string): Promise<{ itens: ItemChecklistMes[]; resumo: ResumoChecklistMes }> {
  const lerVeics = async () => {
    const r = await supabase.from('frota_veiculos').select('id, placa, modelo, ativo, tipo_registro, checklist_desativado, supa_placa_id');
    if (!r.error) return r.data || [];
    // sem a coluna checklist_desativado (migração antiga): todo veículo cobra
    const r2 = await supabase.from('frota_veiculos').select('id, placa, modelo, ativo, tipo_registro');
    return (r2.data || []) as { id: string; placa: string; modelo: string | null; ativo: boolean; tipo_registro: string; checklist_desativado?: boolean; supa_placa_id?: number | string | null }[];
  };
  const [ano, mm] = mes.split('-').map(Number);
  const fimMes = new Date(Date.UTC(ano, mm, 1)).toISOString().slice(0, 10);
  const [atrib, chks, veics, resp, vends, chamados] = await Promise.all([
    supabase.from('tecnico_veiculos').select('tecnico_nome, placa, descricao'),
    supabase.from('veiculo_checklist').select('id, tecnico_nome, placa, status, score_confianca, km, fim_em').eq('mes_referencia', mes),
    lerVeics(),
    supabase.from('frota_responsaveis').select('veiculo_id, motorista_nome').is('fim', null),
    // app de vendas: leitura tolerante — falhou, o bloco de vendedor some
    supabase.from('vendedores').select('id, nome').eq('ativo', true),
    supabase.from('chamados_veiculares').select('placa_id, placa, created_at')
      .eq('tipo', 'checklist').gte('created_at', `${mes}-01`).lt('created_at', fimMes),
  ]);

  // checklist por técnico (normalizado) e por placa canônica — dois caminhos de match
  type Chk = { id: string; tecnico_nome: string | null; placa: string | null; status: string | null; score_confianca: number | null; km: number | null; fim_em: string | null };
  const porTecnico = new Map<string, Chk>();
  const porPlaca = new Map<string, Chk>();
  for (const c of (chks.data || []) as Chk[]) {
    if (c.tecnico_nome) porTecnico.set(norm(c.tecnico_nome), c);
    const p = resolverPlaca(extrairPlacaDeNumPlaca(c.placa));
    if (p) porPlaca.set(p, c);
  }

  const veicPorPlaca = new Map<string, (typeof veics)[number]>();
  for (const v of veics) veicPorPlaca.set(v.placa, v);
  const desligado = (placa: string) => !!veicPorPlaca.get(placa)?.checklist_desativado;
  // só conta como "tem responsável" se o nome não for placeholder (Vazio, etc.)
  const idsComResp = new Set((resp.data || []).filter((r) => !responsavelVazio(r.motorista_nome)).map((r) => r.veiculo_id));
  const placasTecnico = new Set((atrib.data || []).map((tv) => resolverPlaca(extrairPlacaDeNumPlaca(tv.placa))).filter(Boolean));

  const vendedores = (vends.error ? [] : vends.data || []) as VendedorApp[];
  const placaDoSupaId = new Map(veics.filter((v) => v.supa_placa_id != null).map((v) => [String(v.supa_placa_id), v.placa]));
  const chkApp = checklistsAppPorPlaca((chamados.error ? [] : chamados.data || []) as ChamadoChecklist[], placaDoSupaId);
  const respPorVeiculo = new Map((resp.data || []).map((r) => [r.veiculo_id, r.motorista_nome as string | null]));

  const itens: ItemChecklistMes[] = [];
  // 1) Veículos atribuídos a técnicos (NT Mecânico)
  for (const tv of atrib.data || []) {
    const placaCanon = resolverPlaca(extrairPlacaDeNumPlaca(tv.placa));
    if (placaCanon && desligado(placaCanon)) continue;
    const chk = porTecnico.get(norm(tv.tecnico_nome)) || porPlaca.get(placaCanon) || null;
    const v = veicPorPlaca.get(placaCanon);
    itens.push({
      origem: 'tecnico',
      tecnico_nome: tv.tecnico_nome || '—',
      placa: placaCanon ? formatarPlaca(placaCanon) : (tv.placa || '—'),
      placa_key: placaCanon || '',
      descricao: v?.modelo || tv.descricao || '',
      status: chk ? classificarChecklist(chk.status, chk.score_confianca) : 'pendente',
      score: chk?.score_confianca ?? null,
      km: chk?.km ?? null,
      fim_em: chk?.fim_em ?? null,
      checklist_id: chk?.id ?? null,
    });
  }

  // 2) Veículos SEM responsável (Frota) e que não são de técnico — qualquer usuário
  //    do Frota faz pelo portal. Se não fez no mês, entra como pendente.
  for (const v of veics) {
    if (!v.ativo || v.tipo_registro !== 'veiculo') continue;
    if (idsComResp.has(v.id)) continue;      // tem responsável na Frota
    if (placasTecnico.has(v.placa)) continue; // é de um técnico
    if (v.checklist_desativado) continue;    // parado no pátio: não cobra
    const chk = porPlaca.get(v.placa) || null;
    itens.push({
      origem: 'nao_vinculado',
      tecnico_nome: chk?.tecnico_nome || '(sem responsável)',
      placa: formatarPlaca(v.placa),
      placa_key: v.placa || '',
      descricao: v.modelo || '',
      status: chk ? classificarChecklist(chk.status, chk.score_confianca) : 'pendente',
      score: chk?.score_confianca ?? null,
      km: chk?.km ?? null,
      fim_em: chk?.fim_em ?? null,
      checklist_id: chk?.id ?? null,
    });
  }

  // 3) Carros com responsável que é VENDEDOR do app de vendas: vale o checklist
  //    feito pelo app (Chamado Veicular) ou pelo portal. Responsável que não
  //    casa com vendedor segue fora da cobrança, como antes.
  for (const v of veics) {
    if (!v.ativo || v.tipo_registro !== 'veiculo' || v.checklist_desativado) continue;
    if (!idsComResp.has(v.id) || placasTecnico.has(v.placa)) continue;
    const vend = vendedorDoResponsavel(respPorVeiculo.get(v.id), vendedores);
    if (!vend) continue;
    const app = chkApp.get(v.placa);
    const chk = porPlaca.get(v.placa) || null;
    itens.push({
      origem: 'vendedor',
      tecnico_nome: vend.nome,
      placa: formatarPlaca(v.placa),
      placa_key: v.placa || '',
      descricao: v.modelo || '',
      status: app ? 'ok' : chk ? classificarChecklist(chk.status, chk.score_confianca) : 'pendente',
      score: app ? null : chk?.score_confianca ?? null,
      km: app ? null : chk?.km ?? null,
      fim_em: app ? app.created_at : chk?.fim_em ?? null,
      checklist_id: app ? null : chk?.id ?? null,
      vendedor_id: vend.id,
    });
  }

  return ordenarEResumir(juntarPorPlaca(itens));
}
