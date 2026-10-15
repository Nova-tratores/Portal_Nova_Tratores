// GET /api/clientes/notas?doc=<cnpj/cpf>&cod=<cód. Omie> — todas as notas fiscais da Pasta
// do cliente (José, 15/10/2026): saída e entrada pelo CNPJ/CPF da nota + as das máquinas dele
// (chassi citado na nota). Lê o cache de notas (notas_fiscais_docs); nada vai ao Omie.
import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { podeVerEntrada } from "@/lib/notas/cache-regras";
import { chassisDosProjetos, mascararDoc, motivoDaNota, soDigitos } from "@/lib/clientes/notas-cliente";

export const dynamic = "force-dynamic";

const COLS = "id,conta_omie,tipo,numero,serie,data_emissao,parte_nome,parte_doc,valor,cancelada,pdf_path,xml_path,pedido_num,os_num,maquina";

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: "clientes" }]);
  if (guarda.resposta) return guarda.resposta;
  const doc = soDigitos(req.nextUrl.searchParams.get("doc"));
  const cod = Number(req.nextUrl.searchParams.get("cod") || 0);
  if (!doc && !cod) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  const verEntrada = podeVerEntrada(guarda.user.isAdmin, guarda.user.modulos);

  // máquinas do cliente (projetos do Omie nas duas empresas)
  const filtroProj = [cod ? `cod_cli_ultimo.eq.${cod}` : "", doc ? `cnpj_cpf_ultimo.eq.${mascararDoc(doc)}` : ""].filter(Boolean).join(",");
  const [p1, p2] = await Promise.all([
    sb.from("portal_nt_projetos_PRINCIPAL").select("nome").or(filtroProj).limit(500),
    sb.from("portal_nt_projetos_chassis").select("projeto, chassis").or(filtroProj).limit(500),
  ]);
  const chassis = chassisDosProjetos([
    ...(p1.data || []).map((p) => ({ nome: p.nome as string })),
    ...(p2.data || []).map((p) => ({ nome: p.projeto as string, chassis: p.chassis as string })),
  ]);

  // notas do próprio cliente + notas que citam o chassi de uma máquina dele
  const consultas = [];
  if (doc) consultas.push(sb.from("notas_fiscais_docs").select(COLS).eq("parte_doc", doc).order("data_emissao", { ascending: false }).limit(2000));
  for (let i = 0; i < chassis.length; i += 12) {
    const grupo = chassis.slice(i, i + 12);
    consultas.push(sb.from("notas_fiscais_docs").select(COLS).or(grupo.map((c) => `maquina.ilike.*${c}*`).join(",")).limit(1000));
  }
  const resps = await Promise.all(consultas);
  const erro = resps.find((r) => r.error)?.error;
  if (erro) {
    const faltando = /does not exist|schema cache|maquina/i.test(erro.message);
    return NextResponse.json({ error: faltando ? "Cache de notas ainda sem os vínculos de máquina." : erro.message, migracaoFaltando: faltando }, { status: faltando ? 503 : 500 });
  }

  const vistos = new Set<number>();
  const notas = [];
  for (const r of resps) {
    for (const n of (r.data || []) as Array<Record<string, unknown>>) {
      const id = Number(n.id);
      if (vistos.has(id)) continue;
      vistos.add(id);
      const motivo = motivoDaNota(n as { parte_doc?: string; maquina?: string }, doc, chassis);
      if (!motivo) continue;
      const entrada = n.tipo === "entrada";
      const bloqueada = entrada && !verEntrada;
      notas.push({
        id, conta: n.conta_omie, tipo: n.tipo, numero: n.numero, serie: n.serie, data: n.data_emissao,
        parte: n.parte_nome, valor: bloqueada ? null : n.valor, cancelada: !!n.cancelada,
        pdf: !!n.pdf_path, xml: !!n.xml_path, pedido: n.pedido_num || null, os: n.os_num || null,
        maquina: n.maquina || null, via: motivo.via, chassi: motivo.chassi || null, bloqueada,
      });
    }
  }
  notas.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
  return NextResponse.json({ notas, chassis, verEntrada });
}
