// MOTOR DE SINCRONIZAÇÃO das pendências automáticas da frota (frota_pendencias).
// Abre e fecha sozinho, a partir de 5 fontes:
//  - CADASTRO:    régua da Ficha (RENAVAM, CRLV, multas...) — fecha quando a
//                 Ficha é regularizada; resolvida na mão, reabre em 30 dias
//                 se a causa continuar
//  - CHECKLIST:   item "problema" do checklist mais recente — fecha quando o
//                 checklist seguinte vem OK
//  - REQUISIÇÃO:  requisição "Veicular Manutenção" abre pendência no carro
//                 (com o hodômetro como km) e FECHA sozinha quando a
//                 requisição chega ao status "financeiro" (Enviado Financeiro)
//  - OS DO PÓS:   OS aberta com o PROJETO contendo a placa do carro (ex.
//                 "CARGO-AQJ3H59") abre pendência e FECHA quando a OS conclui
//  - OPA:         Opa vinculado a um veículo (vinculo_tipo='veiculo' +
//                 vinculo_ref=placa) abre pendência e FECHA quando alguém
//                 marca o Opa como resolvido
// Usado pelo GET /api/frota/pendencias?sync=1 e pelo POST /api/frota/pendencias/sync.
import { createClient } from '@supabase/supabase-js';
import { pendenciasDetalhadas } from '@/lib/frota/pendencias';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

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

const GRACA_MANUAL_MS = 30 * 86400_000; // cadastro resolvido na mão: 30 dias antes de reabrir

