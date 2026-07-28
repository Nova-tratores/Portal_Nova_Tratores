'use client';
import { useState } from 'react';
import { X, Plus, ChevronUp, ChevronDown, Trash2, Save, Loader2, Eye } from 'lucide-react';
import { CHECKLIST_TIPOS } from '@/lib/garantias/constants';
import type { ChecklistField, ChecklistFieldTipo, Montadora } from '@/lib/garantias/types';
import ChecklistRenderer from './ChecklistRenderer';

interface Props {
  montadora: Montadora | null;
  criadoPor: string;
  onClose: () => void;
  onSaved: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)',
  fontSize: 13,
  outline: 'none',
};

function novoId() {
  return 'f_' + Math.random().toString(36).slice(2, 10);
}

export default function MontadoraEditor({ montadora, criadoPor, onClose, onSaved }: Props) {
  const [nome, setNome] = useState(montadora?.nome || '');
  const [cor, setCor] = useState(montadora?.cor || '#0ea5e9');
  const [contato, setContato] = useState(montadora?.contato_fabrica || '');
  const [ativo, setAtivo] = useState(montadora?.ativo ?? true);
  const [campos, setCampos] = useState<ChecklistField[]>(montadora?.checklist_def || []);
  const [tipoTemplate, setTipoTemplate] = useState<'sem_template' | 'mahindra' | 'email'>(
    montadora?.tipo_template || 'sem_template',
  );
  const [emails, setEmails] = useState((montadora?.email_destinatarios || []).join('\n'));
  const [autoEnviar, setAutoEnviar] = useState(montadora?.auto_enviar_email ?? false);
  const [emailAssunto, setEmailAssunto] = useState(montadora?.email_assunto || '');
  const [emailCorpo, setEmailCorpo] = useState(montadora?.email_corpo || '');
  const [emailAssinatura, setEmailAssinatura] = useState(montadora?.email_assinatura || '');
  const [proximoNumeroSG, setProximoNumeroSG] = useState(
    String(montadora?.proximo_numero_sg ?? 1),
  );
  const [fluxo, setFluxo] = useState<'padrao' | 'duas_etapas'>(montadora?.fluxo || 'padrao');
  const [ressarcimentoPorEmail, setRessarcimentoPorEmail] = useState(
    montadora?.ressarcimento_por_email ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  function addCampo(tipo: ChecklistFieldTipo) {
    setCampos((c) => [
      ...c,
      {
        id: novoId(),
        tipo,
        label: tipo === 'secao' ? 'Nova seção' : 'Novo campo',
        obrigatorio: false,
        opcoes: tipo === 'select' ? ['Opção 1'] : undefined,
      },
    ]);
  }

  function updateCampo(i: number, patch: Partial<ChecklistField>) {
    setCampos((c) => c.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function moveCampo(i: number, dir: -1 | 1) {
    setCampos((c) => {
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      const novo = [...c];
      [novo[i], novo[j]] = [novo[j], novo[i]];
      return novo;
    });
  }

  function removeCampo(i: number) {
    setCampos((c) => c.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    if (!nome.trim()) {
      setErro('Informe o nome da montadora.');
      return;
    }
    setSaving(true);
    setErro('');
    try {
      const payload = {
        nome: nome.trim(),
        cor,
        contato_fabrica: contato.trim() || null,
        ativo,
        checklist_def: campos,
        criado_por: criadoPor,
        tipo_template: tipoTemplate,
        email_destinatarios: emails
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        auto_enviar_email: autoEnviar,
        email_assunto: emailAssunto.trim() || null,
        email_corpo: emailCorpo.trim() || null,
        email_assinatura: emailAssinatura.trim() || null,
        proximo_numero_sg: Math.max(1, parseInt(proximoNumeroSG, 10) || 1),
        fluxo,
        ressarcimento_por_email: ressarcimentoPorEmail,
      };
      const url = montadora
        ? `/api/garantias/montadoras/${montadora.id}`
        : '/api/garantias/montadoras';
      const res = await fetch(url, {
        method: montadora ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || 'Falha ao salvar.');
        return;
      }
      onSaved();
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setSaving(false);
    }
  }

  const previewValores: Record<string, unknown> = {};

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--portal-bg-card)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--portal-border)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>
            {montadora ? 'Editar montadora' : 'Nova montadora'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, overflow: 'auto' }}>
          {/* Editor */}
          <div style={{ flex: '1 1 480px', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Dados da montadora */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>Nome *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mahindra" style={inputStyle} />
              </div>
              <div style={{ flex: '0 0 70px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>Cor</label>
                <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} style={{ ...inputStyle, padding: 2, height: 36 }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>Contato da fábrica</label>
                <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="E-mail ou observação" style={inputStyle} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-secondary)', paddingBottom: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                Ativa
              </label>
            </div>

            {/* Envio à fábrica (template SG + e-mails) */}
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
                Envio à fábrica
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Fluxo da garantia
                </label>
                <select
                  value={fluxo}
                  onChange={(e) => setFluxo(e.target.value === 'duas_etapas' ? 'duas_etapas' : 'padrao')}
                  style={inputStyle}
                >
                  <option value="padrao">Padrão — peças e serviço numa etapa só</option>
                  <option value="duas_etapas">Duas etapas — peças primeiro, ressarcimento das horas/km depois</option>
                </select>
                {fluxo === 'duas_etapas' && (
                  <>
                    <span style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>
                      A garantia passa por: peças na fábrica → peças aprovadas (aguardando serviço) →
                      ressarcimento na fábrica → finalizada.
                    </span>
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
                        fontSize: 13, color: 'var(--portal-text-secondary)', cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ressarcimentoPorEmail}
                        onChange={(e) => setRessarcimentoPorEmail(e.target.checked)}
                      />
                      Enviar pedido de ressarcimento por e-mail à fábrica (usa os e-mails abaixo)
                    </label>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Formato do arquivo
                </label>
                <select
                  value={tipoTemplate}
                  onChange={(e) => setTipoTemplate(e.target.value as 'sem_template' | 'mahindra' | 'email')}
                  style={inputStyle}
                >
                  <option value="sem_template">Sem template (envio manual)</option>
                  <option value="mahindra">Mahindra (SG xlsx)</option>
                  <option value="email">E-mail (sem planilha) — relato modelado + RAT + NF + fotos</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Próximo número SG
                </label>
                <input
                  type="number"
                  min={1}
                  value={proximoNumeroSG}
                  onChange={(e) => setProximoNumeroSG(e.target.value)}
                  placeholder="Ex.: 35"
                  style={inputStyle}
                />
                <span style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>
                  Próxima SG sai como <strong>{new Date().getFullYear()}-{String(Math.max(1, parseInt(proximoNumeroSG, 10) || 1)).padStart(3, '0')}</strong>. Incrementa
                  automaticamente a cada SG nova dessa montadora.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  E-mails da fábrica (um por linha)
                </label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="ferreira.vinicius@mahindrabrazil.com&#10;marcel.ochsenhofer@mahindrabrazil.com"
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: 'var(--portal-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoEnviar}
                  onChange={(e) => setAutoEnviar(e.target.checked)}
                />
                Enviar e-mail automaticamente ao clicar em "Enviar à fábrica"
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Assunto do e-mail (opcional)
                </label>
                <input
                  value={emailAssunto}
                  onChange={(e) => setEmailAssunto(e.target.value)}
                  placeholder="SG {{numero}} - {{cliente}} - {{modelo}}"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Corpo do e-mail (opcional)
                </label>
                <textarea
                  value={emailCorpo}
                  onChange={(e) => setEmailCorpo(e.target.value)}
                  placeholder="Prezados, segue em anexo a SG {{numero}} referente à OS {{os}} do cliente {{cliente}}..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>
                  Variáveis: <code>{'{{numero}}'}</code>, <code>{'{{cliente}}'}</code>, <code>{'{{os}}'}</code>,
                  <code>{'{{chassis}}'}</code>, <code>{'{{modelo}}'}</code>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                  Assinatura do e-mail (HTML, opcional)
                </label>
                <textarea
                  value={emailAssinatura}
                  onChange={(e) => setEmailAssinatura(e.target.value)}
                  placeholder={`<p style="color:#7c3aed;font-style:italic"><b>Vinícius Corrêa</b><br>Pós-Vendas</p>\n<img src="https://.../logo-nova.png" height="40">`}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                />
                <span style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>
                  Cole o HTML da sua assinatura. Suporta <code>&lt;img&gt;</code> com URL pública, cores e formatação.
                  É colado no fim de todo e-mail SG enviado por essa montadora.
                </span>
                {emailAssinatura && (
                  <div
                    style={{
                      marginTop: 4,
                      padding: 10,
                      border: '1px dashed var(--portal-border)',
                      borderRadius: 8,
                      background: 'var(--portal-bg-secondary)',
                      fontSize: 11,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--portal-text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                      Pré-visualização
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: emailAssinatura }} />
                  </div>
                )}
              </div>
            </div>

            {/* Construtor de checklist */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 8 }}>
                Checklist da garantia
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {campos.map((campo, i) => (
                  <div
                    key={campo.id}
                    style={{
                      border: '1px solid var(--portal-border)',
                      borderRadius: 10,
                      padding: 10,
                      background: 'var(--portal-bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: 'var(--portal-text-muted)',
                          background: 'var(--portal-bg-hover)',
                          padding: '3px 7px',
                          borderRadius: 6,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {CHECKLIST_TIPOS.find((t) => t.tipo === campo.tipo)?.label}
                      </span>
                      <input
                        value={campo.label}
                        onChange={(e) => updateCampo(i, { label: e.target.value })}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button onClick={() => moveCampo(i, -1)} disabled={i === 0} style={iconBtn(i === 0)}>
                        <ChevronUp size={15} />
                      </button>
                      <button onClick={() => moveCampo(i, 1)} disabled={i === campos.length - 1} style={iconBtn(i === campos.length - 1)}>
                        <ChevronDown size={15} />
                      </button>
                      <button onClick={() => removeCampo(i)} style={{ ...iconBtn(false), color: '#dc2626' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {campo.tipo !== 'secao' && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={campo.obrigatorio}
                            onChange={(e) => updateCampo(i, { obrigatorio: e.target.checked })}
                          />
                          Obrigatório
                        </label>
                        <input
                          value={campo.ajuda || ''}
                          onChange={(e) => updateCampo(i, { ajuda: e.target.value })}
                          placeholder="Texto de ajuda (opcional)"
                          style={{ ...inputStyle, flex: '1 1 160px' }}
                        />
                      </div>
                    )}
                    {campo.tipo === 'select' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>Opções (uma por linha)</label>
                        <textarea
                          value={(campo.opcoes || []).join('\n')}
                          onChange={(e) =>
                            updateCampo(i, { opcoes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })
                          }
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Adicionar campo */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {CHECKLIST_TIPOS.map((t) => (
                  <button
                    key={t.tipo}
                    onClick={() => addCampo(t.tipo)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px dashed var(--portal-border)',
                      background: 'var(--portal-bg-input)',
                      color: 'var(--portal-text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} /> {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div
            style={{
              flex: '1 1 280px',
              padding: 20,
              borderLeft: '1px solid var(--portal-border)',
              background: 'var(--portal-bg-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>
              <Eye size={14} /> Pré-visualização
            </div>
            <ChecklistRenderer campos={campos} valores={previewValores} readOnly />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--portal-border)',
          }}
        >
          {erro && <span style={{ fontSize: 12, color: '#dc2626', marginRight: 'auto' }}>{erro}</span>}
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--portal-border)',
              background: 'var(--portal-bg-input)',
              color: 'var(--portal-text-secondary)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #dc2626, #7f1d1d)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(220,38,38,0.25)',
            }}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 6,
    border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-input)',
    color: 'var(--portal-text-muted)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  };
}
