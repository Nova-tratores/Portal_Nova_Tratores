import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface InspecaoEmailRow {
  id: string;
  assunto: string | null;
  enviado_em: string;
  horimetro: string | null;
  modelo: string | null;
  chassis_final: string;
  pdf_url: string | null;
  corpo: string | null;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("inspecao_emails")
      .select("*")
      .order("enviado_em", { ascending: false });

    if (error) {
      console.error("Erro ao buscar inspecao_emails:", error.message);
      return NextResponse.json(
        { error: "Falha ao buscar emails do banco." },
        { status: 500 }
      );
    }

    const emails = ((data as InspecaoEmailRow[] | null) || []).map((row) => ({
      subject: row.assunto,
      date: row.enviado_em,
      uid: row.id,
      horimetro: row.horimetro || "",
      modelo: row.modelo,
      chassisFinal: row.chassis_final,
      attachments: row.pdf_url
        ? [{ filename: `inspecao_${row.chassis_final}.pdf`, contentType: "application/pdf", size: 0, part: row.pdf_url }]
        : [],
      body: row.corpo || "",
    }));

    return NextResponse.json({ total: emails.length, emails });
  } catch (error) {
    console.error("Erro ao buscar emails de inspeção:", error);
    return NextResponse.json(
      { error: "Falha ao buscar emails." },
      { status: 500 }
    );
  }
}
