'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const UNIDADES = {
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

const FORNECEDORES_CADASTRADOS: any = {
  "Nova Tratores": { cnpj: "31.463.139/0001-03", endereco: "Unidade Piraju" },
  "Castro Máquinas": { cnpj: "23.268.241/0001-11", endereco: "Unidade Fartura" },
  "Rodrigo Torneiro (Panda)": { cnpj: "PRÓPRIO", endereco: "Oficina de Manutenção" }
};

export default function TemplatePDF({ req }: { req: any, onUpdate?: any, onPrint?: any }) {
  const [nomeSolicitante, setNomeSolicitante] = useState(req?.solicitante || '---');
  const [placaVeiculo, setPlacaVeiculo] = useState(req?.veiculo || '---');
  const [cotacaoData, setCotacaoData] = useState<any>(null);

  const reqId = req?.id;
  const codigoRef = req?.codigo_ref;

  useEffect(() => {
    const buscarNome = async () => {
      if (req?.solicitante && req.solicitante.includes('@')) {
        const { data } = await supabase
          .from('req_usuarios')
          .select('nome')
          .eq('email', req.solicitante.trim())
          .maybeSingle();
        if (data?.nome) setNomeSolicitante(data.nome);
      } else {
        setNomeSolicitante(req?.solicitante || '---');
      }
    };
    buscarNome();
  }, [req?.solicitante]);

  useEffect(() => {
    const buscarPlaca = async () => {
      if (req?.veiculo && !isNaN(req.veiculo) && String(req.veiculo).length < 5) {
        const { data } = await supabase
          .from('SupaPlacas')
          .select('NumPlaca')
          .eq('IdPlaca', req.veiculo)
          .maybeSingle();
        if (data?.NumPlaca) setPlacaVeiculo(data.NumPlaca);
      } else {
        setPlacaVeiculo(req?.veiculo || '---');
      }
    };
    buscarPlaca();
  }, [req?.veiculo]);

  useEffect(() => {
    const buscarCotacao = async () => {
      if (reqId && reqId !== 'NOVA') {
        const { data } = await supabase
          .from('req_cotacao')
          .select('*')
          .eq('id', reqId)
          .maybeSingle();
        if (data) setCotacaoData(data);
      }
    };
    buscarCotacao();
  }, [reqId, codigoRef]);

  if (!req) return null;

  const unidade = (req.tipo === 'Frota-Veiculos' || req.setor?.includes('Fartura')) ? UNIDADES.castro : UNIDADES.nova;
  const dataFormatada = req.data ? new Date(req.data).toLocaleDateString('pt-BR') : '___/___/_____';
  const dataCriacao = req.created_at ? new Date(req.created_at).toLocaleString('pt-BR') : '---';
  const dataFinanceiro = req.enviado_financeiro_data ? new Date(req.enviado_financeiro_data).toLocaleDateString('pt-BR') : '---';
  const cleanObs = req.obs ? req.obs.replace(/\[APPSHEET_ID:.*?\]/g, '').trim() : '';

  return (
    <div className="print-template-container">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4; margin: 10mm; }
        @media screen { .print-template-container { display: none !important; } }
        @media print {
          aside, nav, button, .no-print, header, .fixed, .absolute { display: none !important; }
          html, body { background: white !important; margin: 0 !important; width: 210mm; overflow: visible !important; }
          .print-template-container { display: block !important; background: white !important; width: 100%; }
          .pdf-content { padding: 0 !important; background: white !important; color: black !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}} />

      <div className="pdf-content flex flex-col font-sans bg-white text-black p-4">
        {/* CABEÇALHO */}
        <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tighter leading-none">{unidade.nome}</h2>
            <div className="text-[11px] uppercase tracking-tight leading-tight">
              <p>{unidade.cnpj} • {unidade.ie}</p>
              <p>{unidade.endereco}</p>
              <p>{unidade.cidade}</p>
              <p className="font-bold text-[12px] mt-1">{unidade.contato}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="border-4 border-black px-6 py-3 rounded-2xl inline-block bg-white shadow-sm">
              <span className="text-[10px] block uppercase font-black">ID REQUISIÇÃO</span>
              <span className="text-4xl font-black leading-none">{req.id || 'NOVA'}</span>
            </div>
          </div>
        </div>

        {/* TÍTULO */}
        <div className="mb-4 flex justify-between items-end border-b-2 border-slate-300 pb-1">
          <h1 className="text-2xl font-black uppercase tracking-tight">Requisição Materiais e Serviços</h1>
          <div className="text-[12px] font-black uppercase border-2 border-black px-4 py-1 rounded-lg bg-white">
            CATEGORIA: {req.tipo || 'Peça'}
          </div>
        </div>

        {/* GRADE DE INFORMAÇÕES */}
        <div className="grid grid-cols-3 gap-0 border-2 border-black rounded-2xl overflow-hidden mb-4 shadow-sm">
          <div className="p-3 border-r-2 border-black">
            <label className="text-[10px] font-black text-zinc-400 uppercase block mb-1">Solicitante Responsável</label>
            <span className="text-[14px] font-bold uppercase">{nomeSolicitante}</span>
          </div>
          <div className="p-3 border-r-2 border-black">
            <label className="text-[10px] font-black text-zinc-400 uppercase block mb-1">Unidade / Departamento</label>
            <span className="text-[14px] font-bold uppercase">{req.setor || '---'}</span>
          </div>
          <div className="p-3">
            <label className="text-[10px] font-black text-zinc-400 uppercase block mb-1">Data da Solicitação</label>
            <span className="text-[14px] font-bold uppercase">{dataFormatada}</span>
          </div>
        </div>

        {/* BLOCO TÉCNICO CONDICIONAL ATUALIZADO */}
        {(req.tipo === 'Frota-Veiculos' || ((req.setor === 'Trator-Cliente' || req.setor === 'Trator-Loja' || req.tipo === 'Ferramenta') && req.Chassis_Modelo)) && (
          <div className="border-2 border-black rounded-2xl overflow-hidden mb-4 shadow-sm">
            <div className={`grid grid-cols-4 divide-x-2 divide-black uppercase ${req.setor === 'Trator-Cliente' ? 'border-b-2 border-black' : ''}`}>
                {req.tipo === 'Frota-Veiculos' ? (
                  <>
                    <div className="p-3 col-span-2">
                      <label className="text-[10px] font-black block mb-1">Equipamento / Veículo (Placa)</label>
                      <span className="text-[14px] font-bold">{placaVeiculo}</span>
                    </div>
                    <div className="p-3">
                      <label className="text-[10px] font-black block mb-1">KM / Horas</label>
                      <span className="text-[14px] font-bold">{req.hodometro || '---'}</span>
                    </div>
                  </>
                ) : (
                  <div className="p-3 col-span-3">
                    <label className="text-[10px] font-black block mb-1">Referência Técnica / Modelo / Chassis</label>
                    <span className="text-[14px] font-bold">{req.Chassis_Modelo || '---'}</span>
                  </div>
                )}
                <div className="p-3">
                  {(req.setor === 'Trator-Cliente' || req.setor === 'Trator-Loja') && (
                    <>
                      <label className="text-[10px] font-black block mb-1">Ordem Serv.</label>
                      <span className="text-[14px] font-bold">{req.ordem_servico || '---'}</span>
                    </>
                  )}
                  {req.tipo === 'Ferramenta' && (
                    <>
                      <label className="text-[10px] font-black block mb-1">Destinação</label>
                      <span className="text-[14px] font-bold">{req.quem_ferramenta || req.ferramenta_quem || '---'}</span>
                    </>
                  )}
                </div>
            </div>

            {/* INFORMAÇÕES EXCLUSIVAS TRATOR-CLIENTE NO PDF */}
            {req.setor === 'Trator-Cliente' && (
              <div className="grid grid-cols-4 divide-x-2 divide-black uppercase">
                <div className="p-3 col-span-2">
                  <label className="text-[10px] font-black block mb-1">Nome do Cliente</label>
                  <span className="text-[14px] font-bold">{req.cliente || '---'}</span>
                </div>
                <div className="p-3 col-span-2 bg-slate-50">
                  <label className="text-[10px] font-black block mb-1">Valor Cobrado do Cliente</label>
                  <span className="text-[14px] font-bold">R$ {req.valor_cobrado_cliente || '0,00'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BLOCO DE COTAÇÕES */}
        {cotacaoData && cotacaoData.fornecedor1 && cotacaoData.incluir_pdf !== false && (
          <div className="border-2 border-black rounded-2xl overflow-hidden mb-4 shadow-sm">
            <div className="bg-slate-100 text-[11px] font-black uppercase py-2 border-b-2 border-black text-center">Mapa de Cotações Vinculado</div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-black text-[10px] font-black uppercase bg-slate-50">
                  <th className="p-2 border-r-2 border-black w-1/3">Fornecedor</th>
                  <th className="p-2 border-r-2 border-black w-1/3">Material/Serviço</th>
                  <th className="p-2 text-right">Valor Ofertado</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {[1, 2, 3, 4, 5].map(i => cotacaoData[`fornecedor${i}`] ? (
                  <tr key={i} className="border-b border-slate-200 last:border-0">
                    <td className="p-2 border-r-2 border-black uppercase">{cotacaoData[`fornecedor${i}`]}</td>
                    <td className="p-2 border-r-2 border-black uppercase">{cotacaoData[`servico_material${i}`]}</td>
                    <td className="p-2 text-right font-bold">R$ {cotacaoData[`valor${i}`]}</td>
                  </tr>
                ) : null)}
              </tbody>
            </table>
          </div>
        )}

        {/* MEMORIAL DESCRIÇÃO */}
        <div className="border-2 border-black rounded-2xl p-5 mb-4 bg-white flex-1 min-h-[5cm] shadow-sm">
          <label className="text-[11px] font-black text-black uppercase block mb-2 border-b-2 border-slate-300 pb-1">Memorial Descritivo / Justificativa Técnica</label>
          <div className="text-[14px] leading-relaxed text-black">
            <h4 className="font-bold mb-3 uppercase text-[16px] text-slate-900">{req.titulo}</h4>
            <div className="whitespace-pre-wrap font-medium text-slate-800">
              {cleanObs || 'Descrição detalhada não fornecida.'}
              {(req.Motivo || req.ReqMotivo) && (
                <div className="mt-6 pt-3 border-t-2 border-dashed border-slate-300">
                  <span className="text-[11px] font-black uppercase block text-zinc-400 mb-1">Justificativa:</span>
                  <p className="italic text-slate-700 text-[13px]">{req.Motivo || req.ReqMotivo}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FINANCEIRO */}
        <div className="grid grid-cols-12 gap-3 items-stretch mb-4">
          <div className="col-span-7 border-2 border-black rounded-2xl p-4 h-full bg-white shadow-sm">
            <label className="text-[10px] font-black text-zinc-400 uppercase block mb-1">Fornecedor / Origem Vinculada</label>
            <p className="text-[14px] font-bold uppercase text-black">{req.fornecedor || 'NÃO DEFINIDO'}</p>
            <p className="font-black mt-2 text-[11px] border-t pt-1">DOC FISCAL (NF): {req.numero_nota || 'EM PROCESSAMENTO'}</p>
          </div>
          <div className="col-span-5 border-2 border-black rounded-2xl p-4 h-full flex flex-col justify-center items-center bg-white shadow-sm">
            <label className="text-[11px] font-bold text-zinc-500 uppercase block leading-none mb-1">Valor Total Geral</label>
            <div className="text-4xl font-black tracking-tighter">
              <span className="text-[14px] mr-1 opacity-50 font-bold">R$</span>{req.valor_despeza || '0,00'}
            </div>
          </div>
        </div>

        {/* DATAS E ASSINATURA */}
        <div className="grid grid-cols-3 gap-4 mb-2">
          <div className="border border-slate-300 rounded-xl p-2 px-4 flex flex-col justify-center bg-white">
            <span className="text-[9px] font-black text-zinc-500 uppercase">Data de Criação</span>
            <span className="text-[12px] font-bold text-slate-700">{dataCriacao}</span>
          </div>
          
          <div className={`border rounded-xl p-2 px-4 flex flex-col justify-center ${req.status === 'financeiro' ? 'border-black bg-slate-50' : 'border-slate-300 opacity-30'}`}>
            <span className="text-[9px] font-black text-zinc-500 uppercase">Envio Financeiro</span>
            <span className="text-[12px] font-bold text-black">{req.status === 'financeiro' ? dataFinanceiro : 'PENDENTE'}</span>
          </div>

          <div className="border border-slate-300 rounded-xl p-2 px-4 flex flex-col justify-center bg-white">
            <span className="text-[9px] font-black text-zinc-500 uppercase">Data Impressão</span>
            <span className="text-[12px] font-bold text-slate-700">{new Date().toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* ASSINATURA RESPONSÁVEL FINANCEIRO */}
        {req.status === 'financeiro' && (
          <div className="mt-8 border-t-2 border-black pt-4 text-center animate-in fade-in duration-1000">
            <div className="w-80 mx-auto border-t border-black pt-1 mt-12">
              <p className="text-[12px] font-black uppercase tracking-widest text-black">Assinatura Responsável</p>
              <p className="text-[10px] text-zinc-400 uppercase font-bold">Documento Validado e Conferido para Pagamento</p>
            </div>
          </div>
        )}

        {/* RODAPÉ DO SISTEMA */}
        <div className="mt-auto pt-2 flex justify-between items-center text-[9px] text-zinc-500 uppercase font-black border-t-2 border-slate-100">
          <span>Nova Tratores • Gestão de Requisições v3.6</span>
          <span className="tracking-widest">Cód: {req.id?.toString().padStart(8, '0')}</span>
        </div>
      </div>
    </div>
  );
}