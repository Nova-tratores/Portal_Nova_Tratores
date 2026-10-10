// DECISÃO do motor de pendências da frota — função PURA (sem banco).
// Recebe tudo o que o motor leu (veículos, régua de cadastro, checklists,
// requisições, OS, Opas e as pendências que já existem) e devolve o que
// ABRIR e o que FECHAR. Quem lê e grava é `pendencias-sync.ts`.
//
// Regras por origem:
//  - CADASTRO:   régua da Ficha (RENAVAM, CRLV, multas...) — fecha quando a
//                Ficha é regularizada; resolvida na mão, reabre em 30 dias
//                se a causa continuar
//  - CHECKLIST:  item "problema" do checklist mais recente — fecha quando o
//                checklist seguinte vem OK
//  - REQUISIÇÃO: "Veicular Manutenção" abre pendência no carro (com o
//                hodômetro como km) e FECHA quando chega ao financeiro.
//                O carro é achado por `Requisicao.veiculo` = SupaPlacas.IdPlaca
//                = `frota_veiculos.supa_placa_id` (NÃO o `id_placa`, que é da
//                tabela antiga `Placas` e fica vazio em parte da frota)
//  - OS DO PÓS:  OS com o PROJETO contendo a placa (ex. "CARGO-AQJ3H59") abre
//                pendência e FECHA quando a OS conclui ou é cancelada
//  - OPA:        Opa vinculado a veículo abre e FECHA quando é resolvido
import { pendenciasDetalhadas } from '@/lib/frota/pendencias';

// item do checklist -> caminho na taxonomia (sistema | subsistema | componente)
const MAPA_CHECKLIST: Record<string, [string, string | null, string | null]> = {
  lataria_frente: ['Carroceria', 'Lataria e pintura', null],
  lataria_traseira: ['Carroceria', 'Lataria e pintura', null],
  lataria_esquerda: ['Carroceria', 'Lataria e pintura', null],
  lataria_direita: ['Carroceria', 'Lataria e pintura', null],
  parabrisa: ['Carroceria', 'Vidros e para-brisa', null],
  pneu_de: ['Rodas e Pneus', 'Pneus', null],
  pneu_dd: ['Rodas e Pneus', 'Pneus', null],
  pneu_te: ['Rodas e Pneus', 'Pneus', null],
  pneu_td: ['Rodas e Pneus', 'Pneus', null],
  estepe: ['Rodas e Pneus', 'Pneus', null],
  oleo_motor: ['Motor', 'Lubrificação', 'Óleo e filtro'],
  arrefecimento: ['Motor', 'Arrefecimento', null],
  bateria: ['Elétrica', 'Bateria', null],
  painel: ['Elétrica', 'Painel de instrumentos', null],
  limpeza_interna: ['Interior', 'Bancos e estofados', null],
  extintor: ['Itens de segurança', 'Extintor / triângulo / macaco', null],
  triangulo: ['Itens de segurança', 'Extintor / triângulo / macaco', null],
  macaco_chave: ['Itens de segurança', 'Extintor / triângulo / macaco', null],
  crlv: ['Outros', null, null],
  hodometro: ['Outros', null, null],
};

// título da requisição → componente (classificação automática por palavra-chave;
// a primeira regra que casar vence — dá pra reclassificar depois na aba)
const REGRAS_TEXTO: [RegExp, [string, string | null, string | null]][] = [
  [/alinhamento|balanceamento|rod[ií]zio/i, ['Rodas e Pneus', 'Alinhamento e balanceamento', null]],
  [/pneu/i, ['Rodas e Pneus', 'Pneus', null]],
  [/l[aâ]mpada|farol|far[óo]is|soquete|lanterna|seta/i, ['Elétrica', 'Iluminação', 'Lâmpadas e faróis']],
  [/arranque|motor de partida/i, ['Elétrica', 'Motor de partida', null]],
  [/bateria|terminal/i, ['Elétrica', 'Bateria', null]],
  [/palheta|limpador/i, ['Elétrica', 'Limpador de para-brisa', null]],
  [/el[eé]tric/i, ['Elétrica', 'Chicote e fusíveis', null]],
  [/ar.?condicionado/i, ['Ar-condicionado', 'Gás / carga', null]],
  [/escapamento|silencioso|catalisador/i, ['Motor', 'Escapamento', 'Escapamento e catalisador']],
  [/freio/i, ['Freios', 'Hidráulica', 'Flexíveis e tubulações']],
  [/embreagem/i, ['Transmissão', 'Embreagem', 'Kit de embreagem (disco/platô)']],
  [/c[aâ]mbio/i, ['Transmissão', 'Câmbio', 'Câmbio manual']],
  [/suspens|amortecedor|mola/i, ['Suspensão', 'Amortecedores', null]],
  [/tinta|lixa|pintura|lataria|funilaria/i, ['Carroceria', 'Lataria e pintura', null]],
  [/ma[çc]aneta|fechadura|batente|porta/i, ['Carroceria', 'Maçanetas e fechaduras', null]],
  [/tapete|forra[çc]/i, ['Interior', 'Tapetes e forrações', null]],
  [/banco|estofad/i, ['Interior', 'Bancos e estofados', null]],
  [/vidro|para.?brisa/i, ['Carroceria', 'Vidros e para-brisa', null]],
  [/veda[çc][aã]o|silicone|junta|retentor/i, ['Motor', 'Vedação', 'Juntas e retentores']],
  [/tanque|combust[ií]vel|boia/i, ['Motor', 'Alimentação', 'Bomba de combustível']],
  [/radiador|arrefecimento|h[ée]lice|ventoinha/i, ['Motor', 'Arrefecimento', null]],
  [/[óo]leo|revis[aã]o|filtro/i, ['Motor', 'Lubrificação', 'Óleo e filtro']],
];

