import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("revisao_emails")
      .select("*")
      .order("enviado_em", { ascending: false });

    if (error) {
      console.error("Erro ao buscar revisao_emails:", error.message);
      return NextResponse.json(
        { error: "Falha ao buscar emails do banco." },
        { status: 500 }
      );
    }

    const emails = (data || []).map((row: any) => ({
      subject: row.assunto,
      date: row.enviado_em,
      uid: row.id,
      horas: row.horas,
      modelo: row.modelo,
      chassisFinal: row.chassis_final,
      // envio declarado na mão (não saiu e-mail pelo portal) — a coluna pode
      // não existir ainda, então o assunto também marca
      registroManual: row.registro_manual === true || /^\[REGISTRO MANUAL\]/i.test(String(row.assunto || '')),
      enviadoPor: row.enviado_por || null,
      attachments: row.pdf_url
        ? [{ filename: `revisao_${row.horas}h.pdf`, contentType: "application/pdf", size: 0, part: row.pdf_url }]
        : [],
      body: row.corpo || "",
    }));

    return NextResponse.json({ total: emails.length, emails });
  } catch (error: any) {
    console.error("Erro ao buscar emails:", error);
    return NextResponse.json(
      { error: "Falha ao buscar emails." },
      { status: 500 }
    );
  }
}
