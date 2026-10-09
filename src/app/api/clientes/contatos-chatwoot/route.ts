import { NextRequest, NextResponse } from "next/server";
import { protegerRota } from "@/lib/ajustes/permissao-server";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { buscarWhatsappDoCliente, limparCacheWhatsapp } from "@/lib/chatwoot/contatos-cliente";
import { buscarContatosPorTexto, atualizarAtributosContato } from "@/lib/chatwoot/cliente";
import { CHATWOOT_URL, CHATWOOT_ACCOUNT_ID, chatwootConfigurado } from "@/lib/chatwoot/config";
import { codigosDoDocumento } from "@/lib/clientes/info-pasta";

// Contatos do NovaZap (Chatwoot) vinculados a um cliente da Pasta Clientes.
// O vínculo no Chatwoot é por código Omie (cliente_ref "cod:empresa"); o mesmo
// CNPJ pode ter cadastro na Nova e na Castro com códigos diferentes, então
// junta TODOS os códigos daquele CNPJ.
//   GET  ?cod=&cnpj=        → contatos vinculados
//   GET  ?buscar=texto      → contatos do NovaZap pra vincular (nome/telefone)
//   POST {acao:'vincular', contactId, cod, empresa} | {acao:'desvincular', contactId}
// O vínculo grava os MESMOS atributos do seletor de cliente do NovaZap
// (ClientePicker.vue), pra ficha/popover de lá funcionarem igual.
export const dynamic = "force-dynamic";

const ATRIBUTOS_VAZIOS = {
  cliente: "", cliente_ref: "", cliente_cod: "", cliente_cnpj: "",
  cliente_nome_fantasia: "", cliente_endereco: "", cliente_telefone: "", cliente_email: "",
};

export async function GET(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return acesso.resposta;
  const sp = req.nextUrl.searchParams;

  // Busca de contatos pra vincular
  const buscar = (sp.get("buscar") || "").trim();
  if (buscar) {
    if (!chatwootConfigurado()) return NextResponse.json({ error: "NovaZap não configurado neste ambiente." }, { status: 503 });
    if (buscar.length < 3) return NextResponse.json({ contatos: [] });
    try {
      const brutos = await buscarContatosPorTexto(buscar, 1);
      const contatos = brutos.map(c => {
        const a = (c.custom_attributes || {}) as Record<string, unknown>;
        return {
          id: c.id,
          nome: c.name || "(sem nome)",
          telefone: c.phone_number || null,
          thumbnail: c.thumbnail || null,
          tipo: String(a.tipo_contato || "") || null,
          vinculado_a: String(a.cliente || "") || null,
          cliente_ref: String(a.cliente_ref || "") || null,
        };
      });
      return NextResponse.json({ contatos });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "erro na busca" }, { status: 502 });
    }
  }

  // Contatos já vinculados ao cliente
  const cod = (sp.get("cod") || "").trim();
  const doc = (sp.get("cnpj") || "").replace(/\D/g, "");
  const codigos = new Set(await codigosDoDocumento(doc));
  if (cod) codigos.add(cod);

  const secao = await buscarWhatsappDoCliente([...codigos]);
  const base = CHATWOOT_URL && CHATWOOT_ACCOUNT_ID ? `${CHATWOOT_URL}/app/accounts/${CHATWOOT_ACCOUNT_ID}/contacts/` : null;
  return NextResponse.json({ secao, urlContatoBase: base, codigos: [...codigos] });
}

export async function POST(req: NextRequest) {
  const acesso = await protegerRota(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return acesso.resposta;
  if (!chatwootConfigurado()) return NextResponse.json({ error: "NovaZap não configurado neste ambiente." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const contactId = Number(body?.contactId || 0);
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  try {
    if (body.acao === "desvincular") {
      await atualizarAtributosContato(contactId, ATRIBUTOS_VAZIOS);
      limparCacheWhatsapp();
      return NextResponse.json({ ok: true });
    }

    if (body.acao !== "vincular") return NextResponse.json({ error: "acao inválida" }, { status: 400 });
    const cod = String(body?.cod || "").trim();
    const empresa = String(body?.empresa || "").trim();
    if (!cod || !empresa) return NextResponse.json({ error: "cod e empresa obrigatórios" }, { status: 400 });

    const { data: cli } = await supabaseAdmin
      .from("portal_nt_clientes_cadastro_omie")
      .select("cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, endereco, bairro, cep, cidade, estado, telefone, email")
      .eq("cod_cli", cod).eq("empresa", empresa).maybeSingle();
    if (!cli) return NextResponse.json({ error: "Cliente não encontrado no cadastro do Omie." }, { status: 404 });

    const nome = cli.nome_fantasia || cli.razao_social || `Cliente ${cli.cod_cli}`;
    const endereco = [cli.endereco, cli.bairro, cli.cidade && `${cli.cidade}/${cli.estado || ""}`, cli.cep && `CEP ${cli.cep}`]
      .filter(Boolean).join(", ");
    await atualizarAtributosContato(contactId, {
      cliente: `${nome} (cód ${cli.cod_cli})`,
      cliente_ref: `${cli.cod_cli}:${cli.empresa}`,
      cliente_cod: String(cli.cod_cli),
      cliente_cnpj: cli.cnpj_cpf || "",
      cliente_nome_fantasia: cli.nome_fantasia || "",
      cliente_endereco: endereco,
      cliente_telefone: cli.telefone || "",
      cliente_email: cli.email || "",
    });
    limparCacheWhatsapp();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro ao falar com o NovaZap" }, { status: 502 });
  }
}