export const GRACA_MANUAL_MS = 30 * 86400_000; // cadastro resolvido na mão: 30 dias antes de reabrir

export type VeiculoSync = {
  id: string; placa: string | null; supa_placa_id: number | string | null;
  status: string | null; ativo: boolean | null; pendencia_vinculo: boolean | null;
  renavam: string | null; chassi: string | null; proprietario?: string | null;
  exercicio_crlv?: number | null; tipo_registro: string | null;
};
export type PendenciaExistente = {
  id: string; placa: string; origem: string; origem_ref: string | null; status: string;
  resolvida_em: string | null; data_ocorrencia: string | null;
  vinculo_tipo: string | null; vinculo_ref: string | null;
};
export type ChecklistSync = { id: string; placa: string | null; mes_referencia: string };
export type ItemChecklistSync = {
  checklist_id: string; item_key: string; titulo: string | null;
  observacao: string | null; foto_url: string | null; resposta: string | null;
};
export type RequisicaoSync = {
  id: number | string; titulo: string | null; status: string | null;
  veiculo: number | string | null; hodometro: string | null; data: string | null;
};
export type OsSync = { Id_Ordem: string | number; Projeto: string | null; Status: string | null; Data: string | null };
export type OpaSync = {
  id: string; titulo: string | null; descricao: string | null; status: string | null;
  created_at: string | null; vinculo_ref: string | null; resolvido_por_nome: string | null;
};

export type DadosSync = {
  agora: number;
  veiculos: VeiculoSync[];
  multas: { veiculo_id: string | null }[];
  documentos: { veiculo_id: string; tipo: string | null; vigencia_fim: string | null }[];
  componentes: { id: string; sistema: string; subsistema: string | null; componente: string | null }[];
  pendencias: PendenciaExistente[];
  /** null = a leitura falhou e o bloco é pulado (não fecha nada por engano) */
  checklists: ChecklistSync[] | null;
  itensChecklist: ItemChecklistSync[];
  requisicoes: RequisicaoSync[] | null;
  os: OsSync[] | null;
  opas: OpaSync[] | null;
  fotoPorOpa: Map<string, string>;
};

export type Resolucao = { id: string; resolucao: string; vinculo_tipo?: 'requisicao' | 'os'; vinculo_ref?: string };
export type PlanoPendencias = { inserir: Record<string, unknown>[]; resolver: Resolucao[] };

/** Último checklist de cada placa (a lista vem do mais novo para o mais antigo). */
export function ultimoChecklistPorPlaca(checklists: ChecklistSync[]): Map<string, { id: string; placa: string; mes: string }> {
  const out = new Map<string, { id: string; placa: string; mes: string }>();
  for (const c of checklists) {
    if (c.placa && !out.has(c.placa)) out.set(c.placa, { id: c.id, placa: c.placa, mes: c.mes_referencia });
  }
  return out;
}

