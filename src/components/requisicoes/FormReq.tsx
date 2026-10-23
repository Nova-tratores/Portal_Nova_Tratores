'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import { formatarLitros, formatarHodometro } from '@/lib/requisicoes/campos';
import { FolderOpen, ChevronDown, Check } from 'lucide-react';
import { useRascunho } from '@/lib/rascunho/useRascunho';
import AvisoRascunho from '@/components/rascunho/AvisoRascunho';
import { fetchAuth } from '@/lib/auth/client';
import SugestaoHistorico from './SugestaoHistorico';
import { parecidas } from '@/lib/requisicoes/inteligencia';

/** Chave do rascunho da nova requisição (a página apaga depois de criar). */
export const RASCUNHO_NOVA_REQ = 'requisicao:nova';

const EMPRESAS = {
  NOVA: { nome: "NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA", endereco: "AVENIDA SÃO SEBASTIÃO, 1065 | Piraju - SP" },
  CASTRO: { nome: "CASTRO MÁQUINAS E PEÇAS AGRÍCOLAS LTDA", endereco: "RUA DOUTOR FARTURA, 140 | FARTURA - SP" }
};

export default function FormReq({ onSave, osInicial, solicitanteInicial, chaveRascunho = RASCUNHO_NOVA_REQ, historico = [] }: {
  onSave: (data: any) => void; osInicial?: string | null;
  /** requisições já carregadas na tela: dão a sugestão de fornecedor/valor e o aviso de parecida */
  historico?: any[];
  /** POS: já vem o técnico principal da OS como solicitante (casado pelo nome com o usuário do portal) */
  solicitanteInicial?: string;
  /** POS usa um rascunho por OS, pra não misturar com a tela de Requisições */
  chaveRascunho?: string;
}) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  // valor na criação (a coluna é texto BR: "200,00")
  const [valorNovo, setValorNovo] = useState('');
  const [veiculos, setVeiculos] = useState<any[]>([]);

  const [ordensAbertas, setOrdensAbertas] = useState<any[]>([]);
  const [osBusca, setOsBusca] = useState('');
  const [osDropdownOpen, setOsDropdownOpen] = useState(false);
  const osRef = useRef<HTMLDivElement>(null);

  const [solDropdownOpen, setSolDropdownOpen] = useState(false);
  const [solBusca, setSolBusca] = useState('');
  const solRef = useRef<HTMLDivElement>(null);

  const [projBusca, setProjBusca] = useState('');
  const [projDropdownOpen, setProjDropdownOpen] = useState(false);
  const [projResultados, setProjResultados] = useState<{ codigo: number; nome: string; empresa: string }[]>([]);
  const projRef = useRef<HTMLDivElement>(null);

  const [cliBusca, setCliBusca] = useState('');
  const [cliDropdownOpen, setCliDropdownOpen] = useState(false);
  const [cliResultados, setCliResultados] = useState<{ cnpj_cpf: string; nome_fantasia: string; razao_social: string; cidade: string }[]>([]);
  const cliRef = useRef<HTMLDivElement>(null);

  const [tagsDisponiveis, setTagsDisponiveis] = useState<{ id: number; nome: string; cor: string; grupo: string | null }[]>([]);
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);

  // Grupos (coletivos) abertos — pra já jogar a nova requisição num grupo
  const [gruposDisp, setGruposDisp] = useState<any[]>([]);
  const [gruposSel, setGruposSel] = useState<number[]>([]);
  const [gruposFormAberto, setGruposFormAberto] = useState(false);
  useEffect(() => {
    fetchAuth('/api/pos/requisicoes/grupos')
      .then(r => r.ok ? r.json() : [])
      .then(d => setGruposDisp((Array.isArray(d) ? d : []).filter((g: any) => g.status === 'aberto')))
      .catch(() => {});
  }, []);

  const [formData, setFormData] = useState({
    titulo: '', tipo: '', solicitante: '', setor: '',
    data: new Date().toISOString().split('T')[0],
    empresa: EMPRESAS.NOVA.nome, endereco_empr: EMPRESAS.NOVA.endereco, veiculo: '', hodometro: '',
    cliente: '', cliente_cnpj: '', ordem_servico: '', fornecedor: '', obs: '',
    valor_cobrado_cliente: '', quem_ferramenta: '', Chassis_Modelo: '', litros_combustivel: '', combustivel: '', status: 'pedido',
    projeto_codigo: '', projeto_nome: ''
  });

  // Rascunho: o que foi digitado sobrevive a recarga da página, troca de aba e
  // atualização do portal. A página apaga depois que a requisição é criada.
  const formInicial = useRef(formData);
  const dadosRascunho = { formData, tagsSelecionadas, gruposSel, osBusca, solBusca, projBusca, cliBusca };
  type DadosRascunho = typeof dadosRascunho;
  const aplicarRascunho = (d: DadosRascunho | null) => {
    setFormData(d ? { ...formInicial.current, ...d.formData } : formInicial.current);
    setTagsSelecionadas(d?.tagsSelecionadas || []); setGruposSel(d?.gruposSel || []);
    setOsBusca(d?.osBusca || ''); setSolBusca(d?.solBusca || ''); setProjBusca(d?.projBusca || ''); setCliBusca(d?.cliBusca || '');
  };
  const rascunho = useRascunho<DadosRascunho>(chaveRascunho, dadosRascunho, {
    vazio: (d) => {
      const ignorar = new Set(['data', 'empresa', 'endereco_empr', 'status']);
      const mudou = Object.entries(d.formData || {}).some(([k, v]) => !ignorar.has(k) && String(v ?? '') !== String((formInicial.current as Record<string, unknown>)[k] ?? ''));
      return !mudou && !(d.tagsSelecionadas || []).length && !(d.gruposSel || []).length;
    },
    restaurar: aplicarRascunho,
  });

  // Trator/Quadri rodam a diesel — sugere sozinho (editável no select).
  useEffect(() => {
    if (['Trator Abastecimento', 'Quadri Abastecimento'].includes(formData.tipo) && !formData.combustivel) {
      setFormData(p => ({ ...p, combustivel: 'Diesel' }));
    }
  }, [formData.tipo, formData.combustivel]);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: users }, { data: veic }, { data: ordens }] = await Promise.all([
        supabase.from('financeiro_usu').select('id, nome, funcao, avatar_url').eq('ativo', true).order('nome'),
        // Fase 5: o cadastro de veículos é do FROTA. O value do select continua
        // sendo o IdPlaca da SupaPlacas (via supa_placa_id, mantido pelo Frota)
        // — requisições antigas e o lançamento no Omie não mudam nada.
        supabase
          .from('frota_veiculos')
          .select('placa, modelo, supa_placa_id')
          .eq('tipo_registro', 'veiculo')
          .eq('ativo', true)
          .not('supa_placa_id', 'is', null)
          .order('placa'),
        supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Status, Projeto').not('Status', 'in', '("Concluída","Cancelada")').order('Id_Ordem', { ascending: false }),
      ]);
      if (users) setUsuarios(users);
      if (veic) {
        setVeiculos(veic.map((v: any) => ({
          IdPlaca: v.supa_placa_id,
          NumPlaca: `${formatarPlaca(v.placa)}${v.modelo ? ` · ${v.modelo}` : ''}`,
        })));
      }
      const { data: tags } = await supabase.from('requisicao_tags').select('*').order('nome');
      if (tags) setTagsDisponiveis(tags);
      if (ordens) setOrdensAbertas(ordens);
    };
    fetchData();
  }, []);

  // Veio da criação da OS no POS (/requisicoes?aba=form&os=OS-0123): já abre
  // como Trator-Cliente com a OS, o cliente e o chassis dela. Uma vez só.
  const osAplicada = useRef(false);
  useEffect(() => {
    if (!osInicial || osAplicada.current || ordensAbertas.length === 0 || usuarios.length === 0) return;
    const o = ordensAbertas.find(x => String(x.Id_Ordem) === osInicial);
    if (!o) return;
    osAplicada.current = true;
    // solicitante = técnico principal (OS) casado com o usuário do portal, sem acento/caixa
    const sem = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const alvoSol = sem(solicitanteInicial || o.Os_Tecnico || '');
    const usuSol = alvoSol ? (usuarios.find(u => sem(u.nome) === alvoSol) || usuarios.find(u => sem(u.nome).startsWith(alvoSol) || alvoSol.startsWith(sem(u.nome)))) : null;
    setFormData(p => ({ ...p, setor: 'Trator-Cliente', ordem_servico: String(o.Id_Ordem), cliente: o.Os_Cliente || p.cliente, cliente_cnpj: o.Cnpj_Cliente || p.cliente_cnpj, solicitante: usuSol?.nome || p.solicitante, data: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10) }));
    puxarDadosOS(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osInicial, ordensAbertas, usuarios]);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (osRef.current && !osRef.current.contains(e.target as Node)) setOsDropdownOpen(false);
      if (solRef.current && !solRef.current.contains(e.target as Node)) setSolDropdownOpen(false);
      if (projRef.current && !projRef.current.contains(e.target as Node)) setProjDropdownOpen(false);
      if (cliRef.current && !cliRef.current.contains(e.target as Node)) setCliDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca debounced de projetos
  useEffect(() => {
    if (projBusca.trim().length < 2) { setProjResultados([]); return; }
    const timer = setTimeout(async () => {
      const termo = projBusca.trim();
      const { data } = await supabase
        .from('portal_nt_projetos_PRINCIPAL')
        .select('codigo, nome, empresa')
        .ilike('nome', `%${termo}%`)
        .limit(15);
      setProjResultados(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [projBusca]);

  useEffect(() => {
    if (cliBusca.trim().length < 2) { setCliResultados([]); return; }
    const timer = setTimeout(async () => {
      const termo = cliBusca.trim();
      const { data } = await supabase
        .from('portal_nt_clientes_PRINCIPAL')
        .select('cnpj_cpf, nome_fantasia, razao_social, cidade')
        .or(`nome_fantasia.ilike.%${termo}%,razao_social.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`)
        .limit(20);
      const seen = new Set<string>();
      setCliResultados((data || []).filter(c => {
        if (!c.cnpj_cpf || seen.has(c.cnpj_cpf)) return false;
        seen.add(c.cnpj_cpf);
        return true;
      }));
    }, 300);
    return () => clearTimeout(timer);
  }, [cliBusca]);

  // Empresa já inicializada no estado — sem useEffect loop

  // Escolheu a O.S. → puxa da ordem o CHASSIS e o HORÍMETRO que o técnico já
  // registrou (Ordem_Servico_Tecnicos; fallback do chassis: campo Projeto da OS).
  const puxarDadosOS = async (o: any) => {
    try {
      const { data } = await supabase
        .from('Ordem_Servico_Tecnicos')
        .select('IdOs, Status, Chassis, Horimetro')
        .eq('Ordem_Servico', o.Id_Ordem);
      const lista = [...(data || [])].sort((a: any, b: any) => Number(b.IdOs || 0) - Number(a.IdOs || 0));
      const tec = lista.find((t: any) => String(t.Status || '').toLowerCase() === 'enviado') || lista[0] || null;
      const chassis = String(tec?.Chassis || o.Projeto || '').toUpperCase().trim();
      const horimetro = String(tec?.Horimetro || '').trim();
      setFormData(p => ({
        ...p,
        Chassis_Modelo: chassis || p.Chassis_Modelo,
        hodometro: horimetro ? formatarHodometro(horimetro) : p.hodometro,
      }));
    } catch { /* sem dados do técnico — segue manual */ }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Veicular Manutenção: placa + HODÔMETRO são obrigatórios — a requisição
    // abre sozinha uma PENDÊNCIA na Frota pro mesmo carro (com o km), que
    // fecha quando a requisição chegar ao financeiro.
    if (formData.tipo === 'Veicular Manutenção') {
      if (!String(formData.veiculo || '').trim()) {
        alert('Selecione a PLACA do veículo — requisição de Veicular Manutenção abre uma pendência na Frota pro carro.');
        return;
      }
      if (!String(formData.hodometro || '').trim()) {
        alert('Informe o HODÔMETRO atual do veículo — obrigatório pra abrir requisição de Veicular Manutenção.');
        return;
      }
    }
    // Parecida aberta nos últimos 15 dias: confirma antes de criar outra
    const iguais = parecidas(historico, { tipo: formData.tipo, veiculo: formData.veiculo, titulo: formData.titulo }, new Date());
    if (iguais.length && !confirm(`Já existe requisição parecida (#${iguais.map(r => r.id).join(', #')}). Criar mesmo assim?`)) return;
    // Remove campos vazios para evitar erro se coluna não existir no banco
    const dados: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(formData)) {
      if (val !== '' && val !== null && val !== undefined) {
        dados[key] = val;
      }
    }
    if (valorNovo.trim()) dados.valor_despeza = valorNovo.trim();
    if (tagsSelecionadas.length > 0) dados.tags = tagsSelecionadas;
    if (gruposSel.length > 0) dados._grupos = gruposSel; // vínculo com grupos (a página processa e remove antes do insert)
    onSave(dados);
  };

  // Visual novo (docs/estilo-pos-newportal.md): campos claros cantos 10, rótulo 13px sem caixa alta, sem negrito
  const inputStyle = "w-full px-4 py-3 rounded-[10px] border border-zinc-200 bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15 outline-none transition-all text-[15px] text-black placeholder:text-zinc-400";
  const labelStyle = "text-[13px] text-zinc-600 mb-1.5 block";
  const secao = "p-5 rounded-2xl border border-zinc-200 bg-white";
  const secaoTitulo = (icone: string, cor: string, texto: string) => (
    <p className="text-[15px] text-black mb-4 flex items-center gap-2.5" style={{ fontWeight: 500 }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, display: 'inline-grid', placeItems: 'center', fontSize: 13, color: cor, background: `color-mix(in srgb, ${cor} 9%, #fefefe)`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)` }}>
        <i className={`fa-solid ${icone}`} />
      </span>
      {texto}
    </p>
  );

  return (
    <div className="max-w-4xl mx-auto">
      {/* Fundo alterado para escuro para suportar as letras brancas pedidas */}
      <div className="bg-white rounded-2xl p-6 md:p-9 text-black">
        <AvisoRascunho em={rascunho.recuperadoEm} onFechar={rascunho.esconderAviso} onDescartar={() => { rascunho.limpar(); aplicarRascunho(null); }} />
        <div className="mb-7 flex items-center gap-3">
          <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 17, color: '#EA580C', background: 'color-mix(in srgb, #EA580C 9%, #fefefe)', border: '1px solid color-mix(in srgb, #EA580C 18%, transparent)' }}>
            <i className="fa-solid fa-file-circle-plus" />
          </span>
          <div>
            <h2 className="text-[22px] text-black" style={{ fontWeight: 500, letterSpacing: '-.01em' }}>Nova requisição</h2>
            <p className="text-[13.5px] text-zinc-500 mt-0.5">O que precisa, para quê e para quem. Fornecedor e valor podem ficar para depois.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className={labelStyle}>Título do pedido</label>
              <input required placeholder="Ex.: compra de peças para trator" spellCheck lang="pt-BR" onChange={e => setFormData({...formData, titulo: e.target.value.toUpperCase()})} className={inputStyle} />
            </div>
            <div>
              <label className={labelStyle}>Data</label>
              <input type="date" value={formData.data} onChange={e => setFormData({...formData, data: e.target.value})} className={inputStyle} />
            </div>
          </div>

          {/* Tags agrupadas */}
          {tagsDisponiveis.length > 0 && (() => {
            const GRUPOS_INFO: Record<string, { label: string; icon: string }> = {
              categoria: { label: 'Categoria de Peça', icon: '🔩' },
              sistema: { label: 'Sistema', icon: '⚙️' },
              geral: { label: 'Geral', icon: '📋' },
            };
            const grupos = ['categoria', 'sistema', 'geral'];
            const tagsPorGrupo = grupos.map(g => ({
              key: g,
              ...GRUPOS_INFO[g],
              tags: tagsDisponiveis.filter(t => (t.grupo || 'geral') === g),
            })).filter(g => g.tags.length > 0);

            return (
              <div className="space-y-4">
                {tagsPorGrupo.map(grupo => (
                  <div key={grupo.key}>
                    <label className={labelStyle}>{grupo.icon} {grupo.label}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {grupo.tags.map(tag => {
                        const selected = tagsSelecionadas.includes(tag.nome);
                        return (
                          <button key={tag.id} type="button"
                            onClick={() => setTagsSelecionadas(prev => selected ? prev.filter(t => t !== tag.nome) : [...prev, tag.nome])}
                            style={{
                              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              border: selected ? `2px solid ${tag.cor}` : '2px solid #E2E8F0',
                              background: selected ? tag.cor : '#fff',
                              color: selected ? '#fff' : '#64748B',
                              transition: 'all .15s',
                              boxShadow: selected ? `0 2px 8px ${tag.cor}40` : 'none',
                            }}>
                            {tag.nome}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className={labelStyle}>Tipo</label>
              <select required onChange={e => setFormData({...formData, tipo: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Selecione...</option>
                {["Peças", "Alimentação", "Serviço de Terceiros", "Almoxarifado", "Ferramenta", "Insumo Infra", "Veicular Abastecimento", "Veicular Manutenção", "Trator Abastecimento", "Quadri Abastecimento", "Hospedagem"].map(t => <option key={t} value={t} className="bg-white">{t}</option>)}
              </select>
            </div>
            <div ref={solRef} className="relative">
              <label className={labelStyle}>Solicitante</label>
              <div
                className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                onClick={() => setSolDropdownOpen(!solDropdownOpen)}
              >
                <span className={formData.solicitante ? 'text-black' : 'text-black'}>
                  {formData.solicitante
                    ? `${formData.solicitante}${(() => { const u = usuarios.find(u => u.nome === formData.solicitante); return u?.funcao ? ` — ${u.funcao}` : ''; })()}`
                    : 'Quem pede?'}
                </span>
                <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {solDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                  <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                    <input
                      autoFocus
                      placeholder="Buscar por nome ou função..."
                      value={solBusca}
                      onChange={e => setSolBusca(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                    />
                  </div>
                  {usuarios
                    .filter(u => {
                      if (!solBusca.trim()) return true;
                      const q = solBusca.toLowerCase();
                      return (u.nome || '').toLowerCase().includes(q) || (u.funcao || '').toLowerCase().includes(q);
                    })
                    .map(u => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => {
                          setFormData(p => ({ ...p, solicitante: u.nome }));
                          setSolDropdownOpen(false);
                          setSolBusca('');
                        }}
                        className={`w-full px-4 py-2.5 text-left hover:bg-zinc-50 border-b border-zinc-50 flex items-center gap-3 ${formData.solicitante === u.nome ? 'bg-orange-50' : ''}`}
                      >
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-zinc-200" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold text-sm flex items-center justify-center shrink-0">{(u.nome || '?').charAt(0).toUpperCase()}</span>
                        )}
                        <span className="min-w-0 truncate">
                          <span className="font-bold text-sm text-black">{u.nome}</span>
                          {u.funcao && <span className="text-xs text-black ml-2">— {u.funcao}</span>}
                        </span>
                      </button>
                    ))
                  }
                  {usuarios.filter(u => {
                    if (!solBusca.trim()) return true;
                    const q = solBusca.toLowerCase();
                    return (u.nome || '').toLowerCase().includes(q) || (u.funcao || '').toLowerCase().includes(q);
                  }).length === 0 && (
                    <p className="px-4 py-3 text-sm text-black text-center">Nenhum usuário encontrado</p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={labelStyle}>Setor destino</label>
              <select required onChange={e => setFormData({...formData, setor: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Selecione...</option>
                {["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"].map(s => <option key={s} value={s} className="bg-white">{s}</option>)}
              </select>
            </div>
          </div>

          {/* Histórico: fornecedor/valor de costume e aviso de parecida */}
          <SugestaoHistorico
            historico={historico}
            tipo={formData.tipo}
            veiculo={formData.veiculo}
            titulo={formData.titulo}
            fornecedor={formData.fornecedor}
            valor={valorNovo}
            onFornecedor={(v) => setFormData(p => ({ ...p, fornecedor: v }))}
            onValor={setValorNovo}
          />

          {/* NOVO CAMPO: QUEM FERRAMENTA (Aparece apenas se tipo for Ferramenta) */}
          {formData.tipo === 'Ferramenta' && (
            <div className={secao}>
              {secaoTitulo('fa-screwdriver-wrench', '#0891B2', 'Ferramenta')}
              <label className={labelStyle}>Para quem é</label>
              <select 
                required 
                value={formData.quem_ferramenta}
                onChange={e => setFormData({...formData, quem_ferramenta: e.target.value})} 
                className={`${inputStyle}`}
              >
                <option value="" className="bg-white">Selecione o uso...</option>
                <option value="Uso Pessoal" className="bg-white">Uso Pessoal (Individual)</option>
                <option value="Geral" className="bg-white">Uso Geral (Oficina/Setor)</option>
              </select>
            </div>
          )}

          {/* VEICULAR: placa + km */}
          {['Veicular Abastecimento', 'Veicular Manutenção'].includes(formData.tipo) && (
            <div className={secao}>
              {secaoTitulo('fa-car', '#2563EB', 'Veículo')}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyle}>Placa</label>
                  <select required value={formData.veiculo} onChange={e => setFormData({...formData, veiculo: e.target.value})} className={`${inputStyle}`}>
                    <option value="" className="bg-white">Selecione o veículo...</option>
                    {veiculos.map(v => <option key={v.IdPlaca} value={v.IdPlaca} className="bg-white">{v.NumPlaca}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Hodômetro / horímetro</label>
                  <input placeholder="Ex: 12.500 km" inputMode="numeric" value={formData.hodometro} onChange={e => setFormData({...formData, hodometro: e.target.value})} onBlur={e => setFormData({...formData, hodometro: formatarHodometro(e.target.value)})} className={`${inputStyle}`} />
                </div>
              </div>
            </div>
          )}

          {/* ABASTECIMENTO: litros de combustível */}
          {['Veicular Abastecimento', 'Trator Abastecimento', 'Quadri Abastecimento'].includes(formData.tipo) && (
            <div className={secao}>
              {secaoTitulo('fa-gas-pump', '#D97706', 'Abastecimento')}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!['Trator Abastecimento', 'Quadri Abastecimento'].includes(formData.tipo) ? null : (
                  <>
                    <div ref={!['Trator-Loja', 'Trator-Cliente'].includes(formData.setor) ? projRef : undefined} className="relative">
                      <label className={labelStyle}>Trator (projeto ou chassis)</label>
                      <div
                        className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                        onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                      >
                        <span className={formData.projeto_nome ? 'text-black' : 'text-black'}>
                          {formData.projeto_nome || formData.Chassis_Modelo || 'Buscar projeto ou digitar o chassis...'}
                        </span>
                        <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {projDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                          <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                            <input
                              autoFocus
                              placeholder="Buscar por nome, chassis, modelo..."
                              value={projBusca}
                              onChange={e => setProjBusca(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-amber-400"
                            />
                          </div>
                          {(formData.projeto_codigo || formData.Chassis_Modelo) && (
                            <button type="button"
                              onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                              className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100">
                              ✕ Remover seleção
                            </button>
                          )}
                          {projResultados.map(p => (
                            <button type="button" key={`${p.codigo}-${p.empresa}`}
                              onClick={() => {
                                setFormData(prev => ({...prev, projeto_codigo: String(p.codigo), projeto_nome: p.nome, Chassis_Modelo: p.nome}));
                                setProjDropdownOpen(false); setProjBusca('');
                              }}
                              className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.projeto_codigo === String(p.codigo) ? 'bg-amber-50' : ''}`}>
                              <span className="font-bold text-sm text-black">{p.nome}</span>
                              <span className="text-xs text-black ml-2">{p.empresa}</span>
                            </button>
                          ))}
                          {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                            <p className="px-4 py-3 text-sm text-black text-center">Nenhum projeto encontrado</p>
                          )}
                          {projBusca.trim().length < 2 && (
                            <p className="px-4 py-3 text-sm text-black text-center">Digite pelo menos 2 caracteres</p>
                          )}
                          {projBusca.trim().length >= 2 && (
                            <button type="button"
                              onClick={() => { setFormData(prev => ({...prev, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: projBusca.trim().toUpperCase()})); setProjDropdownOpen(false); setProjBusca(''); }}
                              className="w-full px-4 py-3 text-left text-sm text-black hover:bg-zinc-50 border-t border-zinc-100">
                              Usar “{projBusca.trim().toUpperCase()}” como chassis / modelo
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
                <div>
                  <label className={labelStyle}>Litros</label>
                  <input required placeholder="Ex: 150,00" inputMode="decimal" value={formData.litros_combustivel} onChange={e => setFormData({...formData, litros_combustivel: e.target.value})} onBlur={e => setFormData({...formData, litros_combustivel: formatarLitros(e.target.value)})} className={`${inputStyle}`} />
                </div>
                <div>
                  <label className={labelStyle}>Combustível</label>
                  <select required value={formData.combustivel} onChange={e => setFormData({...formData, combustivel: e.target.value})} className={`${inputStyle}`}>
                    <option value="" className="bg-white">Selecione...</option>
                    {['Gasolina Comum', 'Gasolina Aditivada', 'Etanol', 'Diesel', 'Diesel S10', 'Arla 32'].map(c => <option key={c} value={c} className="bg-white">{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TRATOR-LOJA (por setor) */}
          {formData.setor === 'Trator-Loja' && (
            <div className={secao}>
              {secaoTitulo('fa-tractor', '#EA580C', 'Trator da loja')}
              {/* O.S. PRIMEIRO: escolher a ordem já puxa o chassis/modelo e o horímetro registrados nela */}
              <div ref={osRef} className="relative">
                <label className={labelStyle}>Ordem de serviço</label>
                <div
                  className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                  onClick={() => setOsDropdownOpen(!osDropdownOpen)}
                >
                  <span className="text-black">
                    {formData.ordem_servico
                      ? `OS ${formData.ordem_servico} - ${ordensAbertas.find(o => String(o.Id_Ordem) === formData.ordem_servico)?.Os_Cliente || ''}`
                      : 'Selecione a O.S. (puxa chassis e horímetro)...'}
                  </span>
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {osDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                    <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                      <input
                        autoFocus
                        placeholder="Buscar por OS, cliente ou técnico..."
                        value={osBusca}
                        onChange={e => setOsBusca(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                      />
                    </div>
                    {formData.ordem_servico && (
                      <button
                        type="button"
                        onClick={() => { setFormData(p => ({...p, ordem_servico: ''})); setOsDropdownOpen(false); setOsBusca(''); }}
                        className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100"
                      >
                        ✕ Remover seleção
                      </button>
                    )}
                    {ordensAbertas
                      .filter(o => {
                        if (!osBusca.trim()) return true;
                        const q = osBusca.toLowerCase();
                        return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                      })
                      .map(o => (
                        <button
                          type="button"
                          key={o.Id_Ordem}
                          onClick={() => {
                            setFormData(p => ({...p, ordem_servico: String(o.Id_Ordem)}));
                            puxarDadosOS(o);
                            setOsDropdownOpen(false);
                            setOsBusca('');
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.ordem_servico === String(o.Id_Ordem) ? 'bg-orange-50' : ''}`}
                        >
                          <span className="font-bold text-sm text-black">OS {o.Id_Ordem}</span>
                          <span className="text-xs text-black ml-2">{o.Os_Cliente}</span>
                          <span className="text-xs text-black ml-2">({o.Os_Tecnico})</span>
                          <span className="text-[10px] text-black ml-2 uppercase">{o.Status}</span>
                        </button>
                      ))
                    }
                    {ordensAbertas.filter(o => {
                      if (!osBusca.trim()) return true;
                      const q = osBusca.toLowerCase();
                      return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="px-4 py-3 text-sm text-black text-center">Nenhuma O.S. encontrada</p>
                    )}
                  </div>
                )}
              </div>
              <div ref={projRef} className="relative mt-3">
                <label className={labelStyle}>Trator (projeto ou chassis)</label>
                <div
                  className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                  onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                >
                  <span className={formData.projeto_nome ? 'text-black' : 'text-black'}>
                    {formData.projeto_nome || formData.Chassis_Modelo || 'Buscar projeto ou digitar o chassis...'}
                  </span>
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {projDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                    <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                      <input
                        autoFocus
                        placeholder="Buscar por nome, chassis, modelo..."
                        value={projBusca}
                        onChange={e => setProjBusca(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                      />
                    </div>
                    {(formData.projeto_codigo || formData.Chassis_Modelo) && (
                      <button type="button"
                        onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                        className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100">
                        ✕ Remover seleção
                      </button>
                    )}
                    {projResultados.map(p => (
                      <button type="button" key={`${p.codigo}-${p.empresa}`}
                        onClick={() => {
                          setFormData(prev => ({...prev, projeto_codigo: String(p.codigo), projeto_nome: p.nome, Chassis_Modelo: p.nome}));
                          setProjDropdownOpen(false); setProjBusca('');
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.projeto_codigo === String(p.codigo) ? 'bg-orange-50' : ''}`}>
                        <span className="font-bold text-sm text-black">{p.nome}</span>
                        <span className="text-xs text-black ml-2">{p.empresa}</span>
                      </button>
                    ))}
                    {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                      <p className="px-4 py-3 text-sm text-black text-center">Nenhum projeto encontrado</p>
                    )}
                    {projBusca.trim().length < 2 && (
                      <p className="px-4 py-3 text-sm text-black text-center">Digite pelo menos 2 caracteres</p>
                    )}
                    {projBusca.trim().length >= 2 && (
                      <button type="button"
                        onClick={() => { setFormData(prev => ({...prev, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: projBusca.trim().toUpperCase()})); setProjDropdownOpen(false); setProjBusca(''); }}
                        className="w-full px-4 py-3 text-left text-sm text-black hover:bg-zinc-50 border-t border-zinc-100">
                        Usar “{projBusca.trim().toUpperCase()}” como chassis / modelo
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <label className={labelStyle}>Hodômetro / horímetro</label>
                <input placeholder="Ex: 12.500 km / 3.400 h" inputMode="numeric" value={formData.hodometro} onChange={e => setFormData({...formData, hodometro: e.target.value})} onBlur={e => setFormData({...formData, hodometro: formatarHodometro(e.target.value)})} className={inputStyle} />
              </div>
            </div>
          )}

          {/* TRATOR-CLIENTE (por setor) */}
          {formData.setor === 'Trator-Cliente' && (
            <div className={secao}>
              {secaoTitulo('fa-user-tie', '#7C3AED', 'Trator do cliente')}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div ref={cliRef} className="relative">
                  <label className={labelStyle}>Cliente</label>
                  <div
                    className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                    onClick={() => setCliDropdownOpen(!cliDropdownOpen)}
                  >
                    <span className={formData.cliente ? 'text-black' : 'text-black'}>
                      {formData.cliente
                        ? `${formData.cliente}${formData.cliente_cnpj ? ` — ${formData.cliente_cnpj}` : ''}`
                        : 'Buscar cliente por nome ou CNPJ...'}
                    </span>
                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {cliDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                        <input
                          autoFocus
                          placeholder="Nome fantasia, razão social ou CNPJ/CPF..."
                          value={cliBusca}
                          onChange={e => setCliBusca(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                      {formData.cliente_cnpj && (
                        <button type="button"
                          onClick={() => { setFormData(p => ({...p, cliente: '', cliente_cnpj: ''})); setCliDropdownOpen(false); setCliBusca(''); }}
                          className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100">
                          ✕ Remover seleção
                        </button>
                      )}
                      {cliResultados.map(c => (
                        <button type="button" key={c.cnpj_cpf}
                          onClick={() => {
                            setFormData(prev => ({...prev, cliente: c.nome_fantasia || c.razao_social, cliente_cnpj: c.cnpj_cpf}));
                            setCliDropdownOpen(false); setCliBusca('');
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.cliente_cnpj === c.cnpj_cpf ? 'bg-orange-50' : ''}`}>
                          <span className="font-bold text-sm text-black">{c.nome_fantasia || c.razao_social}</span>
                          <span className="text-xs text-black ml-2">{c.cnpj_cpf}</span>
                          {c.cidade && <span className="text-xs text-black ml-2">({c.cidade})</span>}
                        </button>
                      ))}
                      {cliBusca.trim().length >= 2 && cliResultados.length === 0 && (
                        <p className="px-4 py-3 text-sm text-black text-center">Nenhum cliente encontrado</p>
                      )}
                      {cliBusca.trim().length < 2 && (
                        <p className="px-4 py-3 text-sm text-black text-center">Digite pelo menos 2 caracteres</p>
                      )}
                    </div>
                  )}
                </div>
                <div ref={osRef} className="relative">
                  <label className={labelStyle}>O.S.</label>
                  <div
                    className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                    onClick={() => setOsDropdownOpen(!osDropdownOpen)}
                  >
                    <span className={formData.ordem_servico ? 'text-black' : 'text-black'}>
                      {formData.ordem_servico
                        ? `OS ${formData.ordem_servico} - ${ordensAbertas.find(o => String(o.Id_Ordem) === formData.ordem_servico)?.Os_Cliente || ''}`
                        : 'Selecione a O.S...'}
                    </span>
                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {osDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                        <input
                          autoFocus
                          placeholder="Buscar por OS, cliente ou técnico..."
                          value={osBusca}
                          onChange={e => setOsBusca(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                      {formData.ordem_servico && (
                        <button
                          type="button"
                          onClick={() => { setFormData(p => ({...p, ordem_servico: ''})); setOsDropdownOpen(false); setOsBusca(''); }}
                          className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100"
                        >
                          ✕ Remover seleção
                        </button>
                      )}
                      {ordensAbertas
                        .filter(o => {
                          if (!osBusca.trim()) return true;
                          const q = osBusca.toLowerCase();
                          return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                        })
                        .map(o => (
                          <button
                            type="button"
                            key={o.Id_Ordem}
                            onClick={() => {
                              setFormData(p => ({...p, ordem_servico: String(o.Id_Ordem), cliente: o.Os_Cliente || p.cliente, cliente_cnpj: o.Cnpj_Cliente || p.cliente_cnpj}));
                              puxarDadosOS(o); // chassis + horímetro registrados na OS
                              setOsDropdownOpen(false);
                              setOsBusca('');
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.ordem_servico === String(o.Id_Ordem) ? 'bg-orange-50' : ''}`}
                          >
                            <span className="font-bold text-sm text-black">OS {o.Id_Ordem}</span>
                            <span className="text-xs text-black ml-2">{o.Os_Cliente}</span>
                            <span className="text-xs text-black ml-2">({o.Os_Tecnico})</span>
                            <span className="text-[10px] text-black ml-2 uppercase">{o.Status}</span>
                          </button>
                        ))
                      }
                      {ordensAbertas.filter(o => {
                        if (!osBusca.trim()) return true;
                        const q = osBusca.toLowerCase();
                        return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                      }).length === 0 && (
                        <p className="px-4 py-3 text-sm text-black text-center">Nenhuma O.S. encontrada</p>
                      )}
                    </div>
                  )}
                </div>
                <div ref={!['Trator-Loja'].includes(formData.setor) ? projRef : undefined} className="relative">
                  <label className={labelStyle}>Trator (projeto ou chassis)</label>
                  <div
                    className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                    onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                  >
                    <span className={formData.projeto_nome ? 'text-black' : 'text-black'}>
                      {formData.projeto_nome || formData.Chassis_Modelo || 'Buscar projeto ou digitar o chassis...'}
                    </span>
                    <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {projDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                        <input
                          autoFocus
                          placeholder="Buscar por nome, chassis, modelo..."
                          value={projBusca}
                          onChange={e => setProjBusca(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-orange-400"
                        />
                      </div>
                      {(formData.projeto_codigo || formData.Chassis_Modelo) && (
                        <button type="button"
                          onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                          className="w-full px-4 py-2 text-left text-sm text-orange-500 hover:bg-orange-50 border-b border-zinc-100">
                          ✕ Remover seleção
                        </button>
                      )}
                      {projResultados.map(p => (
                        <button type="button" key={`${p.codigo}-${p.empresa}`}
                          onClick={() => {
                            setFormData(prev => ({...prev, projeto_codigo: String(p.codigo), projeto_nome: p.nome, Chassis_Modelo: p.nome}));
                            setProjDropdownOpen(false); setProjBusca('');
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.projeto_codigo === String(p.codigo) ? 'bg-orange-50' : ''}`}>
                          <span className="font-bold text-sm text-black">{p.nome}</span>
                          <span className="text-xs text-black ml-2">{p.empresa}</span>
                        </button>
                      ))}
                      {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                        <p className="px-4 py-3 text-sm text-black text-center">Nenhum projeto encontrado</p>
                      )}
                      {projBusca.trim().length < 2 && (
                        <p className="px-4 py-3 text-sm text-black text-center">Digite pelo menos 2 caracteres</p>
                      )}
                      {projBusca.trim().length >= 2 && (
                        <button type="button"
                          onClick={() => { setFormData(prev => ({...prev, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: projBusca.trim().toUpperCase()})); setProjDropdownOpen(false); setProjBusca(''); }}
                          className="w-full px-4 py-3 text-left text-sm text-black hover:bg-zinc-50 border-t border-zinc-100">
                          Usar “{projBusca.trim().toUpperCase()}” como chassis / modelo
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelStyle}>Valor cobrado do cliente</label>
                  <input placeholder="0,00" onChange={e => setFormData({...formData, valor_cobrado_cliente: e.target.value})} className={inputStyle} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className={labelStyle}>Observações</label>
            <textarea rows={4} spellCheck lang="pt-BR" onChange={e => setFormData({...formData, obs: e.target.value})} className={`${inputStyle} resize-none`} placeholder="Descreva os itens ou serviços necessários..." />
          </div>

          {/* Grupos (coletivos) — opcional, em dropdown pra não poluir o form */}
          {gruposDisp.length > 0 && (
            <div>
              <label className={labelStyle}>Adicionar a grupo(s) <span className="text-zinc-400">(opcional)</span></label>
              <div className="relative">
                <button type="button" onClick={() => setGruposFormAberto(o => !o)}
                  className={`${inputStyle} flex items-center gap-2 text-left`}>
                  <FolderOpen size={18} className="text-black shrink-0" />
                  <span className={`flex-1 truncate ${gruposSel.length ? 'text-black' : 'text-black'}`}>
                    {gruposSel.length === 0 ? 'Nenhum grupo'
                      : gruposSel.length === 1 ? gruposDisp.find((g: any) => g.id === gruposSel[0])?.nome
                      : `${gruposSel.length} grupos selecionados`}
                  </span>
                  <ChevronDown size={20} className={`text-black transition-transform ${gruposFormAberto ? 'rotate-180' : ''}`} />
                </button>
                {gruposFormAberto && (
                  <div className="mt-2 w-full bg-white border border-zinc-200 rounded-xl max-h-64 overflow-y-auto p-1.5">
                    {gruposDisp.map((g: any) => {
                      const sel = gruposSel.includes(g.id);
                      return (
                        <button type="button" key={g.id}
                          onClick={() => setGruposSel(prev => sel ? prev.filter(x => x !== g.id) : [...prev, g.id])}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left text-base transition-all ${sel ? 'bg-orange-50 text-orange-700' : 'text-black hover:bg-zinc-50'}`}>
                          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-orange-600 border-orange-600' : 'border-zinc-300'}`}>
                            {sel && <Check size={14} className="text-white" />}
                          </span>
                          {g.nome}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <button type="submit" className="w-full bg-orange-600 text-white py-4 rounded-xl hover:bg-orange-700 transition-all text-[15px] flex items-center justify-center gap-2" style={{ fontWeight: 500 }}>
            <i className="fa-solid fa-paper-plane" /> Criar requisição
          </button>
        </form>
      </div>
    </div>
  );
}