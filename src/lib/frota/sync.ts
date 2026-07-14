// =============================================================================
// SYNC Rota Exata -> espelhos do Frota (frota_*).
//
// Regra do módulo: espelha o que é REMOTO. Todo write é upsert em chave natural
// (re_id / origem+origem_id / adesao_id+data) — rodar 2x dá o mesmo resultado.
//
// Duas varreduras (cada uma tem cron próprio):
//   syncCadastro()  1x/dia   -> /usuarios, /adesoes, /motoristas, /destinos, /odometro
//   syncEventos()   2x/dia   -> /multas, /manutencoes, /custos
//
// Decisões verificadas contra a API real (14/07/2026):
// - tipo_custo, fornecedor e integracao são OBJETOS ({nome...}) -> extraímos o nome.
// - custos com integracao "veloe_abastecimento" = o MESMO gasto do CSV do
//   cartão-frota (tabela abastecimentos). A view de custos exclui combustível
//   do RE — senão o gasto dobra.
// - O vínculo /motoristas não traz dt_inicio neste tenant -> fallback `created`.
// - `page` da Rota Exata é OFFSET EM REGISTROS (fetchTudo já trata).
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { fetchTudo } from '@/lib/pos/rastreamento';
import { resolverPlaca } from '@/lib/frota/placa';

// Service role OBRIGATÓRIA: com o RLS P1 (sem policy de escrita), o fallback
// para anon faria os writes falharem EM SILÊNCIO. Preferimos falhar alto.
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Sync do Frota exige SUPABASE_SERVICE_ROLE_KEY (sem fallback anon).');
  return createClient(url, key, { auth: { persistSession: false } });
}

