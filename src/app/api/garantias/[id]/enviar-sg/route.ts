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
  ClienteOmie,
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

// Detecta um chassi tipo Mahindra dentro de uma string e separa o modelo.
// Ex.: "6075 MDI07502LN0001737" → { modelo: "6075", chassi: "MDI07502LN0001737" }
// Se a string já é só modelo (ex.: "6075E CAB"), o chassi sai vazio.
// chassiInformado prevalece quando vier preenchido.
function separarModeloChassi(
  modeloRaw: string | null | undefined,
  chassiInformado: string | null | undefined,
): { modelo: string; chassi: string } {
  const modeloStr = String(modeloRaw || '').trim();
  const chassiStr = String(chassiInformado || '').trim();
  if (!modeloStr) return { modelo: '', chassi: chassiStr };
  // Padrão: bloco alfanumérico longo (>=12 chars) começando com 2+ letras
  // → tipicamente chassi Mahindra (MDI07510CS005275 etc.).
  const match = modeloStr.match(/\b([A-Z]{2,}[A-Z0-9]{10,})\b/);
  if (match) {
    const chassiExtraido = match[1];
    const modeloLimpo = modeloStr
      .replace(chassiExtraido, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { modelo: modeloLimpo, chassi: chassiStr || chassiExtraido };
  }
  return { modelo: modeloStr, chassi: chassiStr };
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
      .select('id, url, nome_arquivo, content_type, created_at')
      .eq('garantia_id', id)
      .eq('categoria', 'envio_fabrica')
      .order('created_at', { ascending: false }),
  ]);
  garantia.pecas = pecasRes.data || [];
  // Todos os arquivos da seção "envio_fabrica" entram como anexos do e-mail.
  // O .xlsx mais recente é a SG principal (substitui o gerado se houver versão
  // revisada). Os demais (PDFs de NF, recibos, etc.) vão como anexos extras.
  type AnexoLinha = { id: string; url: string; nome_arquivo: string | null; content_type: string | null; created_at: string };
  const anexosEnvio = (anexosRes.data || []) as AnexoLinha[];
  const xlsxRegex = /\.xlsx?$/i;
  const anexoExistente = anexosEnvio.find((a) => xlsxRegex.test(a.nome_arquivo || '')) || undefined;
  const anexosExtras = anexosEnvio.filter((a) => a !== anexoExistente);

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

  const cnpjCliente = String(osRes.data?.Cnpj_Cliente || '').replace(/\D/g, '');
  const [tratorRes, requisicoesOsRes, clienteRes] = await Promise.all([
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
    // Busca cliente Omie por CNPJ (best-effort) — telefone, e-mail, bairro,
    // inscrição estadual. Match por CNPJ só com dígitos pra evitar erros de máscara.
    cnpjCliente
      ? supabase
          .from('portal_nt_clientes_PRINCIPAL')
          .select('cnpj_cpf, telefone, email, endereco, cep, bairro, inscricao_estadual')
          .or(`cnpj_cpf.eq.${cnpjCliente},cnpj_cpf.eq.${osRes.data?.Cnpj_Cliente}`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const trator = (tratorRes.data || null) as TratorDB | null;
  const cliente = (clienteRes.data || null) as ClienteOmie | null;
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

  // Baixa as fotos do relatório técnico em paralelo (uma vez só) — entram na
  // planilha xlsx (não como anexos avulsos do e-mail, pra evitar redundância).
  const fotosBuffer: Record<string, FotoBuffer> = {};
  if (tecRes.data) {
    const tec = tecRes.data as Record<string, string | null>;
    const downloads = MAPA_FOTOS_SG.map(async ({ campo }) => {
      const url = tec[campo];
      if (!url) return;
      const buf = await baixarUrl(url);
      if (!buf) return;
      fotosBuffer[campo] = { buffer: buf, ext: detectarExt(url) };
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
          cliente,
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
        cliente,
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
  // Prioriza dados da tabela `tratores` (limpos via integração) sobre o que
  // foi salvo na garantia (técnico pode ter digitado modelo+chassi colado).
  // Se nada na `tratores` bater, faz fallback em garantia/Ordem_Servico_Tecnicos
  // e roda separarModeloChassi() pra extrair o chassi de dentro do modelo
  // quando o técnico digitou "6075 MDI07502LN0001737" no campo Modelo.
  const sepGarantia = separarModeloChassi(garantia.modelo, garantia.chassis);
  const sepTec = separarModeloChassi(null, tecRes.data?.Chassis);
  const chassisFinal =
    trator?.Chassis || sepTec.chassi || sepGarantia.chassi || '';
  const modeloFinal = trator?.Modelo || sepGarantia.modelo || '';
  const varsSan = {
    numero: sanitizeHtml(numeroSG),
    cliente: sanitizeHtml(garantia.cliente || osRes.data?.Os_Cliente || ''),
    os: sanitizeHtml(garantia.id_ordem || ''),
    chassis: sanitizeHtml(chassisFinal),
    modelo: sanitizeHtml(modeloFinal),
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
  const corpoHtml = `<p>${corpoBase.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  // Assinatura HTML configurada por montadora (logos, nome, telefone).
  // Vai como HTML puro — o admin já valida visualmente no preview do editor.
  const assinaturaHtml = garantia.montadora.email_assinatura || '';
  const html = assinaturaHtml ? `${corpoHtml}\n${assinaturaHtml}` : corpoHtml;

  // 7. Envia o e-mail. Se usamos um anexo existente, NÃO faz upload novo
  // (o arquivo já está no Storage e o anexo já está registrado).
  // Se geramos um novo (não havia anexo), faz upload em paralelo.
  // Baixa anexos extras (NF, recibos, etc.) que o garantista anexou na seção
  // de envio à fábrica além da própria SG xlsx.
  const anexosExtrasBaixados: { filename: string; content: Buffer; contentType?: string }[] = [];
  for (const a of anexosExtras) {
    const buf = await baixarUrl(a.url);
    if (!buf) {
      console.warn(`Não foi possível baixar anexo extra: ${a.nome_arquivo}`);
      continue;
    }
    anexosExtrasBaixados.push({
      filename: a.nome_arquivo || `anexo-${a.id}`,
      content: buf,
      contentType: a.content_type || undefined,
    });
  }

  try {
    const sendMailPromise = transporter.sendMail({
      from: `"Pós-Vendas Nova Tratores" <${process.env.GMAIL_USER}>`,
      to: destinatarios.join(', '),
      subject: assunto,
      html,
      attachments: [
        { filename: nomeArquivo, content: buffer, contentType: xlsxMime },
        ...anexosExtrasBaixados,
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
        detalhe: `SG enviada para ${destinatarios.join(', ')}${anexosExtrasBaixados.length ? ` (+${anexosExtrasBaixados.length} anexo(s) extra(s))` : ''}${up ? '' : ' — arquivo não foi armazenado'}`,
      });

      return NextResponse.json({
        ok: true,
        url: up,
        nome: nomeArquivo,
        destinatarios,
        messageId: info.messageId,
        origem: 'gerada',
      });
    }

    // Caso: usou anexo existente (versão revisada). Só envia o e-mail.
    const info = await sendMailPromise;
    await registrarEvento(id, {
      tipo: 'sg_enviado',
      ator,
      detalhe: `SG revisada enviada para ${destinatarios.join(', ')}${anexosExtrasBaixados.length ? ` (+${anexosExtrasBaixados.length} anexo(s) extra(s))` : ''}`,
    });

    return NextResponse.json({
      ok: true,
      url: uploadResult,
      nome: nomeArquivo,
      destinatarios,
      messageId: info.messageId,
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
