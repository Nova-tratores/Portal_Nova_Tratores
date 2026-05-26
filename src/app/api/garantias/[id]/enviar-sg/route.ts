import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import {
  gerarSGMahindra,
  nomeArquivoSG,
  formatarNumeroSG,
  MAPA_FOTOS_SG,
} from '@/lib/garantias/sg-mahindra';
import type {
  TratorDB,
  RequisicaoSG,
  FotoBuffer,
  TipoGarantiaSG,
} from '@/lib/garantias/sg-mahindra';
import { registrarEvento } from '@/lib/garantias/server';
import type { GarantiaDetalhe } from '@/lib/garantias/types';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  pool: true,
  maxConnections: 3,
});

function sanitizeHtml(s: string): string {
  return String(s ?? '').replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c),
  );
}

function aplicarTemplate(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
}

function saudacao(): string {
  const hora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(hora) < 12 ? 'Bom dia' : 'Boa tarde';
}

interface FotoAnexo {
  filename: string;
  content: Buffer;
  contentType?: string;
}

async function baixarUrl(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
}

function detectarExt(url: string): 'jpeg' | 'png' {
  const ext = (url.split('?')[0].match(/\.([a-zA-Z0-9]{3,4})$/)?.[1] || 'jpg').toLowerCase();
  return ext === 'png' ? 'png' : 'jpeg';
}

