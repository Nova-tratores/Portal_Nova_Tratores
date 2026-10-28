// Casca de banco do CRM automático (regras em crm-automatico.ts). Só servidor.
// Chamado pelo agendador ('feedbacks-crm-automatico', 06:20) com gravar=true;
// gravar=false = simulação (não escreve nada).
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { paginar, emLotes } from "@/lib/db/paginar";
import {
  CRM_AUTO_INTERVALO_CLIENTE_DIAS, chaveContato, contaDaEmpresa, hojeSaoPaulo, janelaCrmAuto, montarLote,
  somarDias, temTagNaoContatar,
  type Contato, type CrmInsert, type LinhaOS, type MotivoPulo,
} from "./crm-automatico";
import { clienteKey } from "./types";

export type ResultadoCrmAuto =
  | {
      gravar: boolean;
      hoje: string;
      janela: { de: string; ate: string };
      candidatas: number;
      /** gravar=true: inseridas; gravar=false: as que SERIAM criadas */
      criadas: number;
      puladas: Partial<Record<MotivoPulo | "ja_existe" | "erro", number>>;
      amostra: CrmInsert[];
      erros?: string[];
    }
  | { pulado: string };

const COLS_OS = "num_os, cod_os, empresa, cod_cli, cliente_nome, data_faturamento, valor_total, faturada, cancelada, vendedor, contrato, descricao";
const SQL_FALTA = "falta rodar sql/feedbacks-crm-automatico.sql";

function faltaColuna(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || /does not exist|could not find .* column/i.test(err.message || "");
}

function falhou(onde: string, err: { message: string } | null): void {
  if (err) throw new Error(`${onde}: ${err.message}`);
}

export async function gerarCrmDasOS({ gravar, agora = new Date() }: { gravar: boolean; agora?: Date }): Promise<ResultadoCrmAuto> {
  // migration aplicada?
  const sonda = await sb.from("feedback_registros").select("id, os_ref, os_valor, faturado_em, origem_auto").limit(1);
  if (faltaColuna(sonda.error)) return { pulado: SQL_FALTA };
  falhou("feedback_registros", sonda.error);

  const hoje = hojeSaoPaulo(agora);
  const janela = janelaCrmAuto(hoje);

  const os = await paginar<LinhaOS>((de, ate) =>
    sb.from("portal_nt_clientes_os").select(COLS_OS)
      .eq("faturada", true).gte("data_faturamento", janela.de).lte("data_faturamento", janela.ate)
      .order("cod_os", { ascending: true }).range(de, ate) as unknown as PromiseLike<{ data: LinhaOS[] | null; error: { message: string } | null }>);
  falhou("portal_nt_clientes_os", os.error);
  const linhas = os.data;

  const codigos = [...new Set(linhas.map((l) => (l.cod_cli == null ? "" : String(l.cod_cli).trim())).filter(Boolean))];
  const refs = [...new Set(linhas.map((l) => {
    const c = contaDaEmpresa(l.empresa); const n = String(l.num_os ?? "").trim();
    return c && n ? `${c}:${n}` : "";
  }).filter(Boolean))];

  const desdeCliente = `${somarDias(hoje, -CRM_AUTO_INTERVALO_CLIENTE_DIAS)}T00:00:00-03:00`;
  const chavesInfo = [...new Set(linhas.flatMap((l) => {
    const cod = l.cod_cli == null ? null : String(l.cod_cli);
    const nome = String(l.cliente_nome || "");
    return [clienteKey(cod, nome), clienteKey(null, nome)];
  }))];

  type Resp<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  const [existentes, recentes, infos, cadastro] = await Promise.all([
    emLotes<{ os_ref: string | null }, string>(refs, (p) =>
      sb.from("feedback_registros").select("os_ref").in("os_ref", p) as unknown as Resp<{ os_ref: string | null }>),
    emLotes<{ codigo_omie: string | null }, string>(codigos, (p) =>
      sb.from("feedback_registros").select("codigo_omie").eq("tipo", "crm").in("codigo_omie", p).gte("criado_em", desdeCliente) as unknown as Resp<{ codigo_omie: string | null }>),
    emLotes<{ cliente_key: string; tags: unknown }, string>(chavesInfo, (p) =>
      sb.from("feedback_clientes_info").select("cliente_key, tags").in("cliente_key", p) as unknown as Resp<{ cliente_key: string; tags: unknown }>),
    emLotes<{ cod_cli: unknown; empresa: string | null; telefone: string | null; email: string | null }, string>(codigos, (p) =>
      sb.from("portal_nt_clientes_cadastro_omie").select("cod_cli, empresa, telefone, email").in("cod_cli", p) as unknown as Resp<{ cod_cli: unknown; empresa: string | null; telefone: string | null; email: string | null }>),
  ]);
  falhou("feedback_registros (os_ref)", existentes.error);
  falhou("feedback_registros (30 dias)", recentes.error);
  falhou("feedback_clientes_info", infos.error);
  falhou("portal_nt_clientes_cadastro_omie", cadastro.error);

  const contatos = new Map<string, Contato>();
  for (const c of cadastro.data) {
    if (c.cod_cli == null) continue;
    const cod = String(c.cod_cli);
    const ct = { telefone: c.telefone, email: c.email };
    const conta = contaDaEmpresa(c.empresa);
    if (conta) contatos.set(chaveContato(conta, cod), ct);
    // reserva (mesmo cliente na outra conta): só se tiver telefone ou e-mail
    if (!contatos.has(cod) && (c.telefone || c.email)) contatos.set(cod, ct);
  }

  const lote = montarLote({
    linhas,
    hoje,
    naoContatar: new Set(infos.data.filter((i) => temTagNaoContatar(i.tags)).map((i) => i.cliente_key)),
    osRefsExistentes: new Set(existentes.data.map((r) => r.os_ref).filter((r): r is string => !!r)),
    clientesRecentes: new Set(recentes.data.map((r) => r.codigo_omie).filter((r): r is string => !!r)),
    contatos,
  });

  const puladas: Partial<Record<MotivoPulo | "ja_existe" | "erro", number>> = { ...lote.puladas };
  let criadas = 0;
  const erros: string[] = [];
  if (!gravar) {
    criadas = lote.payloads.length;
  } else {
    // um a um: o índice único (tipo, os_ref) segura corrida com outra rodada
    for (const p of lote.payloads) {
      const { error } = await sb.from("feedback_registros").insert(p);
      if (!error) { criadas++; continue; }
      if ((error as { code?: string }).code === "23505") { puladas.ja_existe = (puladas.ja_existe || 0) + 1; continue; }
      if (faltaColuna(error)) return { pulado: SQL_FALTA };
      puladas.erro = (puladas.erro || 0) + 1;
      if (erros.length < 5) erros.push(`${p.os_ref}: ${error.message}`);
    }
    if (lote.payloads.length && !criadas && erros.length) throw new Error(`nenhuma ligação gravada: ${erros.join(" | ")}`);
  }

  return {
    gravar, hoje, janela, candidatas: lote.candidatas, criadas, puladas,
    amostra: lote.payloads.slice(0, 5),
    ...(erros.length ? { erros } : {}),
  };
}
