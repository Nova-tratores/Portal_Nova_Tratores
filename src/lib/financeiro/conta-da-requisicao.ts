// Cria uma conta a pagar (rascunho em finan_pagar) a partir de uma requisição
// na etapa do financeiro — o botão do card chama isto. O rascunho nasce com
// tudo que a requisição sabe (fornecedor, valor, NF, anexos, PDF da própria
// req, vendedor/projeto resolvidos no Omie). Categoria/conta corrente/tipo
// de documento/departamento vêm SUGERIDOS pela rota /omie/sugerir (histórico
// do fornecedor; sem histórico, o Tratorilson escolhe a categoria) — o
// revisor confirma no painel. Vencimento nasce como HOJE (a coluna é NOT
// NULL) — o revisor ajusta no painel.
//
// A tela "Novo Registro Financeiro" (novo-pagar-receber) usa as mesmas peças
// daqui (PDF + resolução de anexo) — mudou lá, mudou aqui.
//
// Valor: `Requisicao.valor_despeza` é TEXTO em formato BR e US misturados —
// parseValorBR é obrigatório (parse ingênuo com replace(',','.') já causou
// bugs reais de 100x neste projeto).
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/auth/client';
import { parseValorBR } from '@/lib/requisicoes/autorizacao';
import { requisicaoIdsDe } from '@/lib/financeiro/rastreio/agrupar';

export interface ReqParaConta {
  id: number;
  titulo?: string | null;
  numero_nota?: string | null;
  foto_nf?: string | null;
  boleto_fornecedor?: string | null;
  recibo_fornecedor?: string | null;
  valor_despeza?: string | null;
  tipo?: string | null;
  fornecedor?: string | null;
  solicitante?: string | null;
  setor?: string | null;
  data?: string | null;
  obs?: string | null;
  ordem_servico?: number | string | null;
  veiculo?: number | string | null;
  Chassis_Modelo?: string | null;
}

export interface ContaExistente {
  id: number;
  fornecedor: string | null;
  valor: string | number | null;
  status_envio: string | null;
  omie_cod_lancamento: number | null;
}

const COLS_REQ =
  'id, titulo, numero_nota, foto_nf, boleto_fornecedor, recibo_fornecedor, valor_despeza, tipo, fornecedor, solicitante, setor, data, obs, ordem_servico, veiculo, Chassis_Modelo';

// Caminho relativo do bucket `requisicoes` vira URL pública
export function resolverUrlAnexoRequisicao(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  if (caminho.startsWith('http')) return caminho;
  const { data } = supabase.storage.from('requisicoes').getPublicUrl(caminho);
  return data.publicUrl;
}

// Gera o PDF-resumo da requisição e sobe pro bucket `anexos/pagar` — é o
// documento que acompanha a conta no painel do financeiro.
export async function gerarPdfRequisicao(r: ReqParaConta): Promise<string | null> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF('portrait', 'mm', 'a4');
  const W = 210;
  let y = 15;

  const line = (label: string, value: unknown, x = 14) => {
    doc.setFontSize(8); doc.setTextColor(120); doc.text(label.toUpperCase(), x, y);
    y += 4;
    doc.setFontSize(11); doc.setTextColor(30, 41, 59); doc.text(String(value || '---'), x, y);
    y += 7;
  };

  // Cabeçalho
  doc.setFontSize(18); doc.setTextColor(30, 41, 59);
  doc.text('REQUISICAO DE MATERIAIS E SERVICOS', 14, y); y += 8;
  doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(14, y, W - 14, y); y += 8;

  // ID + Categoria
  doc.setFontSize(28); doc.setTextColor(0);
  doc.text(`#${r.id}`, W - 14, 23, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(100);
  doc.text((r.tipo || 'Peca').toUpperCase(), W - 14, 30, { align: 'right' });

  // Dados
  line('Titulo', r.titulo);
  line('Solicitante', r.solicitante);
  line('Setor', r.setor);
  line('Data', r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '---');

  // Financeiro
  y += 4;
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(14, y, W - 14, y); y += 6;
  line('Fornecedor', r.fornecedor);
  line('Numero Nota Fiscal', r.numero_nota);
  line('Valor', `R$ ${r.valor_despeza || '0,00'}`);

  // Descrição
  const anyR = r as unknown as Record<string, unknown>;
  const textoBruto = (r.obs || anyR.Motivo || anyR.ReqMotivo || '') as string;
  if (textoBruto) {
    y += 4;
    doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 6;
    doc.setFontSize(8); doc.setTextColor(120); doc.text('DESCRICAO / JUSTIFICATIVA', 14, y); y += 5;
    doc.setFontSize(10); doc.setTextColor(50);
    const texto = textoBruto.replace(/\[APPSHEET_ID:.*?\]/g, '').trim();
    const linhas = doc.splitTextToSize(texto, W - 28);
    doc.text(linhas, 14, y); y += linhas.length * 5;
  }

  // Rodapé
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Nova Tratores • Requisicao #${r.id} • Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 285);
  doc.text(`Cod: ${String(r.id).padStart(8, '0')}`, W - 14, 285, { align: 'right' });

  // Upload
  const blob = doc.output('blob');
  const filePath = `pagar/req-${r.id}-${Date.now()}.pdf`;
  await supabase.storage.from('anexos').upload(filePath, blob, { contentType: 'application/pdf' });
  const { data } = supabase.storage.from('anexos').getPublicUrl(filePath);
  return data.publicUrl;
}

