import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizarFiltro } from "@/lib/busca-segura";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

export async function GET(req: NextRequest) {
  const chassis = req.nextUrl.searchParams.get("chassis");
  if (!chassis) return NextResponse.json({ error: "Passe ?chassis=XXXXX" }, { status: 400 });

  const chassisFinal = chassis.slice(-6);

  try {
    const [projetoEmails, revisaoEmails] = await Promise.all([
      supabase
        .from("portal_nt_projetos_emails")
        .select("*")
        .or(`chassis.eq.${sanitizarFiltro(chassis)},chassis.ilike.%${sanitizarFiltro(chassisFinal)}`)
        .neq("uid", 0)
        .order("data", { ascending: false })
        .limit(50),
      supabase
        .from("revisao_emails")
        .select("*")
        .ilike("chassis_final", `%${chassisFinal}%`)
        .order("enviado_em", { ascending: false })
        .limit(50),
    ]);

    const emails: any[] = [];

    for (const e of projetoEmails.data || []) {
      emails.push({
        tipo: "garantia",
        assunto: e.assunto || e.subject || "Sem assunto",
        data: e.data,
        de: e.de || e.from || "",
        chassis: e.chassis,
        corpo: e.corpo || e.body || "",
        anexos: typeof e.anexos === "string" ? JSON.parse(e.anexos) : (e.anexos || []),
      });
    }

    for (const e of revisaoEmails.data || []) {
      emails.push({
        tipo: "revisao",
        assunto: e.assunto || `Cheque de Revisão - ${e.horas || "?"}h`,
        data: e.enviado_em,
        de: "revisoes@novatratores.com.br",
        chassis: e.chassis_final || "",
        horas: e.horas,
        modelo: e.modelo,
        corpo: e.corpo || "",
        anexos: e.pdf_url ? [{ nome: `revisao_${e.horas || ""}h.pdf`, url: e.pdf_url }] : [],
      });
    }

    emails.sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    return NextResponse.json({ chassis, total: emails.length, emails });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