export async function sincronizarPendencias(): Promise<void> {
  const agora = Date.now();
  const limite30d = new Date(agora + 30 * 86400_000).toISOString().slice(0, 10);
  const d12 = new Date(); d12.setMonth(d12.getMonth() - 12);
  const mesLimite = `${d12.getFullYear()}-${String(d12.getMonth() + 1).padStart(2, '0')}`;
  const d120 = new Date(agora - 120 * 86400_000).toISOString().slice(0, 10);

  const [veic, multas, docs, comps, rows, checklists, reqsVm, osComProjeto] = await Promise.all([
    supabase.from('frota_veiculos').select('id, placa, id_placa, status, ativo, pendencia_vinculo, renavam, chassi, proprietario, exercicio_crlv, tipo_registro'),
    supabase.from('frota_multas').select('veiculo_id').not('status_interno', 'in', '("paga","descontada","arquivada")'),
    supabase.from('frota_documentos').select('veiculo_id, tipo, vigencia_fim'),
    supabase.from('frota_componentes').select('id, sistema, subsistema, componente'),
    supabase.from('frota_pendencias').select('id, placa, origem, origem_ref, status, resolvida_em, data_ocorrencia, vinculo_tipo, vinculo_ref'),
    supabase.from('veiculo_checklist').select('id, placa, mes_referencia').gte('mes_referencia', mesLimite).order('mes_referencia', { ascending: false }),
    supabase.from('Requisicao').select('id, titulo, status, veiculo, hodometro, data').eq('tipo', 'Veicular Manutenção').gte('data', d120),
    supabase.from('Ordem_Servico').select('Id_Ordem, Projeto, Status, Data').not('Projeto', 'is', null).gte('Data', d120),
  ]);
  if (veic.error || rows.error) return; // sem dados, sem sync (o GET reporta o erro real)

  const compId = new Map<string, string>();
  for (const c of comps.data || []) compId.set(`${c.sistema}|${c.subsistema || ''}|${c.componente || ''}`, c.id);
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
  for (const m of multas.data || []) {
    if (m.veiculo_id) multasPorVeiculo.set(m.veiculo_id, (multasPorVeiculo.get(m.veiculo_id) || 0) + 1);
  }
  const docsVencendo = new Map<string, number>();
  const temCrlv = new Set<string>();
  for (const doc of docs.data || []) {
    if (doc.tipo === 'crlv') temCrlv.add(doc.veiculo_id);
    if (doc.vigencia_fim && String(doc.vigencia_fim) <= limite30d) {
      docsVencendo.set(doc.veiculo_id, (docsVencendo.get(doc.veiculo_id) || 0) + 1);
    }
  }

  // índice das pendências existentes por (placa|origem|origem_ref)
  type Row = { id: string; placa: string; origem: string; origem_ref: string | null; status: string; resolvida_em: string | null; data_ocorrencia: string | null; vinculo_tipo: string | null; vinculo_ref: string | null };
  const porChave = new Map<string, Row[]>();
  // pendência (de qualquer origem) VINCULADA a uma requisição — nasce assim
  // quando a pendência manual cria a requisição pelo checkbox. Serve pra:
  // (a) o bloco de requisições não abrir uma SEGUNDA pendência pra mesma req;
  // (b) fechar a pendência vinculada quando a req chega ao financeiro.
  const vinculadasPorReq = new Map<string, Row[]>();
  for (const r of (rows.data || []) as Row[]) {
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

  const inserts: any[] = [];
  const autoResolver: { id: string; resolucao: string; vinculo_tipo?: 'requisicao' | 'os'; vinculo_ref?: string }[] = [];

  // ── CADASTRO/DOCUMENTAÇÃO ──
  for (const v of veic.data || []) {
    if (v.tipo_registro !== 'veiculo' || !v.placa) continue;
    const det = pendenciasDetalhadas({
      status: v.status, ativo: v.ativo, pendencia_vinculo: !!v.pendencia_vinculo,
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
      inserts.push({ placa: v.placa, veiculo_id: v.id, origem: 'cadastro', origem_ref: p.slug, titulo: p.titulo, componente_id: compOutros, status: 'aberta', aberta_por: 'Sistema' });
    }
    // regularizou na Ficha → fecha sozinho
    for (const r of (rows.data || []) as Row[]) {
      if (r.placa === v.placa && r.origem === 'cadastro' && r.status === 'aberta' && r.origem_ref && !ativos.has(r.origem_ref)) {
        autoResolver.push({ id: r.id, resolucao: 'Regularizado na Ficha do veículo — a régua de cadastro não aponta mais esta pendência.' });
      }
    }
  }

  // ── CHECKLIST (último checklist de cada placa) ──
  if (!checklists.error) {
    const ultimoPorPlaca = new Map<string, { id: string; placa: string; mes: string }>();
    for (const c of checklists.data || []) {
      if (c.placa && !ultimoPorPlaca.has(c.placa)) ultimoPorPlaca.set(c.placa, { id: c.id, placa: c.placa, mes: c.mes_referencia });
    }
    const ids = [...ultimoPorPlaca.values()].map((c) => c.id);
    if (ids.length) {
      const { data: itens } = await supabase
        .from('veiculo_checklist_itens')
        .select('checklist_id, item_key, titulo, observacao, foto_url, resposta')
        .in('checklist_id', ids);
      const infoPorId = new Map([...ultimoPorPlaca.values()].map((c) => [c.id, c]));
      const problemasPorPlaca = new Map<string, Map<string, any>>();
      for (const i of itens || []) {
        const c = infoPorId.get(i.checklist_id);
        if (!c) continue;
        if (String(i.resposta || '') !== 'problema') continue;
        const m = problemasPorPlaca.get(c.placa) || new Map();
        m.set(i.item_key, { ...i, mes: c.mes });
        problemasPorPlaca.set(c.placa, m);
      }
      for (const [placa, chk] of ultimoPorPlaca) {
        const problemas = problemasPorPlaca.get(placa) || new Map();
        for (const [itemKey, item] of problemas) {
          const k = `${placa}|checklist|${itemKey}`;
          if (abertaDe(k)) continue;
          const ult = ultimaResolvida(k);
          // só reabre se o problema é de um checklist NOVO (depois da resolução)
          if (ult && ult.resolvida_em && `${item.mes}-01` <= ult.resolvida_em.slice(0, 10)) continue;
          inserts.push({
            placa, origem: 'checklist', origem_ref: itemKey, titulo: item.titulo || itemKey,
            descricao: item.observacao || null, foto_url: item.foto_url || null,
            data_ocorrencia: `${item.mes}-01`, componente_id: compDoItem(itemKey),
            status: 'aberta', aberta_por: 'Sistema (checklist)',
          });
        }
        // item veio OK num checklist mais novo → fecha sozinho
        for (const r of (rows.data || []) as Row[]) {
          if (r.placa !== placa || r.origem !== 'checklist' || r.status !== 'aberta' || !r.origem_ref) continue;
          if (problemas.has(r.origem_ref)) continue;
          const mesRow = (r.data_ocorrencia || '').slice(0, 7);
          if (mesRow && chk.mes > mesRow) {
            autoResolver.push({ id: r.id, resolucao: `Item veio OK no checklist de ${chk.mes.slice(5, 7)}/${chk.mes.slice(0, 4)}.` });
          }
        }
      }
    }
  }

  // ── REQUISIÇÕES "Veicular Manutenção": abre no carro e fecha no financeiro ──
  if (!reqsVm.error) {
    const placaPorIdPlaca = new Map<string, string>();
    for (const v of veic.data || []) {
      if ((v as any).id_placa != null && v.placa) placaPorIdPlaca.set(String((v as any).id_placa), v.placa);
    }
    for (const r of reqsVm.data || []) {
      const placa = placaPorIdPlaca.get(String(r.veiculo ?? '').trim());
      if (!placa) continue;
      const k = `${placa}|requisicao|${r.id}`;
      const aberta = abertaDe(k);
      const finalizada = ['financeiro', 'concluido'].includes(String(r.status || ''));
      const kmDigitos = String(r.hodometro || '').replace(/\D/g, '');
      const vinculadas = vinculadasPorReq.get(String(r.id)) || [];
      // req nascida de uma pendência (checkbox): a pendência original já
      // cobre o problema — fecha ELA no financeiro e não abre uma segunda
      if (vinculadas.length > 0) {
        if (finalizada) {
          for (const p of vinculadas) {
            if (p.status === 'aberta') {
              autoResolver.push({ id: p.id, resolucao: `Requisição #${r.id} enviada ao financeiro.`, vinculo_tipo: 'requisicao', vinculo_ref: String(r.id) });
            }
          }
        }
        continue;
      }
      if (!aberta && !finalizada && !ultimaResolvida(k)) {
        inserts.push({
          placa, origem: 'requisicao', origem_ref: String(r.id),
          titulo: r.titulo || `Manutenção veicular — Req #${r.id}`,
          descricao: `Aberta pela requisição #${r.id} (Veicular Manutenção).`,
          componente_id: compDoTexto(String(r.titulo || '')),
          km: kmDigitos ? Number(kmDigitos) : null,
          data_ocorrencia: /^\d{4}-\d{2}-\d{2}/.test(String(r.data || '')) ? String(r.data).slice(0, 10) : null,
          status: 'aberta', aberta_por: 'Sistema (requisição)',
        });
      }
      if (aberta && finalizada) {
        autoResolver.push({ id: aberta.id, resolucao: `Requisição #${r.id} enviada ao financeiro.`, vinculo_tipo: 'requisicao', vinculo_ref: String(r.id) });
      }
    }
  }

  // ── OS DO PÓS com o projeto do carro (ex.: "CARGO-AQJ3H59") ──
  if (!osComProjeto.error) {
    const norm = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const placasAtivas = (veic.data || [])
      .filter((v) => v.tipo_registro === 'veiculo' && v.placa && v.ativo)
      .map((v) => ({ placa: v.placa as string, norm: norm(v.placa as string) }))
      .filter((p) => p.norm.length >= 7);
    for (const o of osComProjeto.data || []) {
      const projN = norm(o.Projeto);
      if (!projN) continue;
      const match = placasAtivas.find((p) => projN.includes(p.norm));
      if (!match) continue;
      const idOs = String(o.Id_Ordem);
      const k = `${match.placa}|os|${idOs}`;
      const aberta = abertaDe(k);
      const st = String(o.Status || '');
      const finalizada = /^conclu/i.test(st) || /^cancelad/i.test(st);
      if (!aberta && !finalizada && !ultimaResolvida(k)) {
        inserts.push({
          placa: match.placa, origem: 'os', origem_ref: idOs,
          titulo: `Manutenção na oficina — ${idOs}`,
          descricao: `OS aberta com o projeto do veículo (${o.Projeto}).`,
          data_ocorrencia: o.Data || null,
          status: 'aberta', aberta_por: 'Sistema (OS)',
        });
      }
      if (aberta && finalizada) {
        autoResolver.push({
          id: aberta.id,
          resolucao: /^cancelad/i.test(st) ? `${idOs} cancelada.` : `${idOs} concluída na oficina.`,
          vinculo_tipo: 'os', vinculo_ref: idOs,
        });
      }
    }
  }

  // ── OPA vinculado a veículo: abre no carro e fecha quando o Opa é resolvido ──
  // Leitura tolerante: se a migração opa-vinculo-veiculo ainda não rodou
  // (colunas vinculo_*), o select falha e o bloco é pulado sem quebrar o sync.
  const opas = await supabase
    .from('portal_opas')
    .select('id, titulo, descricao, status, created_at, vinculo_tipo, vinculo_ref, resolvido_por_nome')
    .eq('vinculo_tipo', 'veiculo')
    .gte('created_at', d120);
  if (!opas.error) {
    const placasValidas = new Set(
      (veic.data || []).filter((v) => v.tipo_registro === 'veiculo' && v.placa).map((v) => String(v.placa).toUpperCase()),
    );
    // foto: primeiro anexo de IMAGEM do Opa (vídeo não vira thumbnail)
    const idsNovos = (opas.data || [])
      .filter((o) => o.status === 'aberto' && placasValidas.has(String(o.vinculo_ref || '').toUpperCase()))
      .map((o) => o.id);
    const fotoPorOpa = new Map<string, string>();
    if (idsNovos.length) {
      const { data: anx } = await supabase
        .from('portal_opas_anexos')
        .select('opa_id, url, tipo')
        .in('opa_id', idsNovos)
        .order('created_at', { ascending: true });
      for (const a of anx || []) {
        if (String(a.tipo || '').startsWith('image') && !fotoPorOpa.has(a.opa_id)) fotoPorOpa.set(a.opa_id, a.url);
      }
    }
    for (const o of opas.data || []) {
      const placa = String(o.vinculo_ref || '').toUpperCase();
      if (!placasValidas.has(placa)) continue;
      const k = `${placa}|opa|${o.id}`;
      const aberta = abertaDe(k);
      const resolvido = o.status === 'resolvido';
      if (!aberta && !resolvido && !ultimaResolvida(k)) {
        inserts.push({
          placa, origem: 'opa', origem_ref: String(o.id),
          titulo: o.titulo || 'Opa no veículo',
          descricao: o.descricao || 'Sinalizado pelo Opa.',
          foto_url: fotoPorOpa.get(o.id) || null,
          componente_id: compDoTexto(`${o.titulo || ''} ${o.descricao || ''}`),
          data_ocorrencia: String(o.created_at || '').slice(0, 10) || null,
          status: 'aberta', aberta_por: 'Sistema (Opa)',
        });
      }
      if (aberta && resolvido) {
        autoResolver.push({ id: aberta.id, resolucao: `Opa resolvido${o.resolvido_por_nome ? ` por ${o.resolvido_por_nome}` : ''}.` });
      }
    }
  }

  const agoraIso = new Date().toISOString();
  await Promise.all([
    inserts.length ? supabase.from('frota_pendencias').insert(inserts) : Promise.resolve(null as any),
    ...autoResolver.map((a) =>
      supabase.from('frota_pendencias')
        .update({
          status: 'resolvida', resolvida_por: 'Sistema', resolvida_em: agoraIso, resolucao: a.resolucao,
          ...(a.vinculo_tipo ? { vinculo_tipo: a.vinculo_tipo, vinculo_ref: a.vinculo_ref || null } : {}),
        })
        .eq('id', a.id).eq('status', 'aberta'),
    ),
  ]);
}
