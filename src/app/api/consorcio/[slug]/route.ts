/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// ROTA PÚBLICA do consórcio no evento (Supersafra). SEM LOGIN — é o QR code do estande.
//
// GET  /api/consorcio/<slug>  -> dados do evento (textos, números do consórcio, ganhadores já sorteados)
// POST /api/consorcio/<slug>  -> cadastra e devolve o número da sorte
//
// O que segura abuso: aceita só os campos da ficha com teto de tamanho, telefone precisa ter DDD,
// campo-isca escondido (robô preenche, gente não), piso de 2 s por aparelho/IP, e o mesmo telefone
// nunca ganha um segundo número (o banco devolve o que já tinha). A chave anônima não chega às
// tabelas: RLS sem policy; quem grava é o servidor (service role).
// =============================================================================
import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/server/supabase-admin';
import { gerarPropostaPdf } from '@/lib/consorcio/proposta-pdf';
import { lerConfig, modelosUnicos, grupoDaUrgencia } from '@/lib/consorcio/conta';
import { enviarPdfPeloChatwoot, motivoTxt } from '@/lib/chatwoot/avisar-pessoa';
import { autenticar } from '@/lib/auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MSG_MIGRACAO = 'As tabelas do consórcio ainda não existem no banco. Rode sql/consorcio-evento.sql no SQL Editor do Supabase.';
const faltaTabela = (e: any) => /consorcio_|does not exist|schema cache|PGRST20[0-5]|42P01|42883/.test(`${e?.code} ${e?.message}`);

const ultimoEnvio = new Map<string, number>();   // IP -> hora do último cadastro (memória do servidor)
// PDF da proposta no WhatsApp (26/11): a rota é pública, então tem trava — o mesmo número não recebe de novo em
// 1 min (dá para "Editar cliente" e reenviar), e no máximo 300 PDFs por dia por servidor (o estande não passa disso; robô sim).
const ultimoPdf = new Map<string, number>();
let pdfsHoje = { dia: '', n: 0 };

async function evento(slug: string) {
  const { data, error } = await db.from('consorcio_eventos')
    .select('id, slug, nome, local, cidade, inicio, fim, sorteio_em, premio, regulamento, ativo, config')
    .eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

/** "Maria Aparecida Souza" -> "Maria S." (o ganhador aparece na página sem expor o nome todo). */
function nomeCurto(nome: string) {
  const p = String(nome || '').trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || '';
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const ev = await evento(slug);
    if (!ev) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    const { data: sorteios } = await db.from('consorcio_sorteios')
      .select('numero, nome, sorteado_em').eq('evento_id', ev.id).eq('situacao', 'valido').order('sorteado_em');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...publico } = ev;   // o id interno não sai para a rua
    return NextResponse.json({
      evento: publico,
      ganhadores: (sorteios || []).map((s: any) => ({ numero: s.numero, nome: nomeCurto(s.nome), em: s.sorteado_em })),
    });
  } catch (e: any) {
    if (faltaTabela(e)) return NextResponse.json({ error: MSG_MIGRACAO }, { status: 503 });
    console.error('[consorcio] GET', e);
    return NextResponse.json({ error: 'Erro inesperado' }, { status: 500 });
  }
}