// Busca o CEP via ViaCEP a partir de cidade + parte do endereço (logradouro).
// Best-effort: erros viram `null`.
async function buscarCepViaCEP(uf: string, cidade: string, logradouro: string): Promise<string | null> {
  if (!uf || !cidade || !logradouro) return null;
  // ViaCEP exige logradouro com >= 3 caracteres
  const lograLimpo = logradouro
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim();
  if (lograLimpo.length < 3) return null;
  try {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(cidade)}/${encodeURIComponent(lograLimpo)}/json/`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0]?.cep || null;
  } catch {
    return null;
  }
}

// POST /api/garantias/[id]/enviar-sg
// Gera a SG xlsx no formato da montadora, anexa fotos da OS e envia por e-mail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const apenasGerar = body.apenasGerar === true;
  const ator = body.ator || 'Garantista';

  // 1. Carrega garantia completa
  const { data: g, error } = await supabase
    .from(TBL_GARANTIAS)
    .select('*, montadora:garantia_montadoras(*)')
    .eq('id', id)
    .maybeSingle();
  if (error || !g) {
    return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  }
  const garantia = g as unknown as GarantiaDetalhe;

  if (!garantia.montadora) {
    return NextResponse.json({ error: 'Defina a montadora da garantia antes de enviar.' }, { status: 400 });
  }
  if (garantia.montadora.tipo_template !== 'mahindra') {
    return NextResponse.json(
      { error: `Geração automática não suportada para o template "${garantia.montadora.tipo_template}".` },
      { status: 400 },
    );
  }
  const destinatarios = garantia.montadora.email_destinatarios || [];
  if (!apenasGerar && destinatarios.length === 0) {
    return NextResponse.json(
      { error: 'Cadastre os e-mails da montadora antes de enviar.' },
      { status: 400 },
    );
  }

  // Atribui numero_externo na primeira geração (numeração própria da montadora)
  if (!garantia.numero_externo && garantia.montadora?.id) {
    try {
      const { data: prox } = await supabase.rpc('proximo_numero_sg_montadora', {
        p_montadora_id: garantia.montadora.id,
      });
      const num = typeof prox === 'number' ? prox : Number(prox);
      if (num && num > 0) {
        const ano = new Date(garantia.created_at).getFullYear();
        const numeroExt = `${ano}-${String(num).padStart(3, '0')}`;
        await supabase
          .from(TBL_GARANTIAS)
          .update({ numero_externo: numeroExt, updated_at: new Date().toISOString() })
          .eq('id', id);
        garantia.numero_externo = numeroExt;
      }
    } catch (err) {
      console.warn('Falha ao gerar numero_externo da SG (usando numero interno):', err);
    }
  }

  // 2. Carrega peças, OS, relatório técnico e anexos existentes
  const [pecasRes, osRes, tecRes, anexosRes] = await Promise.all([
    supabase.from('garantia_pecas').select('*').eq('garantia_id', id).order('created_at'),
    supabase
      .from('Ordem_Servico')
      .select('Os_Cliente, Cnpj_Cliente, Endereco_Cliente, Cidade_Cliente, Serv_Solicitado, Id_Ordem')
      .eq('Id_Ordem', garantia.id_ordem)
      .maybeSingle(),
    supabase
      .from('Ordem_Servico_Tecnicos')
      .select('Chassis, Horimetro, Motivo, ServicoRealizado, DataInicio, FotoHorimetro, FotoChassis, FotoFrente, FotoDireita, FotoEsquerda, FotoTraseira, FotoVolante, FotoFalha1, FotoFalha2, FotoFalha3, FotoFalha4, FotoPecaNova1, FotoPecaNova2, FotoPecaInstalada1, FotoPecaInstalada2')
      .eq('Ordem_Servico', garantia.id_ordem)
      .maybeSingle(),
    supabase
      .from(TBL_GAR_ANEXOS)
      .select('id, url, nome_arquivo, created_at')
      .eq('garantia_id', id)
      .eq('categoria', 'envio_fabrica')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  garantia.pecas = pecasRes.data || [];
  const anexoExistente = (anexosRes.data || [])[0] as
    | { id: string; url: string; nome_arquivo: string | null; created_at: string }
    | undefined;

  // 3. Define caminho/nome
  const nomeArquivoBase = nomeArquivoSG(garantia);
  const numeroSG = formatarNumeroSG(garantia);
  const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // 4. Carrega dados extras necessários para o gerador
  //    (trator pela tabela tratores, TODAS as requisições da OS, CEP, fotos)
  const chassis = garantia.chassis || tecRes.data?.Chassis || '';

  const tipoGarantia: TipoGarantiaSG =
    ((garantia.checklist_respostas as Record<string, unknown> | null)?.[
      'tipo_garantia_sg'
    ] as TipoGarantiaSG) || 'produto_garantia';

  const [tratorRes, requisicoesOsRes] = await Promise.all([
    chassis
      ? supabase
          .from('tratores')
          .select(
            'Modelo, Chassis, Numero_Motor, Entrega, "50h Data", "300h Data", "600h Data", "900h Data", "1200h Data", "1500h Data", "1800h Data", "2100h Data"',
          )
          .ilike('Chassis', `%${chassis}%`)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('Requisicao')
      .select('id, titulo, obs, recibo_fornecedor, fornecedor, valor_cobrado_cliente, Motivo')
      .eq('ordem_servico', garantia.id_ordem)
      .not('status', 'in', '("lixeira","cancelada")'),
  ]);
  const trator = (tratorRes.data || null) as TratorDB | null;
  type ReqRow = {
    id: number;
    titulo: string | null;
    obs: string | null;
    Motivo: string | null;
    recibo_fornecedor: string | null;
    fornecedor: string | null;
    valor_cobrado_cliente: number | null;
  };
  const reqsOs = (requisicoesOsRes.data || []) as ReqRow[];
  const reqsPorId = new Map<number, ReqRow>();
  reqsOs.forEach((r) => reqsPorId.set(r.id, r));

  // Normaliza para match fuzzy de descrição
  const norm = (s: string | null | undefined) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  // Decide se uma peça veio de Requisição:
  //   1) cod_produto começa com REQ-X → busca por id
  //   2) descrição da peça bate (igual OU contida) com titulo/obs/Motivo de
  //      alguma Requisição da OS → cross-reference pra garantias antigas
  const pecasUtilizadas: typeof garantia.pecas = [];
  const requisicoesParaSG: RequisicaoSG[] = [];
  const reqsUsadas = new Set<number>();

  for (const p of garantia.pecas || []) {
    const mReq = String(p.cod_produto || '').match(/^REQ-(\d+)/i);
    let reqMatch: ReqRow | undefined;
    if (mReq) {
      reqMatch = reqsPorId.get(Number(mReq[1]));
    } else {
      const descPeca = norm(p.descricao);
      if (descPeca.length >= 3) {
        reqMatch = reqsOs.find((r) => {
          const t = norm(r.titulo);
          const o = norm(r.obs || r.Motivo);
          return (
            (t && (t === descPeca || t.includes(descPeca) || descPeca.includes(t))) ||
            (o && (o === descPeca || o.includes(descPeca) || descPeca.includes(o)))
          );
        });
      }
    }
    if (reqMatch) {
      reqsUsadas.add(reqMatch.id);
      requisicoesParaSG.push({
        cod_produto: p.cod_produto || `REQ-${reqMatch.id}`,
        titulo: reqMatch.titulo || p.descricao,
        obs: reqMatch.obs || reqMatch.Motivo || null,
        recibo_fornecedor: reqMatch.recibo_fornecedor || null,
        fornecedor: reqMatch.fornecedor || null,
        valor_cobrado_cliente:
          reqMatch.valor_cobrado_cliente != null
            ? Number(reqMatch.valor_cobrado_cliente)
            : Number(p.preco_unitario || 0) || null,
      });
    } else {
      pecasUtilizadas.push(p);
    }
  }

  // Baixa as fotos do relatório técnico em paralelo (uma vez só) — reaproveita
  // os bufferes tanto pra inserir na planilha quanto pra anexar no e-mail.
  const fotosBuffer: Record<string, FotoBuffer> = {};
  const fotosEmail: FotoAnexo[] = [];
  if (tecRes.data) {
    const tec = tecRes.data as Record<string, string | null>;
    const camposParaBaixar = new Set<string>([
      ...MAPA_FOTOS_SG.map((m) => m.campo),
      // Alguns campos só anexados no e-mail (não vão pra planilha)
      'FotoDireita',
      'FotoEsquerda',
      'FotoVolante',
    ]);
    const downloads = Array.from(camposParaBaixar).map(async (campo) => {
      const url = tec[campo];
      if (!url) return;
      const buf = await baixarUrl(url);
      if (!buf) return;
      const ext = detectarExt(url);
      fotosBuffer[campo] = { buffer: buf, ext };
      const rotulo = campo.replace(/^Foto/, '').toLowerCase();
      fotosEmail.push({
        filename: `${rotulo}.${ext === 'png' ? 'png' : 'jpg'}`,
        content: buf,
        contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      });
    });
    await Promise.all(downloads);
  }

  // CEP via ViaCEP (best-effort)
  const cidade = osRes.data?.Cidade_Cliente || '';
  const enderecoFull = osRes.data?.Endereco_Cliente || '';
  const enderecoPart1 = enderecoFull.split(',')[0]?.trim() || '';
  // Detecta UF do endereço (default SP)
  const ufMatch = enderecoFull.match(/\(([A-Z]{2})\)|\b([A-Z]{2})\b\s*$/);
  const ufDetectado = ufMatch ? (ufMatch[1] || ufMatch[2] || 'SP') : 'SP';
  const cep = await buscarCepViaCEP(ufDetectado, cidade, enderecoPart1);

  // 5. Decide entre USAR o anexo existente (versão revisada pelo garantista)
  // ou GERAR um novo. Regra:
  // - apenasGerar = true → sempre gera novo (substitui o que tiver).
  // - apenasGerar = false (envio de e-mail) → se já existe um envio_fabrica,
  //   usa ele (provavelmente já foi revisado); senão, gera novo.
  let buffer: Buffer;
  let nomeArquivo = nomeArquivoBase;
  const storagePath = `${id}/envio_fabrica/${Date.now()}_${sanitizeFileName(nomeArquivoBase)}`;
  let precisaUpload = true;

  if (!apenasGerar && anexoExistente) {
    try {
      const r = await fetch(anexoExistente.url);
      if (r.ok) {
        buffer = Buffer.from(await r.arrayBuffer());
        nomeArquivo = anexoExistente.nome_arquivo || nomeArquivoBase;
        precisaUpload = false;
      } else {
        throw new Error(`http ${r.status}`);
      }
    } catch (err) {
      console.warn('Falha ao buscar SG existente, gerando uma nova:', err);
      buffer = await gerarSGMahindra(
        {
          garantia,
          os: osRes.data as DadosOS | null,
          tecnico: tecRes.data as DadosTec | null,
          trator,
          cep,
          pecasUtilizadas,
          requisicoes: requisicoesParaSG,
          tipoGarantia,
          fotos: fotosBuffer,
        },
        req.nextUrl.origin,
      );
    }
  } else {
    buffer = await gerarSGMahindra(
      {
        garantia,
        os: osRes.data as DadosOS | null,
        tecnico: tecRes.data as DadosTec | null,
        trator,
        cep,
        pecasUtilizadas,
        requisicoes: requisicoesParaSG,
        tipoGarantia,
        fotos: fotosBuffer,
      },
      req.nextUrl.origin,
    );
  }
  // Modo "apenas gerar" — só faz upload e retorna URL (não dispara e-mail)
  if (apenasGerar) {
    const { error: upErr } = await supabase.storage
      .from(BUCKET_GARANTIAS)
      .upload(storagePath, buffer, { contentType: xlsxMime, upsert: true });
    if (upErr) {
      console.error('Erro upload SG:', upErr.message);
      return NextResponse.json({ error: 'Falha ao salvar o arquivo da SG.' }, { status: 500 });
    }
    const { data: pub } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(storagePath);
    await supabase.from(TBL_GAR_ANEXOS).insert({
      garantia_id: id,
      categoria: 'envio_fabrica',
      url: pub.publicUrl,
      nome_arquivo: nomeArquivo,
      content_type: xlsxMime,
      enviado_por: ator,
    });
    return NextResponse.json({ ok: true, url: pub.publicUrl, nome: nomeArquivo });
  }

  // 6. Monta assunto e corpo (sanitiza variáveis pra evitar injeção HTML)
  const varsSan = {
    numero: sanitizeHtml(numeroSG),
    cliente: sanitizeHtml(garantia.cliente || osRes.data?.Os_Cliente || ''),
    os: sanitizeHtml(garantia.id_ordem || ''),
    chassis: sanitizeHtml(garantia.chassis || ''),
    modelo: sanitizeHtml(garantia.modelo || ''),
  };
  const assunto = (garantia.montadora.email_assunto
    ? aplicarTemplate(garantia.montadora.email_assunto, varsSan)
    : `SG ${numeroSG} - ${varsSan.cliente} - ${varsSan.modelo}`
  )
    .replace(/[<>"']/g, '')
    .trim();

  const corpoBase = garantia.montadora.email_corpo
    ? aplicarTemplate(garantia.montadora.email_corpo, varsSan)
    : `${saudacao()}, segue em anexo a Solicitação de Garantia ${varsSan.numero} referente à OS ${varsSan.os} do cliente ${varsSan.cliente}${varsSan.chassis ? ` (chassi ${varsSan.chassis})` : ''}.\n\nQualquer dúvida estamos à disposição.\n\nAtt,\nPós-Vendas Nova Tratores`;
  const html = `<p>${corpoBase.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;

  // 7. Envia o e-mail. Se usamos um anexo existente, NÃO faz upload novo
  // (o arquivo já está no Storage e o anexo já está registrado).
  // Se geramos um novo (não havia anexo), faz upload em paralelo.
  try {
    const sendMailPromise = transporter.sendMail({
      from: `"Pós-Vendas Nova Tratores" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject: assunto,
      html,
      attachments: [
        { filename: nomeArquivo, content: buffer, contentType: xlsxMime },
        ...fotosEmail,
      ],
    });

    let uploadResult: string | null = anexoExistente?.url || null;

    if (precisaUpload) {
      const [info, up] = await Promise.all([
        sendMailPromise,
        supabase.storage
          .from(BUCKET_GARANTIAS)
          .upload(storagePath, buffer, { contentType: xlsxMime, upsert: true })
          .then(({ error }) => {
            if (error) {
              console.error('Falha upload SG (e-mail seguiu mesmo assim):', error.message);
              return null;
            }
            const { data } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(storagePath);
            return data.publicUrl;
          })
          .catch(() => null),
      ]);
      uploadResult = up;

      // Registra o anexo do arquivo gerado
      if (up) {
        await supabase.from(TBL_GAR_ANEXOS).insert({
          garantia_id: id,
          categoria: 'envio_fabrica',
          url: up,
          nome_arquivo: nomeArquivo,
          content_type: xlsxMime,
          enviado_por: ator,
        });
      }

      await registrarEvento(id, {
        tipo: 'sg_enviado',
        ator,
        detalhe: `SG enviada para ${destinatarios.join(', ')} (${fotosEmail.length} foto(s) anexada(s))${up ? '' : ' — arquivo não foi armazenado'}`,
      });

      return NextResponse.json({
        ok: true,
        url: up,
        nome: nomeArquivo,
        destinatarios,
        messageId: info.messageId,
        fotosAnexadas: fotosEmail.length,
        origem: 'gerada',
      });
    }

    // Caso: usou anexo existente (versão revisada). Só envia o e-mail.
    const info = await sendMailPromise;
    await registrarEvento(id, {
      tipo: 'sg_enviado',
      ator,
      detalhe: `SG revisada enviada para ${destinatarios.join(', ')} (${fotosEmail.length} foto(s) anexada(s))`,
    });

    return NextResponse.json({
      ok: true,
      url: uploadResult,
      nome: nomeArquivo,
      destinatarios,
      messageId: info.messageId,
      fotosAnexadas: fotosEmail.length,
      origem: 'revisada',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erro desconhecido';
    console.error('Erro ao enviar e-mail SG:', err);
    return NextResponse.json({ error: `Falha ao enviar e-mail: ${msg}` }, { status: 500 });
  }
}

interface DadosOS {
  Os_Cliente?: string | null;
  Cnpj_Cliente?: string | null;
  Endereco_Cliente?: string | null;
  Cidade_Cliente?: string | null;
  Serv_Solicitado?: string | null;
  Id_Ordem?: string | null;
}

interface DadosTec {
  Chassis?: string | null;
  Horimetro?: string | null;
  Motivo?: string | null;
  ServicoRealizado?: string | null;
  DataInicio?: string | null;
}
