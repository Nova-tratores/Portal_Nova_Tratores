import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import { gerarSGMahindra, nomeArquivoSG, formatarNumeroSG } from '@/lib/garantias/sg-mahindra';
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

  // 4. Decide entre USAR o anexo existente (versão revisada pelo garantista)
  // ou GERAR um novo. Regra:
  // - apenasGerar = true → sempre gera novo (substitui o que tiver).
  // - apenasGerar = false (envio de e-mail) → se já existe um envio_fabrica,
  //   usa ele (provavelmente já foi revisado); senão, gera novo.
  let buffer: Buffer
  let nomeArquivo = nomeArquivoBase
  let storagePath = `${id}/envio_fabrica/${Date.now()}_${sanitizeFileName(nomeArquivoBase)}`
  let precisaUpload = true

  if (!apenasGerar && anexoExistente) {
    try {
      const r = await fetch(anexoExistente.url)
      if (r.ok) {
        buffer = Buffer.from(await r.arrayBuffer())
        nomeArquivo = anexoExistente.nome_arquivo || nomeArquivoBase
        precisaUpload = false
      } else {
        throw new Error(`http ${r.status}`)
      }
    } catch (err) {
      console.warn('Falha ao buscar SG existente, gerando uma nova:', err)
      buffer = await gerarSGMahindra(
        { garantia, os: osRes.data as DadosOS | null, tecnico: tecRes.data as DadosTec | null },
        req.nextUrl.origin,
      )
    }
  } else {
    buffer = await gerarSGMahindra(
      { garantia, os: osRes.data as DadosOS | null, tecnico: tecRes.data as DadosTec | null },
      req.nextUrl.origin,
    )
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

  // 5. Coleta fotos da OS como anexos do e-mail (best-effort)
  const fotos: FotoAnexo[] = [];
  if (tecRes.data) {
    const tec = tecRes.data as Record<string, string | null>;
    const map: [string, string][] = [
      ['FotoHorimetro', 'horimetro'],
      ['FotoChassis', 'chassis'],
      ['FotoFrente', 'frente'],
      ['FotoDireita', 'direita'],
      ['FotoEsquerda', 'esquerda'],
      ['FotoTraseira', 'traseira'],
      ['FotoVolante', 'volante'],
      ['FotoFalha1', 'falha-1'],
      ['FotoFalha2', 'falha-2'],
      ['FotoFalha3', 'falha-3'],
      ['FotoFalha4', 'falha-4'],
      ['FotoPecaNova1', 'peca-nova-1'],
      ['FotoPecaNova2', 'peca-nova-2'],
      ['FotoPecaInstalada1', 'peca-instalada-1'],
      ['FotoPecaInstalada2', 'peca-instalada-2'],
    ];
    for (const [campo, rotulo] of map) {
      const url = tec[campo];
      if (!url) continue;
      const data = await baixarUrl(url);
      if (data) {
        const ext = (url.split('?')[0].match(/\.([a-zA-Z0-9]{3,4})$/)?.[1] || 'jpg').toLowerCase();
        fotos.push({
          filename: `${rotulo}.${ext}`,
          content: data,
          contentType: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`,
        });
      }
    }
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
        ...fotos,
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
        detalhe: `SG enviada para ${destinatarios.join(', ')} (${fotos.length} foto(s) anexada(s))${up ? '' : ' — arquivo não foi armazenado'}`,
      });

      return NextResponse.json({
        ok: true,
        url: up,
        nome: nomeArquivo,
        destinatarios,
        messageId: info.messageId,
        fotosAnexadas: fotos.length,
        origem: 'gerada',
      });
    }

    // Caso: usou anexo existente (versão revisada). Só envia o e-mail.
    const info = await sendMailPromise;
    await registrarEvento(id, {
      tipo: 'sg_enviado',
      ator,
      detalhe: `SG revisada enviada para ${destinatarios.join(', ')} (${fotos.length} foto(s) anexada(s))`,
    });

    return NextResponse.json({
      ok: true,
      url: uploadResult,
      nome: nomeArquivo,
      destinatarios,
      messageId: info.messageId,
      fotosAnexadas: fotos.length,
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
