// POST /api/pos/ordens/[id]/alimentacao-nota — o ADMIN anexa a NOTA de uma
// alimentação da OS e a despesa automática abre NA HORA (pedido do usuário):
//   FormData: { file, data (YYYY-MM-DD), valor, tecnicos (JSON array) }
//   1. sobe o arquivo pro bucket 'requisicoes' (alimentacao/{os}/...)
//   2. grava a foto no item correspondente de Ordem_Servico.Alimentacoes
//   3. cria a Requisicao tipo='Alimentação' já em status='financeiro', com
//      solicitante = técnico e o recibo em foto_nf (idempotente: se a auto já
//      existe pra mesma data+valor, só anexa o recibo nela)
// Permissão: admin OU módulo 'pos'.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";
import { registrarAlimentacaoItem, normalizarAlimentacoes } from "@/lib/pos/alimentacao-os";
import { TBL_OS } from "@/lib/pos/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "requisicoes";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) {
    return NextResponse.json({ error: "Sem permissão no Pós-Vendas." }, { status: 403 });
  }

  const { id: idOs } = await params;
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const dataDia = String(form.get("data") || "").slice(0, 10);
  const valor = Number(String(form.get("valor") || "").replace(",", "."));
  let tecnicos: string[] = [];
  try { const t = JSON.parse(String(form.get("tecnicos") || "[]")); if (Array.isArray(t)) tecnicos = t.filter(Boolean); } catch { /* */ }

  if (!file || file.size === 0) return NextResponse.json({ error: "Envie a nota (foto ou PDF)." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Arquivo acima de 15 MB." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataDia)) return NextResponse.json({ error: "Informe a DATA da alimentação." }, { status: 400 });

  // 1) upload pro bucket das requisições (o foto_nf aponta pra cá)
  const seguro = (file.name || "nota.jpg").replace(/[^\w.\-]+/g, "_").slice(-60);
  const path = `alimentacao/${idOs}/${dataDia}_${Date.now()}_${seguro}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: errUp } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (errUp) return NextResponse.json({ error: `Upload: ${errUp.message}` }, { status: 500 });
  const fotoUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // 2) grava a foto no item da OS (casa por DATA; se o dia ainda não está
  //    lançado no array, adiciona o item com o valor informado)
  const { data: osRes } = await supabase.from(TBL_OS).select("Id_Ordem, Alimentacoes, Os_Tecnico").eq("Id_Ordem", idOs).limit(1);
  if (!osRes?.length) return NextResponse.json({ error: `OS ${idOs} não encontrada.` }, { status: 404 });

  const lista = normalizarAlimentacoes(osRes[0].Alimentacoes);
  const idx = lista.findIndex((a) => a.data === dataDia);
  const tecs = tecnicos.length ? tecnicos.slice(0, 2) : [String(osRes[0].Os_Tecnico || "")].filter(Boolean);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], foto: fotoUrl, valor: lista[idx].valor > 0 ? lista[idx].valor : valor || 0 };
  } else {
    lista.push({ data: dataDia, valor: valor || 0, tecnicos: tecs, no_pdf: false, foto: fotoUrl });
  }
  const { error: errOs } = await supabase.from(TBL_OS).update({ Alimentacoes: lista }).eq("Id_Ordem", idOs);
  if (errOs) return NextResponse.json({ error: `OS: ${errOs.message}` }, { status: 500 });

  // 3) despesa automática NA HORA (solicitante = técnico, recibo anexado,
  //    status financeiro). Sem valor lançado ainda: guarda a nota e avisa.
  const item = idx >= 0 ? lista[idx] : lista[lista.length - 1];
  const resultado = await registrarAlimentacaoItem(idOs, item);

  return NextResponse.json({
    ok: true,
    foto_url: fotoUrl,
    requisicao_id: resultado.requisicaoId,
    criada: resultado.criada,
    aviso: resultado.criada ? undefined : resultado.motivo,
  });
}
