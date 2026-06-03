'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Plus, Trash2, Tag } from 'lucide-react';

interface TagReq { id: number; nome: string; cor: string }
interface Props { open: boolean; onClose: () => void }

const CORES = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#be185d', '#64748b', '#1e293b'];

export default function ModalTags({ open, onClose }: Props) {
  const [tags, setTags] = useState<TagReq[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoCor, setNovoCor] = useState(CORES[0]);
  const [editando, setEditando] = useState<TagReq | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('requisicao_tags').select('*').order('nome');
    setTags(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  const criar = async () => {
    if (!novoNome.trim()) return;
    await supabase.from('requisicao_tags').insert({ nome: novoNome.trim().toUpperCase(), cor: novoCor });
    setNovoNome('');
    setNovoCor(CORES[0]);
    carregar();
  };

  const salvarEdicao = async () => {
    if (!editando || !editNome.trim()) return;
    await supabase.from('requisicao_tags').update({ nome: editNome.trim().toUpperCase(), cor: editCor }).eq('id', editando.id);
    setEditando(null);
    carregar();
  };

  const excluir = async (id: number) => {
    if (!confirm('Excluir esta tag?')) return;
    await supabase.from('requisicao_tags').delete().eq('id', id);
    carregar();
  };

  if (!open) return null;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 60000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 20, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Tag size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#1E293B' }}>Gerenciar Tags</h3>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{tags.length} tags criadas</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
            <X size={18} />
          </button>
        </div>

        {/* Criar nova tag */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
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
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4 }}>COR</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {CORES.map(c => (
                <div key={c} onClick={() => setNovoCor(c)}
                  style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer', border: novoCor === c ? '2px solid #1E293B' : '2px solid transparent', transition: 'border .15s' }} />
              ))}
            </div>
          </div>
          <button onClick={criar}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Criar
          </button>
        </div>

        {/* Lista de tags */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Carregando...</div>
          ) : tags.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#CBD5E1', fontSize: 13 }}>Nenhuma tag criada</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tags.map(tag => (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#F8FAFC', borderRadius: 10 }}>
                  {editando?.id === tag.id ? (
                    <>
                      <input value={editNome} onChange={e => setEditNome(e.target.value)}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13 }} />
                      <div style={{ display: 'flex', gap: 3 }}>
                        {CORES.map(c => (
                          <div key={c} onClick={() => setEditCor(c)}
                            style={{ width: 18, height: 18, borderRadius: 4, background: c, cursor: 'pointer', border: editCor === c ? '2px solid #1E293B' : '2px solid transparent' }} />
                        ))}
                      </div>
                      <button onClick={salvarEdicao}
                        style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar</button>
                      <button onClick={() => setEditando(null)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 12, cursor: 'pointer' }}>
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: tag.cor, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{tag.nome}</span>
                      <button onClick={() => { setEditando(tag); setEditNome(tag.nome); setEditCor(tag.cor); }}
                        style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Tag size={12} />
                      </button>
                      <button onClick={() => excluir(tag.id)}
                        style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#DC2626' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#CBD5E1' }}>
                        <Trash2 size={12} />
                      </button>
                    </>
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
