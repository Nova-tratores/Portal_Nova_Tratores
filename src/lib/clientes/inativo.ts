import { createClient } from "@supabase/supabase-js";

// Cliente INATIVO no Omie não pode receber PPV nem OS novos.
// A checagem usa o ESPELHO local (portal_nt_clientes_cadastro_omie, campo
// `inativo` = 'S'/'N', sincronizado do Omie) — zero chamadas externas.
// Regra: identifica pelo DOCUMENTO quando houver; senão pelo nome exato
// (razão social ou fantasia). Se houver homônimos e QUALQUER um estiver
// ativo, deixa passar (só bloqueia quando todos os encontrados estão
// inativos). Cliente que não está no espelho não bloqueia (fail-open).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type LinhaCliente = { razao_social: string | null; nome_fantasia: string | null; cnpj_cpf: string | null; inativo: string | null };

export async function motivoClienteInativo(nome?: string, documento?: string): Promise<string | null> {
  const alvoNome = String(nome || "").replace(/\s*\(cód[^)]*\)\s*$/i, "").trim();
  const alvoDoc = String(documento || "").replace(/\D/g, "");
  if (!alvoNome && !alvoDoc) return null;

  try {
    let candidatos: LinhaCliente[] = [];

    // 1º: documento (identifica de verdade — nome tem homônimos)
    if (alvoDoc.length >= 11) {
      const { data } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("razao_social,nome_fantasia,cnpj_cpf,inativo")
        .limit(2000);
      candidatos = (data || []).filter(
        (c) => String(c.cnpj_cpf || "").replace(/\D/g, "") === alvoDoc
      );
    }

    // 2º: nome exato (razão social, depois fantasia)
    if (!candidatos.length && alvoNome) {
      const { data: porRazao } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("razao_social,nome_fantasia,cnpj_cpf,inativo")
        .ilike("razao_social", alvoNome)
        .limit(20);
      candidatos = porRazao || [];
      if (!candidatos.length) {
        const { data: porFantasia } = await supabase
          .from("portal_nt_clientes_cadastro_omie")
          .select("razao_social,nome_fantasia,cnpj_cpf,inativo")
          .ilike("nome_fantasia", alvoNome)
          .limit(20);
        candidatos = porFantasia || [];
      }
    }

    if (!candidatos.length) return null; // não está no espelho → segue
    const temAtivo = candidatos.some((c) => String(c.inativo || "").toUpperCase() !== "S");
    if (temAtivo) return null;

    const rotulo = alvoNome || candidatos[0].razao_social || candidatos[0].nome_fantasia || "esse cliente";
    return `O cliente "${rotulo}" está INATIVO no Omie. Reative o cadastro lá antes de criar.`;
  } catch {
    return null; // checagem é proteção, não pode travar a operação por erro dela
  }
}