// Já existe conta a pagar vinculada a esta requisição? Mesmo padrão do
// rastreio: coluna JSONB requisicao_ids + fallback no "#id" do motivo (contas
// antigas, sem backfill). O ilike é fuzzy (#123 casa com #1234), por isso o
// resultado passa pelo requisicaoIdsDe antes de valer.
export async function buscarContaDaReq(reqId: number): Promise<ContaExistente | null> {
  const id = Number(reqId);
  if (!Number.isFinite(id)) return null;
  const { data, error } = await supabase
    .from('finan_pagar')
    .select('id, fornecedor, valor, status_envio, omie_cod_lancamento, requisicao_ids, motivo, is_requisicao')
    .or(`requisicao_ids.cs.[${id}],motivo.ilike.%#${id}%`)
    .order('id', { ascending: false })
    .limit(10);
  // banco sem a coluna (migração do rastreio não rodou): sem como detectar
  if (error) return null;
  const hit = (data || []).find((row) => requisicaoIdsDe(row as never).includes(id));
  return hit ? (hit as ContaExistente) : null;
}

export interface ResultadoCriarConta {
  jaExiste?: ContaExistente;
  conta?: { id: number };
  reqsIncluidas: number[];
}

// Cria o rascunho. Mesma regra da tela de novo registro: requisições com a
// MESMA nota fiscal + fornecedor (ainda no financeiro) entram juntas na conta
// — uma nota, uma conta a pagar.
export async function criarContaDaRequisicao(params: {
  reqId: number;
  criadoPor?: string | null;
}): Promise<ResultadoCriarConta> {
  const { reqId, criadoPor } = params;

  const existente = await buscarContaDaReq(reqId);
  if (existente) return { jaExiste: existente, reqsIncluidas: [] };

  // Dados frescos do banco — o card pode estar defasado
  const { data: reqBase, error: errReq } = await supabase
    .from('Requisicao')
    .select(COLS_REQ)
    .eq('id', reqId)
    .maybeSingle();
  if (errReq || !reqBase) throw new Error(errReq?.message || `Requisição #${reqId} não encontrada.`);
  const base = reqBase as ReqParaConta;

  // Agrupa as irmãs da mesma nota (se houver nota E fornecedor — nota sem
  // fornecedor é ambígua demais pra juntar sozinho)
  let grupo: ReqParaConta[] = [base];
  const nota = String(base.numero_nota || '').trim();
  if (nota && base.fornecedor) {
    const { data: irmas } = await supabase
      .from('Requisicao')
      .select(COLS_REQ)
      .eq('status', 'financeiro')
      .eq('numero_nota', base.numero_nota)
      .eq('fornecedor', base.fornecedor)
      .order('id', { ascending: true });
    if (irmas && irmas.length) grupo = irmas as ReqParaConta[];
    if (!grupo.some((r) => r.id === reqId)) grupo = [base, ...grupo];
  }

  // Irmã que já está em outra conta fica de fora (não duplicar o valor dela)
  if (grupo.length > 1) {
    const livres: ReqParaConta[] = [];
    for (const r of grupo) {
      if (r.id === reqId) { livres.push(r); continue; }
      const ja = await buscarContaDaReq(r.id);
      if (!ja) livres.push(r);
    }
    grupo = livres;
  }

  const total = grupo.reduce((s, r) => s + parseValorBR(r.valor_despeza), 0);

  // Anexos: PDF-resumo de cada req + recibos vão em anexo_requisicao;
  // o boleto do fornecedor vai em anexo_boleto (é onde o checklist procura);
  // a foto da NF vira anexo_nf.
  const urlsReq: string[] = [];
  const urlsBoleto: string[] = [];
  for (const r of grupo) {
    try {
      const pdf = await gerarPdfRequisicao(r);
      if (pdf) urlsReq.push(pdf);
    } catch { /* PDF é acompanhamento — sem ele a conta ainda vale */ }
    const bol = resolverUrlAnexoRequisicao(r.boleto_fornecedor);
    if (bol) urlsBoleto.push(bol);
    const rec = resolverUrlAnexoRequisicao(r.recibo_fornecedor);
    if (rec) urlsReq.push(rec);
  }
  const reqComNF = grupo.find((r) => r.foto_nf);
  const anexoNF = reqComNF ? resolverUrlAnexoRequisicao(reqComNF.foto_nf) : null;

  // Vendedor (do solicitante) e projeto (da OS/placa/chassi) + classificação
  // (categoria/conta/tipo doc/departamento — histórico do fornecedor, senão o
  // Tratorilson escolhe a categoria). Em paralelo; falha em qualquer um não
  // impede a conta (o painel deixa escolher na mão).
  let codigoVendedor: number | null = null;
  let codigoProjeto: number | null = null;
  let codigoCategoria: string | null = null;
  let idContaCorrente: number | null = null;
  let codigoTipoDocumento: string | null = null;
  let codigoDepartamento: string | null = null;
  const cabecalhos = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const [resolvido, sugerido] = await Promise.allSettled([
    fetch('/api/financeiro/contas-pagar/omie/resolver-req', {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        empresa: 'Nova Tratores',
        solicitante: base.solicitante,
        ordemServicoId: base.ordem_servico,
        veiculoId: base.veiculo,
        chassisModelo: base.Chassis_Modelo,
      }),
    }).then((r) => r.json()),
    fetch('/api/financeiro/contas-pagar/omie/sugerir', {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({
        empresa: 'Nova Tratores',
        fornecedor: base.fornecedor,
        tipoReq: base.tipo,
        titulo: base.titulo,
        obs: base.obs,
        setor: base.setor,
      }),
    }).then((r) => r.json()),
  ]);
  if (resolvido.status === 'fulfilled' && resolvido.value?.ok) {
    const d = resolvido.value;
    if (d.codigoVendedor) codigoVendedor = Number(d.codigoVendedor);
    if (d.codigoProjeto) codigoProjeto = Number(d.codigoProjeto);
  }
  if (sugerido.status === 'fulfilled' && sugerido.value?.ok) {
    const d = sugerido.value;
    if (d.codigoCategoria) codigoCategoria = String(d.codigoCategoria);
    if (d.idContaCorrente) idContaCorrente = Number(d.idContaCorrente);
    if (d.codigoTipoDocumento) codigoTipoDocumento = String(d.codigoTipoDocumento);
    if (d.codigoDepartamento) codigoDepartamento = String(d.codigoDepartamento);
  }

  // Vencimento a requisição não sabe, mas a coluna é NOT NULL — entra HOJE
  // como chamariz: o painel mostra a data grande em vermelho e o revisor
  // ajusta antes de enviar ao Omie. (Data local, sem UTC — meia-noite BRT
  // já é o dia seguinte em UTC e o vencimento nasceria errado.)
  const hoje = new Date();
  const vencimentoHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  const registro: Record<string, unknown> = {
    fornecedor: base.fornecedor || null,
    valor: total.toFixed(2),
    data_vencimento: vencimentoHoje,
    motivo: grupo.map((r) => `#${r.id} ${r.titulo || ''}`.trim()).join(', '),
    // NF de verdade ou nada — "REQ #123" no campo enganaria o checklist
    numero_NF: nota || null,
    metodo: urlsBoleto.length ? 'Boleto' : null,
    anexo_nf: anexoNF,
    anexo_boleto: urlsBoleto.length ? urlsBoleto.join(', ') : null,
    anexo_requisicao: urlsReq.length ? urlsReq.join(', ') : null,
    is_requisicao: true,
    requisicao_ids: grupo.map((r) => r.id),
    status: 'financeiro',
    autonomo_sem_nota: false,
    criado_por: criadoPor || null,
    // Rascunho sempre — o envio ao Omie acontece pelo painel após validação
    status_envio: 'rascunho',
    omie_empresa: 'Nova Tratores',
    omie_categoria: codigoCategoria,
    omie_conta_corrente: idContaCorrente,
    omie_projeto: codigoProjeto,
    omie_vendedor: codigoVendedor,
    omie_tipo_documento: codigoTipoDocumento,
    omie_departamento: codigoDepartamento,
  };

  let { data: inserido, error } = await supabase.from('finan_pagar').insert([registro]).select('id').single();
  // banco ainda sem a coluna requisicao_ids? re-tenta sem ela — criar a conta
  // não pode depender da migração do rastreio
  if (error && /requisicao_ids/i.test(error.message || '')) {
    delete registro.requisicao_ids;
    ({ data: inserido, error } = await supabase.from('finan_pagar').insert([registro]).select('id').single());
  }
  if (error || !inserido) throw new Error(error?.message || 'Erro ao criar a conta a pagar.');

  return { conta: { id: inserido.id }, reqsIncluidas: grupo.map((r) => r.id) };
}
