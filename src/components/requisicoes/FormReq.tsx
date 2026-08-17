'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarPlaca } from '@/lib/frota/placa';
import { formatarLitros, formatarHodometro } from '@/lib/requisicoes/campos';
import { FolderOpen, ChevronDown, Check } from 'lucide-react';

const EMPRESAS = {
  NOVA: { nome: "NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA", endereco: "AVENIDA SÃO SEBASTIÃO, 1065 | Piraju - SP" },
  CASTRO: { nome: "CASTRO MÁQUINAS E PEÇAS AGRÍCOLAS LTDA", endereco: "RUA DOUTOR FARTURA, 140 | FARTURA - SP" }
};

export default function FormReq({ onSave }: { onSave: (data: any) => void }) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
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
    fetch('/api/pos/requisicoes/grupos')
      .then(r => r.ok ? r.json() : [])
      .then(d => setGruposDisp((Array.isArray(d) ? d : []).filter((g: any) => g.status === 'aberto')))
      .catch(() => {});
  }, []);

  const [formData, setFormData] = useState({
    titulo: '', tipo: '', solicitante: '', setor: '',
    data: new Date().toISOString().split('T')[0],
    empresa: EMPRESAS.NOVA.nome, endereco_empr: EMPRESAS.NOVA.endereco, veiculo: '', hodometro: '',
    cliente: '', cliente_cnpj: '', ordem_servico: '', fornecedor: '', obs: '',
    valor_cobrado_cliente: '', quem_ferramenta: '', Chassis_Modelo: '', litros_combustivel: '', status: 'pedido',
    projeto_codigo: '', projeto_nome: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: users }, { data: veic }, { data: ordens }] = await Promise.all([
        supabase.from('financeiro_usu').select('id, nome, funcao').eq('ativo', true).order('nome'),
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
        supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Os_Tecnico, Status').not('Status', 'in', '("Concluída","Cancelada")').order('Id_Ordem', { ascending: false }),
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Remove campos vazios para evitar erro se coluna não existir no banco
    const dados: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(formData)) {
      if (val !== '' && val !== null && val !== undefined) {
        dados[key] = val;
      }
    }
    if (tagsSelecionadas.length > 0) dados.tags = tagsSelecionadas;
    if (gruposSel.length > 0) dados._grupos = gruposSel; // vínculo com grupos (a página processa e remove antes do insert)
    onSave(dados);
  };

  // Estilos atualizados: letras maiores e brancas
  const inputStyle = "w-full px-5 py-4 rounded-xl border border-zinc-200 bg-zinc-50 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 outline-none transition-all text-lg font-medium text-zinc-900 placeholder:text-zinc-400";
  const labelStyle = "text-sm font-bold text-zinc-900 uppercase tracking-[0.2em] mb-2 block ml-1";

  return (
    <div className="max-w-4xl mx-auto">
      {/* Fundo alterado para escuro para suportar as letras brancas pedidas */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-lg p-8 md:p-12 text-zinc-900">
        <div className="mb-10">
          <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-900">Nova Requisição</h2>
          <p className="text-base text-zinc-500 mt-2">Preencha os dados técnicos abaixo para iniciar o processo.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className={labelStyle}>Título do Pedido</label>
              <input required placeholder="EX: COMPRA DE PEÇAS PARA TRATOR" spellCheck lang="pt-BR" onChange={e => setFormData({...formData, titulo: e.target.value.toUpperCase()})} className={inputStyle} />
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
                <span className={formData.solicitante ? 'text-zinc-900' : 'text-zinc-400'}>
                  {formData.solicitante
                    ? `${formData.solicitante}${(() => { const u = usuarios.find(u => u.nome === formData.solicitante); return u?.funcao ? ` — ${u.funcao}` : ''; })()}`
                    : 'Quem pede?'}
                </span>
                <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {solDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                  <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                    <input
                      autoFocus
                      placeholder="Buscar por nome ou função..."
                      value={solBusca}
                      onChange={e => setSolBusca(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-red-400"
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
                        className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.solicitante === u.nome ? 'bg-red-50' : ''}`}
                      >
                        <span className="font-bold text-sm text-zinc-800">{u.nome}</span>
                        {u.funcao && <span className="text-xs text-zinc-500 ml-2">— {u.funcao}</span>}
                      </button>
                    ))
                  }
                  {usuarios.filter(u => {
                    if (!solBusca.trim()) return true;
                    const q = solBusca.toLowerCase();
                    return (u.nome || '').toLowerCase().includes(q) || (u.funcao || '').toLowerCase().includes(q);
                  }).length === 0 && (
                    <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhum usuário encontrado</p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={labelStyle}>Setor Destino</label>
              <select required onChange={e => setFormData({...formData, setor: e.target.value})} className={inputStyle}>
                <option value="" className="bg-white">Selecione...</option>
                {["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"].map(s => <option key={s} value={s} className="bg-white">{s}</option>)}
              </select>
            </div>
          </div>

          {/* NOVO CAMPO: QUEM FERRAMENTA (Aparece apenas se tipo for Ferramenta) */}
          {formData.tipo === 'Ferramenta' && (
            <div className="p-8 bg-red-50 rounded-2xl border border-red-200">
              <label className={labelStyle}>Destinação da Ferramenta</label>
              <select 
                required 
                value={formData.quem_ferramenta}
                onChange={e => setFormData({...formData, quem_ferramenta: e.target.value})} 
                className={`${inputStyle} !border-red-300`}
              >
                <option value="" className="bg-white">Selecione o uso...</option>
                <option value="Uso Pessoal" className="bg-white">Uso Pessoal (Individual)</option>
                <option value="Geral" className="bg-white">Uso Geral (Oficina/Setor)</option>
              </select>
            </div>
          )}

          {/* VEICULAR: placa + km */}
          {['Veicular Abastecimento', 'Veicular Manutenção'].includes(formData.tipo) && (
            <div className="p-6 bg-red-50 rounded-2xl border border-red-200">
              <p className="text-xs font-black text-red-600 uppercase tracking-widest mb-4">Informacoes do Veiculo</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelStyle}>Veiculo / Placa</label>
                  <select required value={formData.veiculo} onChange={e => setFormData({...formData, veiculo: e.target.value})} className={`${inputStyle} !border-red-300`}>
                    <option value="" className="bg-white">Selecione o veiculo...</option>
                    {veiculos.map(v => <option key={v.IdPlaca} value={v.IdPlaca} className="bg-white">{v.NumPlaca}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelStyle}>Hodometro / Horimetro</label>
                  <input placeholder="Ex: 12.500 km" inputMode="numeric" value={formData.hodometro} onChange={e => setFormData({...formData, hodometro: e.target.value})} onBlur={e => setFormData({...formData, hodometro: formatarHodometro(e.target.value)})} className={`${inputStyle} !border-red-300`} />
                </div>
              </div>
            </div>
          )}

          {/* ABASTECIMENTO: litros de combustível */}
          {['Veicular Abastecimento', 'Trator Abastecimento', 'Quadri Abastecimento'].includes(formData.tipo) && (
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200">
              <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-4">Abastecimento</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!['Trator Abastecimento', 'Quadri Abastecimento'].includes(formData.tipo) ? null : (
                  <>
                    <div ref={!['Trator-Loja', 'Trator-Cliente'].includes(formData.setor) ? projRef : undefined} className="relative">
                      <label className={labelStyle}>Projeto / Chassis</label>
                      <div
                        className={`${inputStyle} !border-amber-300 cursor-pointer flex items-center justify-between`}
                        onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                      >
                        <span className={formData.projeto_nome ? 'text-zinc-900' : 'text-zinc-400'}>
                          {formData.projeto_nome || 'Buscar projeto ou chassis...'}
                        </span>
                        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                          {formData.projeto_codigo && (
                            <button type="button"
                              onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                              className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100">
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
                              <span className="font-bold text-sm text-zinc-800">{p.nome}</span>
                              <span className="text-xs text-zinc-400 ml-2">{p.empresa}</span>
                            </button>
                          ))}
                          {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                            <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhum projeto encontrado</p>
                          )}
                          {projBusca.trim().length < 2 && (
                            <p className="px-4 py-3 text-sm text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelStyle}>Chassis / Modelo</label>
                      <input placeholder={formData.projeto_nome ? 'Preenchido pelo projeto' : 'Ex: VALTRA BM110 - CHASSIS 123456'} value={formData.Chassis_Modelo} onChange={e => setFormData({...formData, Chassis_Modelo: e.target.value.toUpperCase()})} className={`${inputStyle} !border-amber-300`} />
                    </div>
                  </>
                )}
                <div>
                  <label className={labelStyle}>Litros de Combustível</label>
                  <input required placeholder="Ex: 150,00" inputMode="decimal" value={formData.litros_combustivel} onChange={e => setFormData({...formData, litros_combustivel: e.target.value})} onBlur={e => setFormData({...formData, litros_combustivel: formatarLitros(e.target.value)})} className={`${inputStyle} !border-amber-300`} />
                </div>
              </div>
            </div>
          )}

          {/* TRATOR-LOJA (por setor) */}
          {formData.setor === 'Trator-Loja' && (
            <div className="p-6 bg-zinc-100/30 rounded-2xl border border-zinc-300/50">
              <p className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">Informacoes do Trator (Loja)</p>
              <div ref={projRef} className="relative">
                <label className={labelStyle}>Projeto / Chassis</label>
                <div
                  className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                  onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                >
                  <span className={formData.projeto_nome ? 'text-zinc-900' : 'text-zinc-400'}>
                    {formData.projeto_nome || 'Buscar projeto ou chassis...'}
                  </span>
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {projDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                    <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                      <input
                        autoFocus
                        placeholder="Buscar por nome, chassis, modelo..."
                        value={projBusca}
                        onChange={e => setProjBusca(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-red-400"
                      />
                    </div>
                    {formData.projeto_codigo && (
                      <button type="button"
                        onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                        className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100">
                        ✕ Remover seleção
                      </button>
                    )}
                    {projResultados.map(p => (
                      <button type="button" key={`${p.codigo}-${p.empresa}`}
                        onClick={() => {
                          setFormData(prev => ({...prev, projeto_codigo: String(p.codigo), projeto_nome: p.nome, Chassis_Modelo: p.nome}));
                          setProjDropdownOpen(false); setProjBusca('');
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.projeto_codigo === String(p.codigo) ? 'bg-red-50' : ''}`}>
                        <span className="font-bold text-sm text-zinc-800">{p.nome}</span>
                        <span className="text-xs text-zinc-400 ml-2">{p.empresa}</span>
                      </button>
                    ))}
                    {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                      <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhum projeto encontrado</p>
                    )}
                    {projBusca.trim().length < 2 && (
                      <p className="px-4 py-3 text-sm text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                    )}
                  </div>
                )}
              </div>
              {formData.projeto_nome && (
                <div className="mt-3">
                  <label className={labelStyle}>Chassis / Modelo (manual)</label>
                  <input placeholder="Ajuste se necessário" value={formData.Chassis_Modelo} onChange={e => setFormData({...formData, Chassis_Modelo: e.target.value.toUpperCase()})} className={inputStyle} />
                </div>
              )}
              {!formData.projeto_nome && (
                <div className="mt-3">
                  <label className={labelStyle}>Chassis / Modelo do Trator</label>
                  <input placeholder="Ex: VALTRA BM110 - CHASSIS 123456" value={formData.Chassis_Modelo} onChange={e => setFormData({...formData, Chassis_Modelo: e.target.value.toUpperCase()})} className={inputStyle} />
                </div>
              )}
              <div className="mt-3">
                <label className={labelStyle}>Hodometro / Horimetro</label>
                <input placeholder="Ex: 12.500 km / 3.400 h" inputMode="numeric" value={formData.hodometro} onChange={e => setFormData({...formData, hodometro: e.target.value})} onBlur={e => setFormData({...formData, hodometro: formatarHodometro(e.target.value)})} className={inputStyle} />
              </div>
              <div ref={osRef} className="relative mt-3">
                <label className={labelStyle}>Ordem de Serviço</label>
                <div
                  className={`${inputStyle} cursor-pointer flex items-center justify-between`}
                  onClick={() => setOsDropdownOpen(!osDropdownOpen)}
                >
                  <span className={formData.ordem_servico ? 'text-zinc-900' : 'text-zinc-400'}>
                    {formData.ordem_servico
                      ? `OS ${formData.ordem_servico} - ${ordensAbertas.find(o => String(o.Id_Ordem) === formData.ordem_servico)?.Os_Cliente || ''}`
                      : 'Selecione a O.S...'}
                  </span>
                  <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {osDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                    <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                      <input
                        autoFocus
                        placeholder="Buscar por OS, cliente ou técnico..."
                        value={osBusca}
                        onChange={e => setOsBusca(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-red-400"
                      />
                    </div>
                    {formData.ordem_servico && (
                      <button
                        type="button"
                        onClick={() => { setFormData(p => ({...p, ordem_servico: ''})); setOsDropdownOpen(false); setOsBusca(''); }}
                        className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100"
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
                            setOsDropdownOpen(false);
                            setOsBusca('');
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.ordem_servico === String(o.Id_Ordem) ? 'bg-red-50' : ''}`}
                        >
                          <span className="font-bold text-sm text-zinc-800">OS {o.Id_Ordem}</span>
                          <span className="text-xs text-zinc-500 ml-2">{o.Os_Cliente}</span>
                          <span className="text-xs text-zinc-400 ml-2">({o.Os_Tecnico})</span>
                          <span className="text-[10px] text-zinc-400 ml-2 uppercase">{o.Status}</span>
                        </button>
                      ))
                    }
                    {ordensAbertas.filter(o => {
                      if (!osBusca.trim()) return true;
                      const q = osBusca.toLowerCase();
                      return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhuma O.S. encontrada</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TRATOR-CLIENTE (por setor) */}
          {formData.setor === 'Trator-Cliente' && (
            <div className="p-6 bg-amber-500/10 rounded-2xl border border-orange-500/20">
              <p className="text-xs font-black text-orange-400 uppercase tracking-widest mb-4">Informacoes do Cliente</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div ref={cliRef} className="relative">
                  <label className="text-xs font-bold text-orange-400 uppercase">Cliente</label>
                  <div
                    className={`${inputStyle} !text-base border-orange-500/20 cursor-pointer flex items-center justify-between`}
                    onClick={() => setCliDropdownOpen(!cliDropdownOpen)}
                  >
                    <span className={formData.cliente ? 'text-zinc-900' : 'text-zinc-400'}>
                      {formData.cliente
                        ? `${formData.cliente}${formData.cliente_cnpj ? ` — ${formData.cliente_cnpj}` : ''}`
                        : 'Buscar cliente por nome ou CNPJ...'}
                    </span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                          className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100">
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
                          <span className="font-bold text-sm text-zinc-800">{c.nome_fantasia || c.razao_social}</span>
                          <span className="text-xs text-zinc-500 ml-2">{c.cnpj_cpf}</span>
                          {c.cidade && <span className="text-xs text-zinc-400 ml-2">({c.cidade})</span>}
                        </button>
                      ))}
                      {cliBusca.trim().length >= 2 && cliResultados.length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhum cliente encontrado</p>
                      )}
                      {cliBusca.trim().length < 2 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                      )}
                    </div>
                  )}
                </div>
                <div ref={osRef} className="relative">
                  <label className="text-xs font-bold text-orange-400 uppercase">O.S.</label>
                  <div
                    className={`${inputStyle} !text-base border-orange-500/20 cursor-pointer flex items-center justify-between`}
                    onClick={() => setOsDropdownOpen(!osDropdownOpen)}
                  >
                    <span className={formData.ordem_servico ? 'text-zinc-900' : 'text-zinc-400'}>
                      {formData.ordem_servico
                        ? `OS ${formData.ordem_servico} - ${ordensAbertas.find(o => String(o.Id_Ordem) === formData.ordem_servico)?.Os_Cliente || ''}`
                        : 'Selecione a O.S...'}
                    </span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {osDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-auto">
                      <div className="sticky top-0 bg-white p-2 border-b border-zinc-100">
                        <input
                          autoFocus
                          placeholder="Buscar por OS, cliente ou técnico..."
                          value={osBusca}
                          onChange={e => setOsBusca(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm outline-none focus:border-red-400"
                        />
                      </div>
                      {formData.ordem_servico && (
                        <button
                          type="button"
                          onClick={() => { setFormData(p => ({...p, ordem_servico: ''})); setOsDropdownOpen(false); setOsBusca(''); }}
                          className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100"
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
                              setFormData(p => ({...p, ordem_servico: String(o.Id_Ordem), cliente: o.Os_Cliente || p.cliente}));
                              setOsDropdownOpen(false);
                              setOsBusca('');
                            }}
                            className={`w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-50 ${formData.ordem_servico === String(o.Id_Ordem) ? 'bg-red-50' : ''}`}
                          >
                            <span className="font-bold text-sm text-zinc-800">OS {o.Id_Ordem}</span>
                            <span className="text-xs text-zinc-500 ml-2">{o.Os_Cliente}</span>
                            <span className="text-xs text-zinc-400 ml-2">({o.Os_Tecnico})</span>
                            <span className="text-[10px] text-zinc-400 ml-2 uppercase">{o.Status}</span>
                          </button>
                        ))
                      }
                      {ordensAbertas.filter(o => {
                        if (!osBusca.trim()) return true;
                        const q = osBusca.toLowerCase();
                        return String(o.Id_Ordem).toLowerCase().includes(q) || (o.Os_Cliente || '').toLowerCase().includes(q) || (o.Os_Tecnico || '').toLowerCase().includes(q);
                      }).length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhuma O.S. encontrada</p>
                      )}
                    </div>
                  )}
                </div>
                <div ref={!['Trator-Loja'].includes(formData.setor) ? projRef : undefined} className="relative">
                  <label className="text-xs font-bold text-orange-400 uppercase">Projeto / Chassis</label>
                  <div
                    className={`${inputStyle} !text-base border-orange-500/20 cursor-pointer flex items-center justify-between`}
                    onClick={() => setProjDropdownOpen(!projDropdownOpen)}
                  >
                    <span className={formData.projeto_nome ? 'text-zinc-900' : 'text-zinc-400'}>
                      {formData.projeto_nome || 'Buscar projeto ou chassis...'}
                    </span>
                    <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
                      {formData.projeto_codigo && (
                        <button type="button"
                          onClick={() => { setFormData(p => ({...p, projeto_codigo: '', projeto_nome: '', Chassis_Modelo: ''})); setProjDropdownOpen(false); setProjBusca(''); }}
                          className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 border-b border-zinc-100">
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
                          <span className="font-bold text-sm text-zinc-800">{p.nome}</span>
                          <span className="text-xs text-zinc-400 ml-2">{p.empresa}</span>
                        </button>
                      ))}
                      {projBusca.trim().length >= 2 && projResultados.length === 0 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">Nenhum projeto encontrado</p>
                      )}
                      {projBusca.trim().length < 2 && (
                        <p className="px-4 py-3 text-sm text-zinc-400 text-center">Digite pelo menos 2 caracteres</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-bold text-orange-400 uppercase">Valor Cobrado do Cliente</label>
                  <input placeholder="0,00" onChange={e => setFormData({...formData, valor_cobrado_cliente: e.target.value})} className={`${inputStyle} !text-base border-orange-500/40 font-bold text-orange-400`} />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className={labelStyle}>Observações Técnicas</label>
            <textarea rows={4} spellCheck lang="pt-BR" onChange={e => setFormData({...formData, obs: e.target.value})} className={`${inputStyle} resize-none italic`} placeholder="Descreva os itens ou serviços necessários..." />
          </div>

          {/* Grupos (coletivos) — opcional, em dropdown pra não poluir o form */}
          {gruposDisp.length > 0 && (
            <div>
              <label className={labelStyle}>Adicionar a grupo(s) <span className="text-zinc-400 normal-case tracking-normal font-medium">(opcional)</span></label>
              <div className="relative">
                <button type="button" onClick={() => setGruposFormAberto(o => !o)}
                  className={`${inputStyle} flex items-center gap-2 text-left`}>
                  <FolderOpen size={18} className="text-zinc-400 shrink-0" />
                  <span className={`flex-1 truncate ${gruposSel.length ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    {gruposSel.length === 0 ? 'Nenhum grupo'
                      : gruposSel.length === 1 ? gruposDisp.find((g: any) => g.id === gruposSel[0])?.nome
                      : `${gruposSel.length} grupos selecionados`}
                  </span>
                  <ChevronDown size={20} className={`text-zinc-400 transition-transform ${gruposFormAberto ? 'rotate-180' : ''}`} />
                </button>
                {gruposFormAberto && (
                  <div className="absolute z-20 mt-2 w-full bg-white border border-zinc-200 rounded-xl shadow-xl max-h-64 overflow-y-auto p-1.5">
                    {gruposDisp.map((g: any) => {
                      const sel = gruposSel.includes(g.id);
                      return (
                        <button type="button" key={g.id}
                          onClick={() => setGruposSel(prev => sel ? prev.filter(x => x !== g.id) : [...prev, g.id])}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left text-base transition-all ${sel ? 'bg-red-50 text-red-700' : 'text-zinc-700 hover:bg-zinc-50'}`}>
                          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-red-600 border-red-600' : 'border-zinc-300'}`}>
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

          <button type="submit" className="w-full bg-white text-slate-900 font-black py-6 rounded-xl shadow-lg hover:bg-red-500 hover:text-white transition-all uppercase text-sm tracking-[0.4em]">
            Confirmar e Enviar Pedido
          </button>
        </form>
      </div>
    </div>
  );
}