import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const GMAIL_USER = process.env.GMAIL_USER || "posvendas.novatratores@gmail.com";
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || "vuak yzex ycpm mydd";
const BUCKET = "clientes-docs";

// POST /api/clientes/sync-chassis
export async function POST(req: NextRequest) {
  const etapa = req.nextUrl.searchParams.get("etapa") || "tudo";

  try {
    const resultado: Record<string, any> = {};

    // ========== ETAPA 1: Extrair chassis de todas as OS ==========
    if (etapa === "tudo" || etapa === "chassis") {
      console.log("[sync-chassis] Extraindo chassis das OS...");

      const PAGE = 1000;
      let from = 0, hasMore = true;
      const osAll: any[] = [];
      while (hasMore) {
        const { data } = await supabase.from("portal_nt_clientes_os")
          .select("projeto, empresa, cod_cli, data_previsao, servicos")
          .not("projeto", "is", null).not("projeto", "eq", "")
          .range(from, from + PAGE - 1);
        if (data && data.length > 0) { osAll.push(...data); if (data.length < PAGE) hasMore = false; else from += PAGE; }
        else hasMore = false;
      }

      // Extrair chassis -> ultimo cliente
      const chassisMap = new Map<string, { projeto: string; empresa: string; modelo: string; cod_cli: number; data: string }>();
      for (const os of osAll) {
        const servs = typeof os.servicos === "string" ? JSON.parse(os.servicos) : (os.servicos || []);
        for (const s of servs) {
          const mc = (s.desc || "").match(/Chassis:\s*([^|]+)/i);
          if (!mc || !mc[1].trim()) continue;
          const chassis = mc[1].trim();
          const mm = (s.desc || "").match(/Modelo:\s*([^|]+)/i);
          const modelo = mm ? mm[1].trim() : "";
          const dt = os.data_previsao || "0000-00-00";
          const existing = chassisMap.get(chassis);
          if (!existing || dt > existing.data) {
            chassisMap.set(chassis, { projeto: os.projeto, empresa: os.empresa, modelo, cod_cli: os.cod_cli, data: dt });
          }
        }
      }

      // Buscar nomes dos clientes
      const codClis = [...new Set(Array.from(chassisMap.values()).map(v => v.cod_cli))];
      const cliMap = new Map<number, { cnpj: string; nome: string }>();
      for (let i = 0; i < codClis.length; i += 200) {
        const batch = codClis.slice(i, i + 200);
        const { data } = await supabase.from("portal_nt_clientes_cadastro_omie")
          .select("cod_cli, cnpj_cpf, nome_fantasia, razao_social")
          .in("cod_cli", batch);
        for (const c of data || []) cliMap.set(c.cod_cli, { cnpj: c.cnpj_cpf || "", nome: c.nome_fantasia || c.razao_social || "" });
      }

      // Upsert na tabela
      const rows = Array.from(chassisMap.entries()).map(([ch, info]) => {
        const cli = cliMap.get(info.cod_cli);
        return {
          chassis: ch,
          projeto: info.projeto,
          empresa: info.empresa,
          modelo: info.modelo,
          cod_cli_ultimo: info.cod_cli,
          cnpj_cpf_ultimo: cli?.cnpj || "",
          cliente_nome_ultimo: cli?.nome || "",
          updated_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        await supabase.from("portal_nt_projetos_chassis").upsert(batch, { onConflict: "chassis,empresa" });
      }

      resultado.chassis = { total_os: osAll.length, chassis_encontrados: rows.length };
      console.log(`[sync-chassis] ${rows.length} chassis extraidos de ${osAll.length} OS`);
    }

    // ========== ETAPA 2: Buscar emails para cada chassis ==========
    if (etapa === "tudo" || etapa === "emails") {
      // Pegar chassis que ainda nao tem emails no banco
      const { data: chassisSemEmail } = await supabase
        .from("portal_nt_projetos_chassis")
        .select("chassis")
        .limit(500);

      const todosChassisDB = (chassisSemEmail || []).map(c => c.chassis);

      // Ver quais ja tem emails
      const { data: jaTemEmail } = await supabase
        .from("portal_nt_projetos_emails")
        .select("chassis");
      const jaProcessados = new Set((jaTemEmail || []).map(e => e.chassis));

      const chassisParaBuscar = todosChassisDB.filter(ch => !jaProcessados.has(ch));
      console.log(`[sync-chassis] ${chassisParaBuscar.length} chassis para buscar emails (${jaProcessados.size} ja processados)`);

      if (chassisParaBuscar.length > 0) {
        const client = new ImapFlow({
          host: "imap.gmail.com",
          port: 993,
          secure: true,
          auth: { user: GMAIL_USER, pass: GMAIL_PASS },
          logger: false,
        });

        await client.connect();

        const pastas = ["INBOX", "[Gmail]/Sent Mail", "[Gmail]/E-mails enviados", "[Gmail]/Enviados"];
        let totalEmails = 0;
        let totalAnexos = 0;

        for (const chassis of chassisParaBuscar) {
          const emailsDosChassis: any[] = [];

          for (const pasta of pastas) {
            let lock;
            try { lock = await client.getMailboxLock(pasta); } catch { continue; }

            try {
              const uids = await client.search({ or: [{ subject: chassis }, { body: chassis }] });
              if (!uids || uids.length === 0) { lock.release(); continue; }

              for await (const msg of client.fetch(uids.slice(-30), { envelope: true, bodyStructure: true })) {
                const env = msg.envelope as any;
                if (!env) continue;
                const anexos: { nome: string; tipo: string; part: string; size: number }[] = [];

                function findAttachments(node: any) {
                  if (!node) return;
                  if (node.childNodes) { for (const c of node.childNodes) findAttachments(c); return; }
                  const disp = (node.disposition || "").toLowerCase();
                  if (disp === "attachment" || (node.type !== "text" && node.size > 1000)) {
                    anexos.push({
                      nome: node.dispositionParameters?.filename || node.parameters?.name || `${node.type}_${node.subtype}`,
                      tipo: `${node.type}/${node.subtype}`,
                      part: node.part || "",
                      size: node.size || 0,
                    });
                  }
                }
                if (msg.bodyStructure) findAttachments(msg.bodyStructure);

                // Baixar anexos e salvar no Supabase Storage
                const anexosSalvos: { nome: string; tipo: string; url: string; size: number }[] = [];
                for (const anx of anexos) {
                  try {
                    const { content } = await client.download(msg.uid.toString(), anx.part, { uid: true });
                    const chunks: Buffer[] = [];
                    for await (const chunk of content) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    const buffer = Buffer.concat(chunks);

                    if (buffer.length > 100) {
                      const safeName = anx.nome.replace(/[^a-zA-Z0-9._-]/g, "_");
                      const path = `emails/${chassis}/${msg.uid}_${safeName}`;
                      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
                        contentType: anx.tipo, upsert: true,
                      });
                      if (!upErr) {
                        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                        anexosSalvos.push({ nome: anx.nome, tipo: anx.tipo, url: pub.publicUrl, size: buffer.length });
                        totalAnexos++;
                      }
                    }
                  } catch { /* ignorar anexo individual */ }
                }

                emailsDosChassis.push({
                  chassis,
                  uid: msg.uid,
                  pasta,
                  assunto: env.subject || "",
                  de: env.from?.[0]?.address || "",
                  para: (env.to || []).map((a: any) => a.address),
                  data: env.date ? new Date(env.date).toISOString() : null,
                  tem_anexo: anexosSalvos.length > 0,
                  anexos: JSON.stringify(anexosSalvos),
                  updated_at: new Date().toISOString(),
                });
              }
            } catch { /* ignorar erros de pasta */ }

            lock.release();
          }

          // Salvar emails no banco
          if (emailsDosChassis.length > 0) {
            for (const email of emailsDosChassis) {
              await supabase.from("portal_nt_projetos_emails").upsert(email, { onConflict: "chassis,uid,pasta" });
            }
            totalEmails += emailsDosChassis.length;
          } else {
            // Marcar como processado (inserir registro vazio para nao buscar de novo)
            await supabase.from("portal_nt_projetos_emails").upsert({
              chassis, uid: 0, pasta: "NONE", assunto: "", de: "", para: [],
              data: null, tem_anexo: false, anexos: "[]", updated_at: new Date().toISOString(),
            }, { onConflict: "chassis,uid,pasta" });
          }

          console.log(`[sync-chassis] ${chassis}: ${emailsDosChassis.length} emails`);
          await new Promise(r => setTimeout(r, 200));
        }

        await client.logout();
        resultado.emails = { chassis_buscados: chassisParaBuscar.length, emails_encontrados: totalEmails, anexos_baixados: totalAnexos };
      } else {
        resultado.emails = { chassis_buscados: 0, mensagem: "Todos os chassis ja foram processados" };
      }
    }

    return NextResponse.json({ sucesso: true, resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-chassis]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