const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dia = (v: unknown): string | null => {
  const s = String(v ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
// nome de um campo que pode vir string OU objeto {nome}
const nomeDe = (v: any): string | null =>
  typeof v === 'string' ? str(v) : str(v?.nome ?? v?.nome_integracao);

// upsert em lotes (payloads de shape FIXO — chave faltando num objeto do array
// viraria NULL na linha dos outros, footgun do PostgREST)
async function upsertLotes(
  supabase: ReturnType<typeof db>,
  tabela: string,
  linhas: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < linhas.length; i += 300) {
    const { error } = await supabase.from(tabela).upsert(linhas.slice(i, i + 300), { onConflict });
    if (error) throw new Error(`${tabela}: ${error.message}`);
  }
}

interface Veiculo {
  id: string;
  placa: string;
  adesao_id: number | null;
  campos_manuais: string[];
}

async function mapaVeiculos(supabase: ReturnType<typeof db>) {
  const { data, error } = await supabase
    .from('frota_veiculos')
    .select('id, placa, adesao_id, campos_manuais');
  if (error) throw new Error(`frota_veiculos: ${error.message}`);
  const porPlaca = new Map<string, Veiculo>();
  const porAdesao = new Map<number, Veiculo>();
  for (const v of (data || []) as Veiculo[]) {
    porPlaca.set(v.placa, v);
    if (v.adesao_id != null) porAdesao.set(Number(v.adesao_id), v);
  }
  // apelidos tambem resolvem para o veiculo certo
  const { data: aliases } = await supabase.from('frota_veiculos_alias').select('placa_alias, veiculo_id');
  for (const a of aliases || []) {
    const alvo = [...porPlaca.values()].find((v) => v.id === a.veiculo_id);
    if (alvo) porPlaca.set(String(a.placa_alias), alvo);
  }
  return { porPlaca, porAdesao };
}

async function mapaMotoristas(supabase: ReturnType<typeof db>) {
  const { data, error } = await supabase.from('frota_motoristas').select('id, re_id');
  if (error) throw new Error(`frota_motoristas: ${error.message}`);
  const porReId = new Map<number, string>();
  for (const m of data || []) if (m.re_id != null) porReId.set(Number(m.re_id), m.id);
  return porReId;
}

// =============================================================================
// CADASTRO — /usuarios, /adesoes, /motoristas, /destinos, /odometro
// =============================================================================
export async function syncCadastro() {
  const supabase = db();
  const agora = new Date().toISOString();
  const resumo: Record<string, number> = {};

  // 1) /usuarios -> frota_motoristas (o RE usa 0/1 para flags)
  const usuarios = await fetchTudo('/usuarios');
  await upsertLotes(
    supabase,
    'frota_motoristas',
    usuarios
      .filter((u: any) => u.id != null && str(u.nome))
      .map((u: any) => ({
        re_id: Number(u.id),
        nome: String(u.nome).trim(),
        cpf: str(u.cpf),
        email: str(u.email),
        telefone: str(u.telefone),
        cargo: str(u.cargo),
        ativo: u.ativo === 1 || u.ativo === true,
        gestor: u.gestor === 1 || u.gestor === true,
        e_motorista: u.motorista === 1 || u.motorista === true,
        re_raw: u,
        visto_em: agora,
      })),
    're_id',
  );
  resumo.motoristas = usuarios.length;

  // 2) /adesoes -> frota_veiculos (merge que respeita campos_manuais)
  const adesoes = await fetchTudo('/adesoes');
  const { porPlaca, porAdesao } = await mapaVeiculos(supabase);
  const adesoesVistas = new Set<number>();
  let veiculosNovos = 0;

  for (const ad of adesoes) {
    const adesaoId = Number(ad.id);
    if (!Number.isFinite(adesaoId)) continue;
    adesoesVistas.add(adesaoId);
    const placa = resolverPlaca(ad.vei_placa);
    if (!placa) continue;

    // Campos espelhados da Rota Exata (chave = coluna nossa)
    const espelho: Record<string, unknown> = {
      descricao: str(ad.vei_descricao),
      cor: str(ad.vei_cor),
      chassi: str(ad.vei_chassi),
      renavam: str(ad.vei_renavam),
      ano: num(ad.vei_ano),
      ano_modelo: num(ad.vei_ano_modelo),
      tipo_veiculo: str(ad.tipo_veiculo),
      capacidade_tanque: num(ad.capacidade_tanque),
      custo_km_ref: num(ad.custo_km),
      numero_apolice: str(ad.numero_apolice),
      dt_aquisicao: dia(ad.dt_aquisicao),
      tipo_negociacao: str(ad.tipo_negociacao),
    };

    const existente = porAdesao.get(adesaoId) || porPlaca.get(placa);
    if (existente) {
      const upd: Record<string, unknown> = {
        re_raw: ad,
        visto_em: agora,
        ausente_na_origem: false,
      };
      if (existente.adesao_id == null) upd.adesao_id = adesaoId; // liga o rastreador (ATJ6211/FXM4G90)
      const manuais = existente.campos_manuais || [];
      for (const [campo, valor] of Object.entries(espelho)) {
        if (manuais.includes(campo)) continue; // humano venceu, para sempre
        if (valor !== null) upd[campo] = valor; // preenche buraco / corrige
      }
      const { error } = await supabase.from('frota_veiculos').update(upd).eq('id', existente.id);
      if (error) throw new Error(`frota_veiculos(${placa}): ${error.message}`);
    } else {
      const { error } = await supabase.from('frota_veiculos').insert({
        placa,
        placa_exibicao: str(ad.vei_placa) || placa,
        adesao_id: adesaoId,
        origem_cadastro: 'rotaexata',
        pendencia_vinculo: true, // sem par em Placas/SupaPlacas -> aba Pendências
        ...espelho,
        re_raw: ad,
        visto_em: agora,
      });
      if (error) throw new Error(`frota_veiculos insert(${placa}): ${error.message}`);
      veiculosNovos++;
    }
  }
  // some da origem >0 dias: marca, nunca apaga
  const rastreados = [...porAdesao.keys()];
  const sumidos = rastreados.filter((a) => !adesoesVistas.has(a));
  if (sumidos.length > 0) {
    await supabase.from('frota_veiculos').update({ ausente_na_origem: true }).in('adesao_id', sumidos);
  }
  resumo.adesoes = adesoes.length;
  resumo.veiculos_novos = veiculosNovos;

  // 3) /motoristas -> frota_responsaveis (o vínculo carro<->condutor, com histórico)
  const { porAdesao: porAdesao2 } = await mapaVeiculos(supabase); // re-lê (adesao_id novos)
  const porReId = await mapaMotoristas(supabase);
  const vinculos = (await fetchTudo('/motoristas'))
    .filter((m: any) => m._id && m.adesao_id != null)
    .map((m: any) => {
      const veic = porAdesao2.get(Number(m.adesao_id));
      const motoristaRe = Number(m.motorista_id ?? m.motorista?.id);
      return veic
        ? {
            re_id: String(m._id),
            veiculo_id: veic.id,
            motorista_id: porReId.get(motoristaRe) || null,
            motorista_nome: str(m.motorista?.nome),
            // este tenant não manda dt_inicio -> o começo do vínculo é o created
            inicio: dia(m.dt_inicio) || dia(m.created) || dia(agora)!,
            fim: dia(m.final),
            modo: str(m.modo),
            origem: 'rotaexata',
            _adesao: Number(m.adesao_id),
          }
        : null;
    })
    .filter(Boolean) as any[];

  // uq_frota_resp_aberto: só UM vínculo aberto por carro. Se o RE tiver dois em
  // aberto pro mesmo carro, o mais recente fica aberto e o anterior é fechado
  // no início do mais novo (interpretação: trocou de mãos ali).
  const abertosPorVeiculo = new Map<string, any[]>();
  for (const v of vinculos) {
    if (v.fim) continue;
    const l = abertosPorVeiculo.get(v.veiculo_id) || [];
    l.push(v);
    abertosPorVeiculo.set(v.veiculo_id, l);
  }
  for (const lista of abertosPorVeiculo.values()) {
    lista.sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
    for (let i = 1; i < lista.length; i++) lista[i].fim = lista[0].inicio;
  }
  await upsertLotes(
    supabase,
    'frota_responsaveis',
    vinculos.map(({ _adesao, ...v }) => v),
    're_id',
  );
  resumo.responsaveis = vinculos.length;

  // 4) /destinos -> frota_geocercas
  const destinos = await fetchTudo('/destinos');
  const classeDe = (d: any): string => {
    const nome = String(d.nome || '').toLowerCase();
    const tipos = (Array.isArray(d.tipo_local) ? d.tipo_local : []).map((t: string) => t.toLowerCase());
    if (nome.includes('nova tratores')) return 'loja';
    if (tipos.some((t: string) => t.includes('cliente'))) return 'cliente';
    if (tipos.some((t: string) => t.includes('manuten'))) return 'manutencao';
    if (tipos.some((t: string) => t.includes('estacionamento'))) return 'estacionamento';
    if (tipos.some((t: string) => t.includes('descarga'))) return 'descarga';
    return 'outro';
  };
  await upsertLotes(
    supabase,
    'frota_geocercas',
    destinos
      .filter((d: any) => (d.id ?? d._id) != null && num(d.latitude) && num(d.longitude))
      .map((d: any) => ({
        re_id: Number(d.id ?? d._id),
        nome: str(d.nome) || '(sem nome)',
        latitude: Number(d.latitude),
        longitude: Number(d.longitude),
        raio_m: num(d.raio) || 500,
        tipo_local: Array.isArray(d.tipo_local) ? d.tipo_local : [],
        classe: classeDe(d),
        endereco: str(d.endereco),
        cnpj: str(d.cnpj),
        origem: 'rotaexata',
        re_raw: d,
        visto_em: agora,
      })),
    're_id',
  );
  resumo.geocercas = destinos.length;

  // 5) /odometro -> frota_odometro (a fonte BOA de km; valores vêm em METROS)
  const odometros = (await fetchTudo('/odometro')).sort((a: any, b: any) =>
    String(a.created).localeCompare(String(b.created)),
  ); // asc: o upsert deixa a leitura mais RECENTE do dia
  const linhasOdo: Record<string, unknown>[] = [];
  for (const o of odometros) {
    const veic = porAdesao2.get(Number(o.adesao_id));
    const data = dia(o.created);
    if (!veic || !data) continue;
    linhasOdo.push({
      adesao_id: Number(o.adesao_id),
      veiculo_id: veic.id,
      data,
      km_adesao: num(o.odometro_adesao) != null ? Number(o.odometro_adesao) / 1000 : null,
      km_rastreador: num(o.odometro_rastreador) != null ? Number(o.odometro_rastreador) / 1000 : null,
      re_raw: o,
    });
  }
  // dedup por (adesao,data) DENTRO do lote (o upsert não aceita a mesma chave 2x)
  const porChave = new Map<string, Record<string, unknown>>();
  for (const l of linhasOdo) porChave.set(`${l.adesao_id}|${l.data}`, l); // fica a última (mais recente)
  await upsertLotes(supabase, 'frota_odometro', [...porChave.values()], 'adesao_id,data');
  resumo.odometro = porChave.size;

  return resumo;
}

// =============================================================================
// EVENTOS — /multas, /manutencoes, /custos
// =============================================================================
export async function syncEventos() {
  const supabase = db();
  const agora = new Date().toISOString();
  const resumo: Record<string, number> = {};
  const { porPlaca, porAdesao } = await mapaVeiculos(supabase);
  const porReId = await mapaMotoristas(supabase);

  const acharVeiculo = (adesao: any): Veiculo | undefined => {
    const porId = adesao?.id != null ? porAdesao.get(Number(adesao.id)) : undefined;
    return porId || porPlaca.get(resolverPlaca(adesao?.vei_placa));
  };

  // 1) /multas — já vem com o motorista (nome, CPF, CNH), local e imagens
  const multas = await fetchTudo('/multas');

  // responsáveis vigentes, pra bandeira de divergência
  const { data: resp } = await supabase
    .from('frota_responsaveis')
    .select('veiculo_id, motorista_id, inicio, fim');
  const vigenteEm = (veiculoId: string, dataIso: string | null): string | null => {
    if (!dataIso) return null;
    const d = dataIso.slice(0, 10);
    const v = (resp || []).find(
      (r) => r.veiculo_id === veiculoId && r.inicio <= d && (r.fim === null || r.fim >= d),
    );
    return v?.motorista_id ?? null;
  };

  const linhasMultas: Record<string, unknown>[] = [];
  for (const m of multas) {
    if (!m._id) continue;
    const veic = acharVeiculo(m.adesao);
    const placa = veic?.placa || resolverPlaca(m.adesao?.vei_placa) || '(desconhecida)';
    const motoristaReId = m.motorista?.id != null ? Number(m.motorista.id) : null;
    const motoristaId = motoristaReId != null ? porReId.get(motoristaReId) || null : null;

    // O RE pode carimbar o motorista ATUAL, não o da data da infração — compara
    // com o responsável vigente e levanta a bandeira; quem decide é o RH.
    const vigente = veic ? vigenteEm(veic.id, str(m.dt_multa)) : null;
    const divergente = !!(vigente && motoristaId && vigente !== motoristaId);

    linhasMultas.push({
      re_id: String(m._id),
      veiculo_id: veic?.id ?? null,
      placa,
      adesao_id: m.adesao?.id != null ? Number(m.adesao.id) : null,
      tipo: str(m.tipo),
      numero_auto: str(m.numero_auto),
      codigo: str(m.codigo),
      descricao: str(m.descricao),
      nivel_infracao: str(m.nivel_infracao),
      pontos: num(m.pontos),
      valor: num(m.valor),
      dt_multa: str(m.dt_multa),
      dt_vencimento: dia(m.dt_vencimento),
      dt_defesa: dia(m.dt_defesa),
      situacao: str(m.situacao),
      odometro: num(m.odometro),
      motorista_id: motoristaId,
      motorista_nome: str(m.motorista?.nome),
      motorista_cpf: str(m.motorista?.cpf),
      motorista_cnh: str(m.motorista?.cnh),
      local_endereco: str(m.local?.endereco),
      local_lat: num(m.local?.latitude),
      local_lng: num(m.local?.longitude),
      imagens: Array.isArray(m.imagens) ? m.imagens : [],
      re_raw: m,
      visto_em: agora,
      motorista_divergente: divergente,
      // status_interno / responsavel_id / desconto*: colunas do PORTAL — nunca
      // entram neste payload (senão o sync sobrescreveria a decisão do RH).
    });

    // brinde: a multa traz CNH/validade do motorista — enriquece o cadastro
    if (motoristaReId != null && (str(m.motorista?.cnh) || dia(m.motorista?.cnh_validade))) {
      await supabase
        .from('frota_motoristas')
        .update({
          cnh: str(m.motorista?.cnh),
          cnh_validade: dia(m.motorista?.cnh_validade),
        })
        .eq('re_id', motoristaReId);
    }
  }
  await upsertLotes(supabase, 'frota_multas', linhasMultas, 're_id');
  resumo.multas = linhasMultas.length;

  // 2) /manutencoes
  const manutencoes = await fetchTudo('/manutencoes');
  await upsertLotes(
    supabase,
    'frota_manutencoes',
    manutencoes
      .filter((x: any) => x.id != null)
      .map((x: any) => {
        const veic = x.adesao_id != null ? porAdesao.get(Number(x.adesao_id)) : undefined;
        return {
          origem: 'rotaexata',
          origem_id: String(x.id),
          veiculo_id: veic?.id ?? null,
          placa: veic?.placa || '(desconhecida)',
          adesao_id: num(x.adesao_id),
          tipo: str(x.tipo),
          status: str(x.status),
          observacao: str(x.observacao) || str(x.observacoes),
          valor_total: num(x.valor_total),
          hodometro_realizado: num(x.hodometro_realizado),
          hodometro_vencimento: num(x.hodometro_vencimento),
          dt_agendamento: dia(x.dt_agendamento),
          dt_realizado: dia(x.dt_realizado),
          dt_vencimento: dia(x.dt_vencimento),
          kms_restantes: num(x.kms_restantes),
          dias_restantes: num(x.dias_restantes),
          manutencao_por_km: x.manutencao_por_km ?? null,
          manutencao_por_tempo: x.manutencao_por_tempo ?? null,
          plano_id: num(x.plano_id),
          custo_id: num(x.custo_id),
          decorrente_sinistro: !!x.decorrente_sinistro,
          re_raw: x,
          visto_em: agora,
        };
      }),
    'origem,origem_id',
  );
  resumo.manutencoes = manutencoes.length;

  // 3) /custos (471+; tipo_custo/fornecedor/integracao são objetos)
  const custos = await fetchTudo('/custos');
  await upsertLotes(
    supabase,
    'frota_custos',
    custos
      .filter((c: any) => c._id && dia(c.dt_lancamento))
      .map((c: any) => {
        const veic = acharVeiculo(c.adesao);
        return {
          re_id: String(c._id),
          veiculo_id: veic?.id ?? null,
          placa: veic?.placa || resolverPlaca(c.adesao?.vei_placa) || '(desconhecida)',
          adesao_id: c.adesao?.id != null ? Number(c.adesao.id) : null,
          dt_lancamento: dia(c.dt_lancamento)!,
          tipo_custo: nomeDe(c.tipo_custo),
          km_veiculo: num(c.km_veiculo),
          valor: num(c.valor),
          valor_litro: num(c.valor_litro),
          litros: num(c.litros),
          tipo_combustivel: nomeDe(c.tipo_combustivel),
          fornecedor: nomeDe(c.fornecedor),
          descricao: str(c.descricao),
          parcelado: !!c.parcelado,
          mensalidade: !!c.mensalidade,
          integracao: nomeDe(c.integracao),
          re_raw: c,
          visto_em: agora,
          // ignorar_no_total: coluna do portal — fora do payload.
        };
      }),
    're_id',
  );
  resumo.custos = custos.length;

  return resumo;
}
