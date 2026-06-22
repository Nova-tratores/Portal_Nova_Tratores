'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Plus, Trash2, Tag, ChevronDown, ChevronUp } from 'lucide-react';

interface TagReq { id: number; nome: string; cor: string; grupo: string | null }
interface Props { open: boolean; onClose: () => void }

const CORES = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#be185d', '#64748b', '#1e293b'];

const GRUPOS = [
  { value: 'categoria', label: 'Categoria de Peça', color: '#ea580c' },
  { value: 'sistema', label: 'Sistema', color: '#2563eb' },
  { value: 'geral', label: 'Geral', color: '#64748b' },
];

export default function ModalTags({ open, onClose }: Props) {
  const [tags, setTags] = useState<TagReq[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoCor, setNovoCor] = useState(CORES[0]);
  const [novoGrupo, setNovoGrupo] = useState('geral');
  const [editando, setEditando] = useState<TagReq | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('');
  const [editGrupo, setEditGrupo] = useState('geral');
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>({ categoria: true, sistema: true, geral: true });

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('requisicao_tags').select('*').order('nome');
    setTags(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  const criar = async () => {
    const nome = novoNome.trim().toUpperCase();
    if (!nome) return;
    if (tags.some(t => (t.nome || '').trim().toUpperCase() === nome)) {
      alert('Já existe uma tag com esse nome.');
      return;
    }
    await supabase.from('requisicao_tags').insert({ nome, cor: novoCor, grupo: novoGrupo });
    setNovoNome('');
    setNovoCor(CORES[0]);
    carregar();
  };

  const salvarEdicao = async () => {
    if (!editando || !editNome.trim()) return;
    const nome = editNome.trim().toUpperCase();
    if (tags.some(t => t.id !== editando.id && (t.nome || '').trim().toUpperCase() === nome)) {
      alert('Já existe uma tag com esse nome.');
      return;
    }
    await supabase.from('requisicao_tags').update({ nome, cor: editCor, grupo: editGrupo }).eq('id', editando.id);
    setEditando(null);
    carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm('Excluir esta tag?')) return;
    await supabase.from('requisicao_tags').delete().eq('id', id);
    carregar();
  };

  const toggleGrupo = (g: string) => setGruposAbertos(prev => ({ ...prev, [g]: !prev[g] }));

  if (!open) return null;

  const tagsPorGrupo = GRUPOS.map(g => ({
    ...g,
    tags: tags.filter(t => (t.grupo || 'geral') === g.value),
  }));

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 60000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 20, width: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Tag size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#1E293B' }}>Gerenciar Tags</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{tags.length} tags em {GRUPOS.length} grupos</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
            <X size={18} />
          </button>
        </div>

        {/* Criar nova tag */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 }}>NOVA TAG</label>
              <input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && criar()}
                placeholder="Nome da tag..."
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 }}>GRUPO</label>
              <select value={novoGrupo} onChange={e => setNovoGrupo(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 13, fontWeight: 600, background: '#fff' }}>
                {GRUPOS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <button onClick={criar}
              style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> Criar
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {CORES.map(c => (
              <div key={c} onClick={() => setNovoCor(c)}
                style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', border: novoCor === c ? '2px solid #1E293B' : '2px solid transparent', transition: 'border .15s' }} />
            ))}
          </div>
        </div>

        {/* Lista de tags agrupadas */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Carregando...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tagsPorGrupo.map(grupo => (
                <div key={grupo.value}>
                  <button onClick={() => toggleGrupo(grupo.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', cursor: 'pointer', marginBottom: gruposAbertos[grupo.value] ? 6 : 0 }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: grupo.color, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {grupo.label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginRight: 4 }}>{grupo.tags.length}</span>
                    {gruposAbertos[grupo.value] ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                  </button>
                  {gruposAbertos[grupo.value] && grupo.tags.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 }}>
                      {grupo.tags.map(tag => (
                        <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#FAFBFC', borderRadius: 8, borderLeft: `3px solid ${tag.cor}` }}>
                          {editando?.id === tag.id ? (
                            <>
                              <input value={editNome} onChange={e => setEditNome(e.target.value)}
                                style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13 }} />
                              <select value={editGrupo} onChange={e => setEditGrupo(e.target.value)}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 11, fontWeight: 600 }}>
                                {GRUPOS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                              </select>
                              <div style={{ display: 'flex', gap: 3 }}>
                                {CORES.map(c => (
                                  <div key={c} onClick={() => setEditCor(c)}
                                    style={{ width: 16, height: 16, borderRadius: 4, background: c, cursor: 'pointer', border: editCor === c ? '2px solid #1E293B' : '2px solid transparent' }} />
                                ))}
                              </div>
                              <button onClick={salvarEdicao}
                                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>OK</button>
                              <button onClick={() => setEditando(null)}
                                style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 11, cursor: 'pointer' }}>
                                <X size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              <div style={{ width: 16, height: 16, borderRadius: 5, background: tag.cor, flexShrink: 0 }} />
                              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{tag.nome}</span>
                              <button onClick={() => { setEditando(tag); setEditNome(tag.nome); setEditCor(tag.cor); setEditGrupo(tag.grupo || 'geral'); }}
                                style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Tag size={11} />
                              </button>
                              <button onClick={() => excluir(tag.id)}
                                style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#DC2626' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1' }}>
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {gruposAbertos[grupo.value] && grupo.tags.length === 0 && (
                    <div style={{ padding: '8px 20px', fontSize: 12, color: '#CBD5E1', fontStyle: 'italic' }}>Nenhuma tag neste grupo</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
