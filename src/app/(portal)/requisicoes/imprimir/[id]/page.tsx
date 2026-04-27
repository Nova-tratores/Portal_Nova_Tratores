'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const UNIDADES: any = {
  nova: {
    nome: "NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA",
    cnpj: "CNPJ: 31.463.139/0001-03",
    ie: "Inscrição Estadual: 537.054.605.110",
    endereco: "AVENIDA SÃO SEBASTIÃO, 1065 • JARDIM ANA CRISTINA",
    cidade: "Piraju - SP • CEP: 18800-770",
    contato: "Telefone: (14) 3351-6049 • novatratores.com.br"
  },
  castro: {
    nome: "CASTRO MÁQUINAS E PEÇAS AGRÍCOLAS LTDA",
    cnpj: "CNPJ: 23.268.241/0001-11",
    ie: "Inscrição Estadual: Isento",
    endereco: "RUA DOUTOR FARTURA, 140",
    cidade: "Fartura - SP • CEP: 18870-000",
    contato: "Telefone: (14) 3382-1234 • castromaquinas.com.br"
  }
};

export default function ImprimirRequisicao() {
  const params = useParams();
  const id = params?.id;
  const [req, setReq] = useState<any>(null);
  const [nomeSolicitante, setNomeSolicitante] = useState('---');
  const [placaVeiculo, setPlacaVeiculo] = useState('---');
  const [cotacaoData, setCotacaoData] = useState<any>(null);
  const [mostrarCotacao, setMostrarCotacao] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const carregar = async () => {
      const { data } = await supabase.from('Requisicao').select('*').eq('id', id).maybeSingle();
      if (!data) { setLoading(false); return; }
      setReq(data);

      // Resolver nome solicitante
      if (data.solicitante?.includes('@')) {
        const { data: u } = await supabase.from('req_usuarios').select('nome').eq('email', data.solicitante.trim()).maybeSingle();
        setNomeSolicitante(u?.nome || data.solicitante);
      } else {
        setNomeSolicitante(data.solicitante || '---');
      }

      // Resolver placa
      if (data.veiculo && !isNaN(data.veiculo) && String(data.veiculo).length < 5) {
        const { data: v } = await supabase.from('SupaPlacas').select('NumPlaca').eq('IdPlaca', data.veiculo).maybeSingle();
        setPlacaVeiculo(v?.NumPlaca || data.veiculo);
      } else {
        setPlacaVeiculo(data.veiculo || '---');
      }

      // Cotação
      const { data: cot } = await supabase.from('req_cotacao').select('*').eq('id', id).maybeSingle();
      if (cot) {
        setCotacaoData(cot);
        setMostrarCotacao(cot.incluir_pdf === false ? false : true);
      } else {
        setMostrarCotacao(true);
      }

      setLoading(false);
    };
    carregar();
  }, [id]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', color: '#999' }}>Carregando requisição...</div>;
  if (!req) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif', color: '#999' }}>Requisição não encontrada.</div>;

  const unidade = (req.tipo === 'Frota-Veiculos' || req.setor?.includes('Fartura')) ? UNIDADES.castro : UNIDADES.nova;
  const dataFormatada = req.data ? new Date(req.data + 'T12:00:00').toLocaleDateString('pt-BR') : '___/___/_____';
  const dataCriacao = req.created_at ? new Date(req.created_at).toLocaleString('pt-BR') : '---';
  const dataFinanceiro = req.enviado_financeiro_data ? new Date(req.enviado_financeiro_data).toLocaleDateString('pt-BR') : '---';
  const cleanObs = req.obs ? req.obs.replace(/\[APPSHEET_ID:.*?\]/g, '').trim() : '';

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4; margin: 10mm; }
        @media print {
          aside, nav, .no-print, header, .fixed { display: none !important; }
          body { background: white !important; margin: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-actions { display: none !important; }
        }
      `}} />

      <div className="print-actions" style={{ padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'center', fontFamily: 'sans-serif' }}>
        <button onClick={() => window.print()} style={{ background: '#1e293b', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          Imprimir / Salvar PDF
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: cotacaoData?.fornecedor1 ? '#374151' : '#9ca3af', cursor: cotacaoData?.fornecedor1 ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            checked={mostrarCotacao ?? true}
            onChange={(e) => setMostrarCotacao(e.target.checked)}
            disabled={!cotacaoData?.fornecedor1}
            style={{ width: 16, height: 16, cursor: cotacaoData?.fornecedor1 ? 'pointer' : 'default' }}
          />
          Incluir cotação no PDF {!cotacaoData?.fornecedor1 && '(sem cotação)'}
        </label>
        <span style={{ fontSize: 12, color: '#64748b' }}>Requisição #{req.id} — {req.titulo}</span>
      </div>

      <div style={{ maxWidth: '210mm', margin: '0 auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#000', background: '#fff' }}>
        {/* CABEÇALHO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, borderBottom: '2px solid #000', paddingBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>{unidade.nome}</h2>
            <div style={{ fontSize: 11, textTransform: 'uppercase', lineHeight: 1.4, marginTop: 4 }}>
              <p style={{ margin: 0 }}>{unidade.cnpj} • {unidade.ie}</p>
              <p style={{ margin: 0 }}>{unidade.endereco}</p>
              <p style={{ margin: 0 }}>{unidade.cidade}</p>
              <p style={{ margin: 0, fontWeight: 700, marginTop: 4 }}>{unidade.contato}</p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ border: '4px solid #000', padding: '12px 24px', borderRadius: 16, display: 'inline-block' }}>
              <span style={{ fontSize: 10, display: 'block', fontWeight: 900, textTransform: 'uppercase' }}>ID REQUISIÇÃO</span>
              <span style={{ fontSize: 36, fontWeight: 900, lineHeight: 1 }}>{req.id}</span>
            </div>
          </div>
        </div>

        {/* TÍTULO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #cbd5e1', paddingBottom: 4, marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, textTransform: 'uppercase', margin: 0 }}>Requisição Materiais e Serviços</h1>
          <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', border: '2px solid #000', padding: '4px 16px', borderRadius: 8 }}>
            CATEGORIA: {req.tipo || 'Peça'}
          </div>
        </div>

        {/* GRADE */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '2px solid #000', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: 12, borderRight: '2px solid #000' }}>
            <label style={{ fontSize: 10, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Solicitante</label>
            <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>{nomeSolicitante}</span>
          </div>
          <div style={{ padding: 12, borderRight: '2px solid #000' }}>
            <label style={{ fontSize: 10, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Setor</label>
            <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase' }}>{req.setor || '---'}</span>
          </div>
          <div style={{ padding: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Data</label>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{dataFormatada}</span>
          </div>
        </div>

        {/* BLOCO TÉCNICO */}
        {(req.tipo === 'Frota-Veiculos' || ((req.setor === 'Trator-Cliente' || req.setor === 'Trator-Loja' || req.tipo === 'Ferramenta') && req.Chassis_Modelo)) && (
          <div style={{ border: '2px solid #000', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', textTransform: 'uppercase' }}>
              {req.tipo === 'Frota-Veiculos' ? (
                <>
                  <div style={{ padding: 12, borderRight: '2px solid #000' }}>
                    <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Veículo (Placa)</label>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{placaVeiculo}</span>
                  </div>
                  <div style={{ padding: 12, borderRight: '2px solid #000' }}>
                    <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>KM / Horas</label>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{req.hodometro || '---'}</span>
                  </div>
                </>
              ) : (
                <div style={{ padding: 12, borderRight: '2px solid #000', gridColumn: 'span 2' }}>
                  <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Referência Técnica / Chassis</label>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{req.Chassis_Modelo || '---'}</span>
                </div>
              )}
              <div style={{ padding: 12 }}>
                {(req.setor === 'Trator-Cliente' || req.setor === 'Trator-Loja') && (
                  <>
                    <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Ordem Serv.</label>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{req.ordem_servico || '---'}</span>
                  </>
                )}
                {req.tipo === 'Ferramenta' && (
                  <>
                    <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Destinação</label>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{req.quem_ferramenta || req.ferramenta_quem || '---'}</span>
                  </>
                )}
              </div>
            </div>
            {req.setor === 'Trator-Cliente' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '2px solid #000', textTransform: 'uppercase' }}>
                <div style={{ padding: 12, borderRight: '2px solid #000' }}>
                  <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Cliente</label>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{req.cliente || '---'}</span>
                </div>
                <div style={{ padding: 12, background: '#f8fafc' }}>
                  <label style={{ fontSize: 10, fontWeight: 900, display: 'block', marginBottom: 4 }}>Valor Cobrado Cliente</label>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>R$ {req.valor_cobrado_cliente || '0,00'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* COTAÇÕES */}
        {mostrarCotacao !== false && cotacaoData && cotacaoData.fornecedor1 && (
          <div style={{ border: '2px solid #000', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: '#f1f5f9', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '8px 0', borderBottom: '2px solid #000', textAlign: 'center' }}>Mapa de Cotações</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', background: '#f8fafc' }}>
                  <th style={{ padding: 8, borderRight: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'left' }}>Fornecedor</th>
                  <th style={{ padding: 8, borderRight: '2px solid #000', borderBottom: '2px solid #000', textAlign: 'left' }}>Material/Serviço</th>
                  <th style={{ padding: 8, borderBottom: '2px solid #000', textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => cotacaoData[`fornecedor${i}`] ? (
                  <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 8, borderRight: '2px solid #000', fontSize: 13, textTransform: 'uppercase' }}>{cotacaoData[`fornecedor${i}`]}</td>
                    <td style={{ padding: 8, borderRight: '2px solid #000', fontSize: 13, textTransform: 'uppercase' }}>{cotacaoData[`servico_material${i}`]}</td>
                    <td style={{ padding: 8, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>R$ {cotacaoData[`valor${i}`]}</td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}

        {/* DESCRIÇÃO */}
        <div style={{ border: '2px solid #000', borderRadius: 16, padding: 20, marginBottom: 16, minHeight: '5cm' }}>
          <label style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', display: 'block', marginBottom: 8, borderBottom: '2px solid #cbd5e1', paddingBottom: 4 }}>Memorial Descritivo / Justificativa Técnica</label>
          <h4 style={{ fontSize: 16, fontWeight: 900, textTransform: 'uppercase', margin: '0 0 12px 0' }}>{req.titulo}</h4>
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {cleanObs || 'Descrição detalhada não fornecida.'}
            {(req.Motivo || req.ReqMotivo) && (
              <div style={{ marginTop: 24, paddingTop: 12, borderTop: '2px dashed #cbd5e1' }}>
                <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', display: 'block', color: '#9ca3af', marginBottom: 4 }}>Justificativa:</span>
                <p style={{ fontStyle: 'italic', color: '#475569', fontSize: 13, margin: 0 }}>{req.Motivo || req.ReqMotivo}</p>
              </div>
            )}
          </div>
        </div>

        {/* FINANCEIRO */}
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 12, marginBottom: 16 }}>
          <div style={{ border: '2px solid #000', borderRadius: 16, padding: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 900, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Fornecedor</label>
            <p style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>{req.fornecedor || 'NÃO DEFINIDO'}</p>
            <p style={{ fontWeight: 900, marginTop: 8, fontSize: 11, borderTop: '1px solid #000', paddingTop: 4, margin: '8px 0 0' }}>DOC FISCAL (NF): {req.numero_nota || 'EM PROCESSAMENTO'}</p>
          </div>
          <div style={{ border: '2px solid #000', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Valor Total</label>
            <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px' }}>
              <span style={{ fontSize: 14, marginRight: 4, opacity: 0.5 }}>R$</span>{req.valor_despeza || '0,00'}
            </div>
          </div>
        </div>

        {/* DATAS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 8 }}>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 16px' }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', display: 'block' }}>Data Criação</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{dataCriacao}</span>
          </div>
          <div style={{ border: req.status === 'financeiro' ? '1px solid #000' : '1px solid #cbd5e1', borderRadius: 12, padding: '8px 16px', opacity: req.status === 'financeiro' ? 1 : 0.3 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', display: 'block' }}>Envio Financeiro</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{req.status === 'financeiro' ? dataFinanceiro : 'PENDENTE'}</span>
          </div>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '8px 16px' }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', display: 'block' }}>Data Impressão</span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{new Date().toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* ASSINATURA */}
        {req.status === 'financeiro' && (
          <div style={{ marginTop: 32, borderTop: '2px solid #000', paddingTop: 16, textAlign: 'center' }}>
            <div style={{ width: 320, margin: '48px auto 0', borderTop: '1px solid #000', paddingTop: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Assinatura Responsável</p>
              <p style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700, margin: 0 }}>Documento Validado para Pagamento</p>
            </div>
          </div>
        )}

        {/* RODAPÉ */}
        <div style={{ marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#6b7280', textTransform: 'uppercase', fontWeight: 900, borderTop: '2px solid #f1f5f9' }}>
          <span>Nova Tratores • Gestão de Requisições v3.6</span>
          <span style={{ letterSpacing: '2px' }}>Cód: {String(req.id).padStart(8, '0')}</span>
        </div>
      </div>
    </>
  );
}