const normProjeto = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function planejarPendencias(d: DadosSync): PlanoPendencias {
  const { agora } = d;
  const limite30d = new Date(agora + 30 * 86400_000).toISOString().slice(0, 10);

  const compId = new Map<string, string>();
  for (const c of d.componentes) compId.set(`${c.sistema}|${c.subsistema || ''}|${c.componente || ''}`, c.id);
  const compDoItem = (itemKey: string): string | null => {
    const m = MAPA_CHECKLIST[itemKey];
    return m ? compId.get(`${m[0]}|${m[1] || ''}|${m[2] || ''}`) || null : null;
  };
  const compDoTexto = (txt: string): string | null => {
    for (const [re, p] of REGRAS_TEXTO) {
      if (re.test(txt)) return compId.get(`${p[0]}|${p[1] || ''}|${p[2] || ''}`) || null;
    }
    return null;
  };
  const compOutros = compId.get('Outros||') || null;

  const multasPorVeiculo = new Map<string, number>();
  for (const m of d.multas) {
    if (m.veiculo_id) multasPorVeiculo.set(m.veiculo_id, (multasPorVeiculo.get(m.veiculo_id) || 0) + 1);
  }
  const docsVencendo = new Map<string, number>();
  const temCrlv = new Set<string>();
  for (const doc of d.documentos) {
    if (doc.tipo === 'crlv') temCrlv.add(doc.veiculo_id);
    if (doc.vigencia_fim && String(doc.vigencia_fim) <= limite30d) {
      docsVencendo.set(doc.veiculo_id, (docsVencendo.get(doc.veiculo_id) || 0) + 1);
    }
  }

  // índice das pendências existentes por (placa|origem|origem_ref)
  const porChave = new Map<string, PendenciaExistente[]>();
  // pendência (de qualquer origem) VINCULADA a uma requisição — nasce assim
  // quando a pendência manual cria a requisição pelo checkbox. Serve pra:
  // (a) o bloco de requisições não abrir uma SEGUNDA pendência pra mesma req;
  // (b) fechar a pendência vinculada quando a req chega ao financeiro.
  const vinculadasPorReq = new Map<string, PendenciaExistente[]>();
  for (const r of d.pendencias) {
    const k = `${r.placa}|${r.origem}|${r.origem_ref || ''}`;
    const arr = porChave.get(k) || [];
    arr.push(r); porChave.set(k, arr);
    if (r.vinculo_tipo === 'requisicao' && r.vinculo_ref) {
      const arrV = vinculadasPorReq.get(r.vinculo_ref) || [];
      arrV.push(r); vinculadasPorReq.set(r.vinculo_ref, arrV);
    }
  }
  const abertaDe = (k: string) => (porChave.get(k) || []).find((r) => r.status === 'aberta');
  const ultimaResolvida = (k: string) =>
    (porChave.get(k) || []).filter((r) => r.status === 'resolvida' && r.resolvida_em)
      .sort((a, b) => new Date(b.resolvida_em!).getTime() - new Date(a.resolvida_em!).getTime())[0];

  const inserir: Record<string, unknown>[] = [];
  const resolver: Resolucao[] = [];
  const jaNesteCiclo = new Set<string>();   // nunca inserir a mesma chave duas vezes na mesma rodada
  const resolvendo = new Set<string>();     // nem fechar a mesma pendência duas vezes
  const abrir = (k: string, row: Record<string, unknown>) => {
    if (jaNesteCiclo.has(k)) return;
    jaNesteCiclo.add(k); inserir.push(row);
  };
  const fechar = (r: Resolucao) => {
    if (resolvendo.has(r.id)) return;
    resolvendo.add(r.id); resolver.push(r);
  };

  // ── CADASTRO/DOCUMENTAÇÃO ──
  for (const v of d.veiculos) {
    if (v.tipo_registro !== 'veiculo' || !v.placa) continue;
    const det = pendenciasDetalhadas({
      status: v.status || '', ativo: !!v.ativo, pendencia_vinculo: !!v.pendencia_vinculo,
      renavam: v.renavam, chassi: v.chassi, proprietario: v.proprietario ?? null,
      tem_crlv: temCrlv.has(v.id), docs_vencendo: docsVencendo.get(v.id) || 0,
      multas_abertas: multasPorVeiculo.get(v.id) || 0, exercicio_crlv: v.exercicio_crlv ?? null,
    });
    const ativos = new Set(det.map((p) => p.slug));
    for (const p of det) {
      const k = `${v.placa}|cadastro|${p.slug}`;
      if (abertaDe(k)) continue;
      const ult = ultimaResolvida(k);
      if (ult && agora - new Date(ult.resolvida_em!).getTime() < GRACA_MANUAL_MS) continue; // graça de 30 dias
      abrir(k, { placa: v.placa, veiculo_id: v.id, origem: 'cadastro', origem_ref: p.slug, titulo: p.titulo, componente_id: compOutros, status: 'aberta', aberta_por: 'Sistema' });
    }
    // regularizou na Ficha → fecha sozinho
    for (const r of d.pendencias) {
      if (r.placa === v.placa && r.origem === 'cadastro' && r.status === 'aberta' && r.origem_ref && !ativos.has(r.origem_ref)) {
        fechar({ id: r.id, resolucao: 'Regularizado na Ficha do veículo — a régua de cadastro não aponta mais esta pendência.' });
      }
    }
  }

  // ── CHECKLIST (último checklist de cada placa) ──
  if (d.checklists) {
    const ultimoPorPlaca = ultimoChecklistPorPlaca(d.checklists);
    const infoPorId = new Map([...ultimoPorPlaca.values()].map((c) => [c.id, c]));
    const problemasPorPlaca = new Map<string, Map<string, ItemChecklistSync & { mes: string }>>();
    for (const i of d.itensChecklist) {
      const c = infoPorId.get(i.checklist_id);
      if (!c) continue;
      if (String(i.resposta || '') !== 'problema') continue;
      const m = problemasPorPlaca.get(c.placa) || new Map();
      m.set(i.item_key, { ...i, mes: c.mes });
      problemasPorPlaca.set(c.placa, m);
    }
    for (const [placa, chk] of ultimoPorPlaca) {
      const problemas = problemasPorPlaca.get(placa) || new Map<string, ItemChecklistSync & { mes: string }>();
      for (const [itemKey, item] of problemas) {
        const k = `${placa}|checklist|${itemKey}`;
        if (abertaDe(k)) continue;
        const ult = ultimaResolvida(k);
        // só reabre se o problema é de um checklist NOVO (depois da resolução)
        if (ult && ult.resolvida_em && `${item.mes}-01` <= ult.resolvida_em.slice(0, 10)) continue;
        abrir(k, {
          placa, origem: 'checklist', origem_ref: itemKey, titulo: item.titulo || itemKey,
          descricao: item.observacao || null, foto_url: item.foto_url || null,
          data_ocorrencia: `${item.mes}-01`, componente_id: compDoItem(itemKey),
          status: 'aberta', aberta_por: 'Sistema (checklist)',
        });
      }
      // item veio OK num checklist mais novo → fecha sozinho
      for (const r of d.pendencias) {
        if (r.placa !== placa || r.origem !== 'checklist' || r.status !== 'aberta' || !r.origem_ref) continue;
        if (problemas.has(r.origem_ref)) continue;
        const mesRow = (r.data_ocorrencia || '').slice(0, 7);
        if (mesRow && chk.mes > mesRow) {
          fechar({ id: r.id, resolucao: `Item veio OK no checklist de ${chk.mes.slice(5, 7)}/${chk.mes.slice(0, 4)}.` });
        }
      }
    }
  }

  // ── REQUISIÇÕES "Veicular Manutenção": abre no carro e fecha no financeiro ──
  if (d.requisicoes) {
    const placaPorSupaId = new Map<string, string>();
    for (const v of d.veiculos) {
      if (v.supa_placa_id != null && v.placa) placaPorSupaId.set(String(v.supa_placa_id), v.placa);
    }
    const vistas = new Set<string>();
    for (const r of d.requisicoes) {
      const idReq = String(r.id);
      if (vistas.has(idReq)) continue; // a lista junta a janela recente + as abertas antigas
      vistas.add(idReq);
      const finalizada = ['financeiro', 'concluido'].includes(String(r.status || ''));
      const vinculadas = vinculadasPorReq.get(idReq) || [];
      // req nascida de uma pendência (checkbox): a pendência original já
      // cobre o problema — fecha ELA no financeiro e não abre uma segunda
      if (vinculadas.length > 0) {
        if (finalizada) {
          for (const p of vinculadas) {
            if (p.status === 'aberta') {
              fechar({ id: p.id, resolucao: `Requisição #${idReq} enviada ao financeiro.`, vinculo_tipo: 'requisicao', vinculo_ref: idReq });
            }
          }
        }
        continue;
      }
      const placa = placaPorSupaId.get(String(r.veiculo ?? '').trim());
      if (!placa) continue;
      const k = `${placa}|requisicao|${idReq}`;
      const aberta = abertaDe(k);
      const kmDigitos = String(r.hodometro || '').replace(/\D/g, '');
      if (!aberta && !finalizada && !ultimaResolvida(k)) {
        abrir(k, {
          placa, origem: 'requisicao', origem_ref: idReq,
          titulo: r.titulo || `Manutenção veicular — Req #${idReq}`,
          descricao: `Aberta pela requisição #${idReq} (Veicular Manutenção).`,
          componente_id: compDoTexto(String(r.titulo || '')),
          km: kmDigitos ? Number(kmDigitos) : null,
          data_ocorrencia: /^\d{4}-\d{2}-\d{2}/.test(String(r.data || '')) ? String(r.data).slice(0, 10) : null,
          status: 'aberta', aberta_por: 'Sistema (requisição)',
        });
      }
      if (aberta && finalizada) {
        fechar({ id: aberta.id, resolucao: `Requisição #${idReq} enviada ao financeiro.`, vinculo_tipo: 'requisicao', vinculo_ref: idReq });
      }
    }
  }

  // ── OS DO PÓS com o projeto do carro (ex.: "CARGO-AQJ3H59") ──
  if (d.os) {
    const placasAtivas = d.veiculos
      .filter((v) => v.tipo_registro === 'veiculo' && v.placa && v.ativo)
      .map((v) => ({ placa: v.placa as string, norm: normProjeto(v.placa as string) }))
      .filter((p) => p.norm.length >= 7);
    const vistas = new Set<string>();
    for (const o of d.os) {
      const idOs = String(o.Id_Ordem);
      if (vistas.has(idOs)) continue;
      vistas.add(idOs);
      const projN = normProjeto(o.Projeto || '');
      if (!projN) continue;
      const match = placasAtivas.find((p) => projN.includes(p.norm));
      if (!match) continue;
      const k = `${match.placa}|os|${idOs}`;
      const aberta = abertaDe(k);
      const st = String(o.Status || '');
      const finalizada = /^conclu/i.test(st) || /^cancelad/i.test(st);
      if (!aberta && !finalizada && !ultimaResolvida(k)) {
        abrir(k, {
          placa: match.placa, origem: 'os', origem_ref: idOs,
          titulo: `Manutenção na oficina — ${idOs}`,
          descricao: `OS aberta com o projeto do veículo (${o.Projeto}).`,
          data_ocorrencia: o.Data || null,
          status: 'aberta', aberta_por: 'Sistema (OS)',
        });
      }
      if (aberta && finalizada) {
        fechar({
          id: aberta.id,
          resolucao: /^cancelad/i.test(st) ? `${idOs} cancelada.` : `${idOs} concluída na oficina.`,
          vinculo_tipo: 'os', vinculo_ref: idOs,
        });
      }
    }
  }

  // ── OPA vinculado a veículo: abre no carro e fecha quando o Opa é resolvido ──
  if (d.opas) {
    const placasValidas = new Set(
      d.veiculos.filter((v) => v.tipo_registro === 'veiculo' && v.placa).map((v) => String(v.placa).toUpperCase()),
    );
    const vistas = new Set<string>();
    for (const o of d.opas) {
      if (vistas.has(o.id)) continue;
      vistas.add(o.id);
      const placa = String(o.vinculo_ref || '').toUpperCase();
      if (!placasValidas.has(placa)) continue;
      const k = `${placa}|opa|${o.id}`;
      const aberta = abertaDe(k);
      const resolvido = o.status === 'resolvido';
      if (!aberta && !resolvido && !ultimaResolvida(k)) {
        abrir(k, {
          placa, origem: 'opa', origem_ref: String(o.id),
          titulo: o.titulo || 'Opa no veículo',
          descricao: o.descricao || 'Sinalizado pelo Opa.',
          foto_url: d.fotoPorOpa.get(o.id) || null,
          componente_id: compDoTexto(`${o.titulo || ''} ${o.descricao || ''}`),
          data_ocorrencia: String(o.created_at || '').slice(0, 10) || null,
          status: 'aberta', aberta_por: 'Sistema (Opa)',
        });
      }
      if (aberta && resolvido) {
        fechar({ id: aberta.id, resolucao: `Opa resolvido${o.resolvido_por_nome ? ` por ${o.resolvido_por_nome}` : ''}.` });
      }
    }
  }

  return { inserir, resolver };
}

/** Referências das pendências ABERTAS que dependem de uma fonte externa —
 *  o motor busca essas fontes por id mesmo fora da janela de 120 dias,
 *  senão uma OS/requisição antiga concluída nunca fecharia a pendência. */
export function refsAbertas(pendencias: PendenciaExistente[]): { requisicoes: string[]; os: string[]; opas: string[] } {
  const req = new Set<string>(), os = new Set<string>(), opas = new Set<string>();
  for (const p of pendencias) {
    if (p.status !== 'aberta') continue;
    if (p.origem === 'requisicao' && p.origem_ref) req.add(p.origem_ref);
    if (p.vinculo_tipo === 'requisicao' && p.vinculo_ref) req.add(p.vinculo_ref);
    if (p.origem === 'os' && p.origem_ref) os.add(p.origem_ref);
    if (p.origem === 'opa' && p.origem_ref) opas.add(p.origem_ref);
  }
  return { requisicoes: [...req], os: [...os], opas: [...opas] };
}
