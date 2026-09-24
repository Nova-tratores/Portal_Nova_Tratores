// Busca de PROJETOS (tratores) pro botão "Projetos" do header do POS:
// filtros combináveis por modelo, cliente (nome ou CNPJ) e final do chassis.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autenticar } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const limpar = (s: string) => s.replace(/[%,()]/g, " ").trim();

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!auth.isAdmin && !auth.modulos.includes("pos")) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

  const modelo = limpar(req.nextUrl.searchParams.get("modelo") || "");
  const cliente = limpar(req.nextUrl.searchParams.get("cliente") || "");
  const chassi = limpar(req.nextUrl.searchParams.get("chassi") || "");
  if (!modelo && !cliente && !chassi) return NextResponse.json({ projetos: [] });

  try {
    let q = supabase.from("portal_nt_projetos_chassis")
      .select("chassis, modelo, projeto, empresa, cod_cli_ultimo, cnpj_cpf_ultimo, cliente_nome_ultimo")
      .limit(60);
    if (modelo) q = q.ilike("modelo", `%${modelo}%`);
    if (chassi) q = q.ilike("chassis", `%${chassi.replace(/\s/g, "")}%`);
    if (cliente) {
      const dig = cliente.replace(/\D/g, "");
      // nome OU CNPJ (quando o que digitou é número)
      q = dig.length >= 5 && dig.length === cliente.replace(/\s/g, "").length
        ? q.ilike("cnpj_cpf_ultimo", `%${dig}%`)
        : q.ilike("cliente_nome_ultimo", `%${cliente}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const projetos = (data || [])
      .map((r) => ({
        chassis: String(r.chassis || ""),
        modelo: String(r.modelo || ""),
        projeto: String(r.projeto || ""),
        empresa: String(r.empresa || ""),
        cliente: String(r.cliente_nome_ultimo || ""),
        cnpj: String(r.cnpj_cpf_ultimo || ""),
        codCli: r.cod_cli_ultimo ?? null,
      }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo, "pt-BR") || a.chassis.localeCompare(b.chassis));
    return NextResponse.json({ projetos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na busca de projetos." }, { status: 502 });
  }
}
