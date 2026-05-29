// R3 — Up-sell potencial (cliente esfriado).
//
// Cliente nosso (com pelo menos 1 trator) que está há ≥ min_meses_sem_pedido
// (default 12) sem fazer qualquer pedido em `pedidos`. Cliente bem frio —
// boa hora pra oferecer implemento, novo trator, ou um pacote de revisão.
//
// Diferente do R2 (que olha só Ordem_Servico + feedback), R3 olha a tabela
// de pedidos PPV — abrange clientes que talvez não passem na oficina mas
// também não compram peça.

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";
import { carregarUltimoPedidoPorCliente, mesesEntre } from "./_pedidos";

interface ParametrosR3 {
  min_meses_sem_pedido?: number;  // default 12
}

interface OportunidadeR3 {
  regra: "R3_upsell";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

interface TratorRow {
  Cliente: string;
  Modelo: string;
  Chassis: string;
  Entrega: string | null;
  Cidade?: string;
  Vendedor?: string;
}

export async function computarR3(parametros: ParametrosR3 = {}): Promise<OportunidadeR3[]> {
  const minMeses = parametros.min_meses_sem_pedido ?? 12;
  const hoje = new Date();
  console.log(`[R3] start — minMeses=${minMeses}`);

  // 1) Todos os clientes com pelo menos 1 trator nosso
  const tratores = await lerTudo<TratorRow>((from, to) =>
    supabase
      .from("tratores")
      .select("Cliente, Modelo, Chassis, Entrega, Cidade, Vendedor")
      .range(from, to)
  );
  console.log(`[R3] tratores carregados: ${tratores.length}`);

  const porCliente = new Map<string, TratorRow[]>();
  const nomeOriginal = new Map<string, string>();
  for (const t of tratores) {
    const key = norm(t.Cliente);
    if (!key) continue;
    if (!porCliente.has(key)) porCliente.set(key, []);
    porCliente.get(key)!.push(t);
    if (!nomeOriginal.has(key)) nomeOriginal.set(key, t.Cliente);
  }
  console.log(`[R3] clientes unicos em tratores: ${porCliente.size}`);

  // 2) Último pedido (qualquer Tipo_Pedido, exceto Cancelada) por cliente
  const ultimoPedido = await carregarUltimoPedidoPorCliente();
  console.log(`[R3] clientes com pedido: ${ultimoPedido.size}`);

  // 3) Mapa cliente→codigo_omie
  const mapOmie = await carregarMapaClientes();

  const out: OportunidadeR3[] = [];
  for (const [keyNorm, tratoresCliente] of porCliente.entries()) {
    const ultimo = ultimoPedido.get(keyNorm);
    let mesesDesde: number;
    let temPedido: boolean;
    if (ultimo) {
      mesesDesde = mesesEntre(ultimo.data, hoje);
      temPedido = true;
      if (mesesDesde < minMeses) continue;  // pedido recente — pula
    } else {
      mesesDesde = Infinity;
      temPedido = false;
    }

    // Pega o trator mais antigo (entrega mais antiga) como referência primária
    const tratoresOrdenados = [...tratoresCliente].sort((a, b) => {
      const da = a.Entrega || "9999-99-99";
      const db = b.Entrega || "9999-99-99";
      return da.localeCompare(db);
    });
    const tMaisAntigo = tratoresOrdenados[0];
    // Trator MAIS recente entregue — referência de "última interação" quando não tem PV
    const tMaisRecente = tratoresOrdenados[tratoresOrdenados.length - 1];

    // Politica: descarta cliente que nao bate com Clientes do Omie.
    // Cadastros em tratores estao inconsistentes (chassi errado, nome divergente).
    const codigoOmie = mapOmie.get(keyNorm);
    if (!codigoOmie) continue;

    out.push({
      regra: "R3_upsell",
      codigo_omie: codigoOmie,
      cliente_nome: nomeOriginal.get(keyNorm) || keyNorm,
      trator: tratoresCliente.length === 1 ? `${tMaisAntigo.Modelo || ""} — ${tMaisAntigo.Chassis || ""}`.trim() : null,
      chassis: tratoresCliente.length === 1 ? (tMaisAntigo.Chassis || null) : null,
      prioridade: "Normal",
      detalhes: {
        total_equipamentos: tratoresCliente.length,
        ultimo_pedido: ultimo ? ultimo.data.toISOString() : null,
        ultimo_pedido_numero: ultimo?.numero_venda ?? null,
        ultimo_pedido_empresa: ultimo?.empresa ?? null,
        ultimo_pedido_etapa: ultimo?.etapa ?? null,
        ultimo_pedido_vendedor: ultimo?.vendedor ?? null,
        meses_sem_pedido: temPedido ? mesesDesde : null,
        sem_pedido_historico: !temPedido,
        // Fallback quando não há PV — usar info do trator mais recente entregue
        entrega_data: tMaisRecente.Entrega ?? null,
        entrega_trator: `${tMaisRecente.Modelo || ""} — ${tMaisRecente.Chassis || ""}`.trim(),
        sugestao: temPedido
          ? `${tratoresCliente.length} trator(es). Último pedido há ${mesesDesde} meses — esfriou, oferecer implemento/trator novo.`
          : `${tratoresCliente.length} trator(es). Sem PV no histórico (compra antiga ou nome divergente).`,
      },
    });
  }
  console.log(`[R3] oportunidades geradas: ${out.length}`);
  return out;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const clientes = await lerTudo<{
    id_omie: string;
    nome_fantasia: string | null;
    razao_social: string | null;
  }>((from, to) =>
    supabase
      .from("Clientes")
      .select("id_omie, nome_fantasia, razao_social")
      .range(from, to)
  );
  for (const c of clientes) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
