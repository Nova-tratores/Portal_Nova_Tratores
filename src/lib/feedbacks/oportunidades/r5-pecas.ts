// R5 — Venda de peças (cliente parado).
//
// Cliente que JÁ comprou peça antes (tem pedido em `pedidos`) mas o último
// pedido foi há ≥ min_meses_sem_pedido (default 6). Diferente do R3 (que
// abrange clientes com 1+ trator), R5 não exige trator — basta ter histórico
// de compra de peças.
//
// Prioridade Urgente se passou bastante do prazo (≥2× o mínimo).

import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
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

  // Fornecedores (oficinas, fornecedores de peças, prestadores — de quem a
  // Nova/Castro COMPRA) às vezes aparecem como "cliente" em pedidos de venda
  // (devolução, venda pontual) e não devem virar oportunidade de venda de
  // peças. Identificamos pela tag "Fornecedor" do cadastro Omie (clientes_omie)
  // e também pelo cadastro manual de Fornecedores (financeiro/requisições).
  const fornecedores = await carregarFornecedores();
  console.log(`[R5] fornecedores a excluir: ${fornecedores.size}`);

  let descartadosForn = 0;
  const out: OportunidadeR5[] = [];
  for (const [keyNorm, ultimo] of ultimoPedido.entries()) {
    if (fornecedores.has(keyNorm)) { descartadosForn++; continue; }

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
  console.log(`[R5] oportunidades geradas: ${out.length} (descartados ${descartadosForn} fornecedores)`);
  return out;
}

// Carrega nomes de fornecedores normalizados (trim + upper) para casar com a
// chave de `pedidos_venda_relatorio`. Duas fontes:
//   1) cadastro Omie com tag "Fornecedor" (clientes_omie.tags) — fonte principal
//   2) cadastro manual em `Fornecedores` (financeiro/requisições) — reforço
async function carregarFornecedores(): Promise<Set<string>> {
  const set = new Set<string>();

  // 1) Omie: qualquer cadastro marcado com a tag "Fornecedor".
  //    `tags` é texto JSON, ex.: [{"tag":"Cliente"},{"tag":"Fornecedor"}].
  const omie = await lerTudo<{ razao_social: string | null; nome_fantasia: string | null }>((from, to) =>
    supabase
      .from("portal_nt_clientes_cadastro_omie")
      .select("razao_social, nome_fantasia")
      .ilike("tags", "%ornecedor%")
      .range(from, to)
  );
  for (const c of omie) {
    if (c.razao_social) set.add(c.razao_social.trim().toUpperCase());
    if (c.nome_fantasia) set.add(c.nome_fantasia.trim().toUpperCase());
  }

  // 2) Cadastro manual de Fornecedores.
  const fornecedores = await lerTudo<{ nome: string | null }>((from, to) =>
    supabase
      .from("Fornecedores")
      .select("nome")
      .range(from, to)
  );
  for (const f of fornecedores) {
    if (f.nome) set.add(f.nome.trim().toUpperCase());
  }
  return set;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const clientes = await lerTudo<{
    id_omie: string;
    nome_fantasia: string | null;
    razao_social: string | null;
  }>((from, to) =>
    supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select("id_omie, nome_fantasia, razao_social")
      .range(from, to)
  );
  for (const c of clientes) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
