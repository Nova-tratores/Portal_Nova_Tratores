'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Factory, Loader2, ListChecks, HelpCircle } from 'lucide-react';
import type { Montadora } from '@/lib/garantias/types';
import MontadoraEditor from './MontadoraEditor';
import GuiaMontadoraModal from './GuiaMontadoraModal';

interface Props {
  criadoPor: string;
}

export default function MontadorasConfig({ criadoPor }: Props) {
  const [montadoras, setMontadoras] = useState<Montadora[]>([]);
  const [loading, setLoading] = useState(true);
  // undefined = fechado | null = nova | Montadora = editar
  const [editor, setEditor] = useState<Montadora | null | undefined>(undefined);
  // Guia "como solicitar garantia" (botão ?)
  const [guiaDe, setGuiaDe] = useState<Montadora | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/garantias/montadoras');
      const data = await res.json();
      setMontadoras(data.montadoras || []);
    } catch {
      setMontadoras([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function excluir(m: Montadora) {
    if (!confirm(`Excluir a montadora "${m.nome}"?`)) return;
    const res = await fetch(`/api/garantias/montadoras/${m.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Falha ao excluir.');
      return;
    }
    carregar();
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--portal-text-muted)' }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-muted)' }}>
          {montadoras.length} montadora(s) cadastrada(s). Cada uma tem seu próprio checklist de garantia.
        </p>
        <button
          onClick={() => setEditor(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #7f1d1d)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(220,38,38,0.25)',
          }}
        >
          <Plus size={15} /> Nova montadora
        </button>
      </div>

      {montadoras.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--portal-text-muted)', fontSize: 13 }}>
          <Factory size={32} style={{ opacity: 0.4 }} />
          <p>Nenhuma montadora cadastrada ainda.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {montadoras.map((m) => (
            <div
              key={m.id}
              style={{
                border: '1px solid var(--portal-border)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--portal-bg-card)',
                borderLeft: `4px solid ${m.cor || '#0ea5e9'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{m.nome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!m.ativo && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#dc262618', padding: '2px 7px', borderRadius: 6 }}>
                      INATIVA
                    </span>
                  )}
                  <button
                    onClick={() => setGuiaDe(m)}
                    title="Como solicitar garantia nesta montadora"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: '50%',
                      border: '1px solid var(--portal-border)',
                      background: 'var(--portal-bg-input)',
                      color: '#dc2626', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <HelpCircle size={15} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--portal-text-muted)' }}>
                <ListChecks size={13} /> {m.checklist_def?.length || 0} campo(s) no checklist
              </div>
              {m.contato_fabrica && (
                <div style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>{m.contato_fabrica}</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button onClick={() => setEditor(m)} style={cardBtn()}>
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => excluir(m)} style={{ ...cardBtn(), color: '#dc2626' }}>
                  <Trash2 size={13} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editor !== undefined && (
        <MontadoraEditor
          montadora={editor}
          criadoPor={criadoPor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            carregar();
          }}
        />
      )}

      {guiaDe && (
        <GuiaMontadoraModal montadoraNome={guiaDe.nome} onClose={() => setGuiaDe(null)} />
      )}
    </div>
  );
}

function cardBtn(): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 10px',
    borderRadius: 7,
    border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)',
    color: 'var(--portal-text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    flex: 1,
    justifyContent: 'center',
  };
}