const txt = (v: any, max: number) => String(v ?? '').trim().slice(0, max);
/** número positivo com teto (centavos; ou inteiro), ou null */
const valor = (v: any, max: number, inteiro = false) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return inteiro ? Math.round(n) : Math.round(n * 100) / 100;
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const b = await req.json().catch(() => ({}));

    // campo-isca: invisível para gente; se veio preenchido é robô. Responde "ok" para ele não insistir.
    if (txt(b.site, 200)) return NextResponse.json({ numero: 0, ja_inscrito: false });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip';
    const agora = Date.now();
    if (agora - (ultimoEnvio.get(ip) || 0) < 2000) {
      return NextResponse.json({ error: 'Espere um instante e toque de novo.' }, { status: 429 });
    }
    ultimoEnvio.set(ip, agora);
    if (ultimoEnvio.size > 5000) ultimoEnvio.clear();

    const nome = txt(b.nome, 80);
    const telefone = txt(b.telefone, 20);
    const digitos = telefone.replace(/\D/g, '');
    if (nome.length < 3) return NextResponse.json({ error: 'Escreva o nome completo.' }, { status: 400 });
    if (digitos.length < 10 || digitos.length > 11) {
      return NextResponse.json({ error: 'Telefone com DDD, por exemplo (43) 99999-9999.' }, { status: 400 });
    }
    if (b.aceite !== true) {
      return NextResponse.json({ error: 'Para participar, marque que aceita o contato da Nova Tratores.' }, { status: 400 });
    }
    const credito = Number(b.credito);
    // de onde veio (plano 1.4): só letras/números/traço, curto; utm só as 5 chaves padrão
    const origem = txt(b.origem, 30).toLowerCase().replace(/[^a-z0-9_-]/g, '') || null;
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = txt(b.utm?.[k], 80);
      if (v) utm[k] = v;
    }

    // ficha do vendedor (plano 1.6): só valores conhecidos; data no formato AAAA-MM-DD
    const temp = ['quente', 'morno', 'frio'].includes(b.temperatura) ? b.temperatura : null;
    const dataPasso = /^\d{4}-\d{2}-\d{2}$/.test(String(b.proximo_passo_data || '')) ? b.proximo_passo_data : null;
    const extra = {
      temperatura: temp,
      usado_para_lance: typeof b.usado_para_lance === 'boolean' ? b.usado_para_lance : null,
      usado_descricao: txt(b.usado_descricao, 120) || null,
      proximo_passo: txt(b.proximo_passo, 80) || null,
      proximo_passo_data: dataPasso,
      observacao: txt(b.observacao, 500) || null,
      // planilha "Acompanhamento de Visita" (26/11): endereço, como chegou, fechamento e a proposta
      endereco: txt(b.endereco, 160) || null,
      vinda_de: txt(b.vinda_de, 40) || null,
      fechamento_data: /^\d{4}-\d{2}-\d{2}$/.test(String(b.fechamento_data || '')) ? b.fechamento_data : null,
      parcela: valor(b.parcela, 1_000_000),
      prazo_meses: valor(b.prazo_meses, 400, true),
      embutido_pct: valor(b.embutido_pct, 100),
      lance_proprio: valor(b.lance_proprio, 5_000_000),
      prazo_contemplacao: txt(b.prazo_contemplacao, 80) || null,
      proposta_obs: txt(b.proposta_obs, 500) || null,
    };

    // 26/11 (José): o vendedor entra com o perfil do portal — com login, o nome vem do perfil (não do que foi digitado)
    // e a ficha guarda o id do usuário, para contar certinho por vendedor. Sem login (cliente pelo QR code), segue igual.
    const auth = req.headers.get('authorization') ? await autenticar(req) : null;
    let vendedorNome = txt(b.vendedor, 60);
    if (auth) {
      const { data: perfil } = await db.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle();
      vendedorNome = txt(perfil?.nome || vendedorNome || auth.email, 60);
    }

    const ev = await evento(slug);
    if (!ev) return NextResponse.json({ error: 'Evento não encontrado.' }, { status: 404 });
    if (!ev.ativo) return NextResponse.json({ error: 'As inscrições deste evento estão encerradas.' }, { status: 423 });

    const { data, error } = await db.rpc('consorcio_inscrever', {
      p_evento: ev.id,
      p_nome: nome,
      p_telefone: telefone,
      p_cidade: txt(b.cidade, 60),
      p_interesse: txt(b.interesse, 120),
      p_credito: Number.isFinite(credito) && credito > 0 && credito < 5_000_000 ? Math.round(credito * 100) / 100 : null,
      p_tem_trator: typeof b.tem_trator === 'boolean' ? b.tem_trator : null,
      p_aceite: true,
      p_vendedor: vendedorNome,
      p_origem: origem,
      p_utm: Object.keys(utm).length ? utm : null,
      p_extra: extra,
    });
    if (error) throw error;
    const linha = Array.isArray(data) ? data[0] : data;
    if (auth && linha?.o_numero) {
      // quem atendeu (id do portal) — coluna criada em sql/consorcio-lead-atualiza.sql; antes dele, só não grava
      const { error: eV } = await db.from('consorcio_inscricoes').update({ vendedor_id: auth.userId, vendedor: vendedorNome })
        .eq('evento_id', ev.id).eq('numero', linha.o_numero);
      if (eV) console.warn('[consorcio] vendedor_id', eV.message);
    }

    // ficha do vendedor (26/11, José): no lugar do número da sorte, a proposta em PDF vai para o WhatsApp do cliente
    let pdf: { enviado: boolean; motivo?: string; base64?: string } | undefined;
    if (b.enviar_pdf === true) {
      try {
        const cfg = lerConfig(ev.config);
        const modelo = modelosUnicos(cfg).find((m) => m.nome === txt(b.interesse, 120));
        const urg = grupoDaUrgencia(cfg);
        const bytes = gerarPropostaPdf({
          evento: { nome: ev.nome, cidade: ev.cidade, inicio: ev.inicio, fim: ev.fim },
          cfg,
          cliente: { nome, telefone, cidade: txt(b.cidade, 60), endereco: extra.endereco || '' },
          trator: modelo?.nome || txt(b.interesse, 120),
          credito: Number.isFinite(credito) && credito > 0 ? credito : null,
          parcela: extra.parcela, prazo: extra.prazo_meses, embutidoPct: extra.embutido_pct, lanceProprio: extra.lance_proprio,
          contemplacao: extra.prazo_contemplacao || '', observacao: extra.proposta_obs || '',
          assembleia: urg && (!modelo || modelo.grupos.includes(urg.grupo)) ? urg : null,
          superAssembleia: !!(cfg.super_assembleia && modelo?.grupos.includes(cfg.super_assembleia.grupo || '')),
          vendedor: vendedorNome || 'Nova Tratores',
        });
        pdf = { enviado: false, base64: Buffer.from(bytes).toString('base64') };
        const hoje = new Date().toISOString().slice(0, 10);
        if (pdfsHoje.dia !== hoje) pdfsHoje = { dia: hoje, n: 0 };
        if (agora - (ultimoPdf.get(digitos) || 0) < 60_000) pdf.motivo = 'já foi enviado para este número há menos de 1 minuto';
        else if (pdfsHoje.n >= 300) pdf.motivo = 'limite do dia atingido';
        else {
          const primeiro = nome.split(/s+/)[0];
          const texto = `Olá, ${primeiro}! Aqui é ${vendedorNome || 'a equipe'}, da Nova Tratores, na ${ev.nome}. Obrigado pela visita! Segue a sua proposta do consórcio Mahindra. Qualquer dúvida, é só responder aqui.`;
          const r = await enviarPdfPeloChatwoot(telefone, nome, texto, `Proposta Consorcio Mahindra - ${primeiro}.pdf`, bytes);
          if (r.ok) { pdf.enviado = true; ultimoPdf.set(digitos, agora); pdfsHoje.n++; if (ultimoPdf.size > 5000) ultimoPdf.clear(); }
          else pdf.motivo = motivoTxt(r);
        }
      } catch (e: any) {
        console.error('[consorcio] PDF da proposta', e);
        pdf = { enviado: false, motivo: 'não deu para gerar o PDF' };
      }
    }
    return NextResponse.json({ numero: linha?.o_numero, ja_inscrito: !!linha?.o_ja_inscrito, pdf });
  } catch (e: any) {
    if (faltaTabela(e)) return NextResponse.json({ error: MSG_MIGRACAO }, { status: 503 });
    console.error('[consorcio] POST', e);
    return NextResponse.json({ error: 'Não deu para cadastrar agora. Tente de novo.' }, { status: 500 });
  }
}
