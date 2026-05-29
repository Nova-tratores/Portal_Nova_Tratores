// R5 — Venda de peças (cliente parado).
//
// Cliente que JÁ comprou peça antes (tem pedido em `pedidos`) mas o último
// pedido foi há ≥ min_meses_sem_pedido (default 6). Diferente do R3 (que
// abrange clientes com 1+ trator), R5 não exige trator — basta ter histórico
// de compra de peças.
//
// Prioridade Urgente se passou bastante do prazo (≥2× o mínimo).

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";
import { carregarUltimoPedidoPorCliente, mesesEntre } from "./_pedidos";

interface ParametrosR5 {
  min_meses_sem_pedido?: number;  // default 6
}

interface OportunidadeR5 {
  regra: "R5_pecas";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: null;
  chassis: null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

export async function computarR5(parametros: ParametrosR5 = {}): Promise<OportunidadeR5[]> {
  const minMeses = parametros.min_meses_sem_pedido ?? 6;
  const hoje = new Date();
  console.log(`[R5] start — minMeses=${minMeses}`);

  const ultimoPedido = await carregarUltimoPedidoPorCliente();
  console.log(`[R5] clientes com pedido no historico: ${ultimoPedido.size}`);

  const mapOmie = await carregarMapaClientes();

  const out: OportunidadeR5[] = [];
  for (const [keyNorm, ultimo] of ultimoPedido.entries()) {
    const mesesDesde = mesesEntre(ultimo.data, hoje);
    if (mesesDesde < minMeses) continue;

    const prioridade: "Urgente" | "Normal" = mesesDesde >= minMeses * 2 ? "Urgente" : "Normal";

    out.push({
      regra: "R5_pecas",
      codigo_omie: mapOmie.get(keyNorm) ?? null,
      cliente_nome: keyNorm,  // já vem trim+upper de carregarUltimoPedidoPorCliente
      trator: null,
      chassis: null,
      prioridade,
      detalhes: {
        ultimo_pedido: ultimo.data.toISOString(),
        ultimo_pedido_numero: ultimo.numero_venda,
        ultimo_pedido_empresa: ultimo.empresa,
        ultimo_pedido_etapa: ultimo.etapa,
        ultimo_pedido_vendedor: ultimo.vendedor,
        meses_sem_pedido: mesesDesde,
        sugestao: `Última compra de peça há ${mesesDesde} meses — oferecer reposição/manutenção.`,
      },
    });
  }
  console.log(`[R5] oportunidades geradas: ${out.length}`);
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
