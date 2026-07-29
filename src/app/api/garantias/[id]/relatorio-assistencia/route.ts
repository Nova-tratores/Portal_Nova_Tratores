import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { gerarRATPdf, type DadosRAT, type ModoRAT } from '@/lib/garantias/rat-pdf';

export const runtime = 'nodejs';

// POST /api/garantias/[id]/relatorio-assistencia
// Gera o Relatório de Assistência Técnica (RAT) em PDF.
// body: { ator, modo: 'preenchido'|'imprimir', campos?: Record<string,string> }
//  - preenchido: salva os campos rat_* no checklist_respostas, gera o PDF com
//    os valores e ANEXA na garantia (categoria relatorio_at) — vai no e-mail.
//  - imprimir: retorna o PDF direto (dados fixos preenchidos + áreas pautadas
//    em branco) pro garantista imprimir, preencher à mão e anexar o escaneado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';
  const modo: ModoRAT = body.modo === 'imprimir' ? 'imprimir' : 'preenchido';

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, numero_externo, id_ordem, cliente, chassis, modelo, status, tecnico_nome, tecnico_horas, tecnico_km, garantista_nome, garantista_horas, garantista_km, checklist_respostas, montadora:garantia_montadoras(nome)')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Garantia finalizada tem o checklist congelado — só o modo 'imprimir'
  // (leitura) continua disponível.
  if (modo === 'preenchido' && (g.status === 'aprovada' || g.status === 'rejeitada')) {
    return NextResponse.json({ error: 'Garantia já finalizada — o RAT não pode mais ser alterado.' }, { status: 400 });
  }

  const respostas = ((g.checklist_respostas as Record<string, unknown>) || {});

  // Persiste os campos rat_* editados na tela (só no modo preenchido)
  const campos: Record<string, string> = body.campos && typeof body.campos === 'object' ? body.campos : {};
  const ratCampos: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (k.startsWith('rat_')) ratCampos[k] = String(v ?? '');
  }
  let respostasAtuais = respostas;
  if (modo === 'preenchido' && Object.keys(ratCampos).length > 0) {
    respostasAtuais = { ...respostas, ...ratCampos };
    await supabase
      .from(TBL_GARANTIAS)
      .update({ checklist_respostas: respostasAtuais, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  // Dados da OS + relatório do técnico + peças (+ telefone do cadastro Omie)
  const [osRes, tecRes, pecasRes] = await Promise.all([
    supabase
      .from('Ordem_Servico')
      .select('Os_Cliente, Cnpj_Cliente, Endereco_Cliente, Cidade_Cliente')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle(),
    supabase
      .from('Ordem_Servico_Tecnicos')
      .select('Horimetro, DataInicio')
      .eq('Ordem_Servico', g.id_ordem)
      .maybeSingle(),
    supabase
      .from(TBL_GAR_PECAS)
      .select('cod_produto, descricao, quantidade')
      .eq('garantia_id', id)
      .order('created_at'),
  ]);

  const cnpjDigitos = String(osRes.data?.Cnpj_Cliente || '').replace(/\D/g, '');
  let telefoneOmie = '';
  if (cnpjDigitos) {
    const { data: cli } = await supabase
      .from('portal_nt_clientes_PRINCIPAL')
      .select('telefone')
      .or(`cnpj_cpf.eq.${cnpjDigitos},cnpj_cpf.eq.${osRes.data?.Cnpj_Cliente}`)
      .limit(1)
      .maybeSingle();
    telefoneOmie = String(cli?.telefone || '');
  }

  // Endereço vem como "FAZENDA X, S/N, FARTURA (SP)" — separa a UF e tira a
  // parte cidade/UF do campo endereço (o formulário tem Município/UF próprios)
  const enderecoBruto = String(osRes.data?.Endereco_Cliente || '');
  const ufMatch = enderecoBruto.match(/\(([A-Z]{2})\)\s*$/);
  const endereco = enderecoBruto.replace(/,?\s*[^,]*\([A-Z]{2}\)\s*$/, '').trim() || enderecoBruto;

  const fmtDataBR = (s?: string | null) => {
    const d = s ? new Date(s) : null;
    return d && !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : String(s || '');
  };

  const r = (k: string) => String(respostasAtuais[k] ?? '').trim();
  const descricaoRelato = [r('rat_reclamacao') || r('sg_reclamacao'), r('rat_diagnostico') || r('sg_diagnostico')]
    .filter(Boolean)
    .join(' ');
  const horasTrab = g.garantista_horas ?? g.tecnico_horas;
  const dados: DadosRAT = {
    numero: g.numero,
    numeroFormulario: r('rat_numero_formulario') || '0000',
    os: g.id_ordem,
    dataChamado: r('rat_data_chamado') || fmtDataBR(tecRes.data?.DataInicio) || '',
    tipo: r('rat_tipo') === 'entrega' ? 'entrega' : 'assistencia',
    cliente: g.cliente || osRes.data?.Os_Cliente || '',
    telefone: r('rat_telefone') || telefoneOmie,
    endereco,
    municipio: osRes.data?.Cidade_Cliente || '',
    uf: r('rat_uf') || ufMatch?.[1] || '',
    modelo: g.modelo || '',
    numeroSerie: g.chassis || '',
    horasMaquina: r('rat_horas_maquina') || r('rat_horimetro') || String(tecRes.data?.Horimetro ?? ''),
    horasPlataforma: r('rat_horas_plataforma'),
    descricao: descricaoRelato,
    acao: r('rat_acao') || r('sg_acao_tomada'),
    kmIda: r('rat_km_ida'),
    kmVolta: r('rat_km_volta'),
    horaChegada: r('rat_hora_chegada'),
    horaSaida: r('rat_hora_saida'),
    horasTrabalhadas: r('rat_horas_trabalhadas') || (horasTrab != null ? String(horasTrab) : ''),
    dataAtendimento: r('rat_data_atendimento') || fmtDataBR(tecRes.data?.DataInicio),
    tecnico: r('rat_tecnico') || g.tecnico_nome,
    pecas: (pecasRes.data || []) as DadosRAT['pecas'],
  };

  let pdf: Buffer;
  try {
    pdf = await gerarRATPdf(dados, modo);
  } catch (err) {
    console.error('Erro ao gerar RAT:', err);
    return NextResponse.json({ error: 'Falha ao gerar o PDF do RAT.' }, { status: 500 });
  }

  const nomeArquivo = `RAT_${g.numero}${modo === 'imprimir' ? '_para-preencher' : ''}.pdf`;

  // Modo imprimir: devolve o PDF direto (não vira anexo — o oficial é o
  // escaneado que o garantista anexa depois de preencher à mão)
  if (modo === 'imprimir') {
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${nomeArquivo}"`,
      },
    });
  }

  // Modo preenchido: sobe pro bucket e registra como anexo relatorio_at
  const storagePath = `${id}/relatorio_at/${Date.now()}_${nomeArquivo}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_GARANTIAS)
    .upload(storagePath, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error('Erro no upload do RAT:', upErr.message);
    return NextResponse.json({ error: 'Falha ao salvar o PDF do RAT.' }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(storagePath);

  const { data: anexo, error: anexoErr } = await supabase
    .from(TBL_GAR_ANEXOS)
    .insert({
      garantia_id: id,
      categoria: 'relatorio_at',
      url: pub.publicUrl,
      nome_arquivo: nomeArquivo,
      content_type: 'application/pdf',
      enviado_por: ator,
    })
    .select()
    .single();
  if (anexoErr) {
    console.error('Erro ao registrar anexo do RAT:', anexoErr.message);
    return NextResponse.json({ error: 'PDF gerado, mas falhou ao registrar o anexo do RAT.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'rat_gerado',
    ator,
    detalhe: `Relatório de Assistência Técnica gerado (${nomeArquivo})`,
  });

  return NextResponse.json({ ok: true, url: pub.publicUrl, nome: nomeArquivo, anexo });
}
