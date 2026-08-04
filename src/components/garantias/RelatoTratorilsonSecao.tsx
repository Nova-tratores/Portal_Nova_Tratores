'use client';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, Save, Copy, Check } from 'lucide-react';
import type { GarantiaDetalhe } from '@/lib/garantias/types';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';

interface Props {
  g: GarantiaDetalhe;
  userName: string;
  podeAnalisar: boolean;
  finalizada: boolean;
  onChange: () => void;
}

const areaStyle: React.CSSProperties = {
  width: '100%', minHeight: 72, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)', fontSize: 13, outline: 'none', resize: 'vertical',
  lineHeight: 1.5, fontFamily: 'inherit',
};

const CAMPOS: { chave: 'reclamacao' | 'diagnostico' | 'acao' | 'obs'; label: string; hint: string }[] = [
  { chave: 'reclamacao', label: 'Reclamação do cliente', hint: 'vira o campo "Reclamação do Cliente" no formulário da fábrica' },
  { chave: 'diagnostico', label: 'Análise da falha (diagnóstico)', hint: 'vira o campo de análise/diagnóstico' },
  { chave: 'acao', label: 'Reparo executado (ação tomada)', hint: 'vira o campo de reparo/solução' },
  { chave: 'obs', label: 'Observações (opcional)', hint: 'complementos que valem a pena citar' },
];

// Relato do Tratorilson pra montadoras com envio pelo SITE da fábrica
// (Ventura/Tatu/KUHN — tipo_template 'sem_template' + guia com acesso).
// Mesmo motor do fluxo Ipacol (rota formatar-textos + chaves sg_* no
// checklist_respostas); aqui o objetivo é COPIAR e colar no formulário externo.
export default function RelatoTratorilsonSecao({ g, userName, podeAnalisar, finalizada, onChange }: Props) {
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [copiado, setCopiado] = useState('');

  const resp = (g.checklist_respostas as Record<string, unknown>) || {};
  const [textos, setTextos] = useState<Record<string, string>>({
    reclamacao: String(resp['sg_reclamacao'] || ''),
    diagnostico: String(resp['sg_diagnostico'] || ''),
    acao: String(resp['sg_acao_tomada'] || ''),
    obs: String(resp['sg_observacoes'] || ''),
  });
  // KUHN: a Extranet tem UMA caixa de texto ("Provável causa e descrição do
  // problema") — texto numerado 1–6 com horas de M.O., KM e peças, no formato
  // que a fábrica aprova a mão de obra (pedido do usuário, 04/08/2026)
  const ehKuhn = String(g.montadora?.nome || '').toLowerCase().includes('kuhn');
  const [textoKuhn, setTextoKuhn] = useState(String(resp['sg_kuhn_site'] || ''));

  // Re-sincroniza quando o drawer recarrega — a não ser que haja edição em
  // curso (padrão da SolicitacaoEmailSecao).
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    const r = (g.checklist_respostas as Record<string, unknown>) || {};
    setTextos({
      reclamacao: String(r['sg_reclamacao'] || ''),
      diagnostico: String(r['sg_diagnostico'] || ''),
      acao: String(r['sg_acao_tomada'] || ''),
      obs: String(r['sg_observacoes'] || ''),
    });
    setTextoKuhn(String(r['sg_kuhn_site'] || ''));
  }, [g.checklist_respostas]);

  const montarTextoKuhn = async () => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    setBusy('kuhn');
    setErro('');
    setAviso('');
    try {
      const res = await fetch(`/api/garantias/${g.id}/texto-kuhn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ator: userName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(data.error || 'Falha ao montar o texto.'); return; }
      dirty.current = false;
      setTextoKuhn(String(data.texto || ''));
      setAviso('Texto no formato da KUHN pronto — confira os ____ (dados que faltaram) antes de colar no site.');
      onChange();
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setBusy('');
    }
  };

  const copiarTextoKuhn = async () => {
    try {
      await navigator.clipboard.writeText(textoKuhn);
      setCopiado('kuhn');
      setTimeout(() => setCopiado((atual) => (atual === 'kuhn' ? '' : atual)), 1600);
    } catch {
      setErro('Não consegui copiar — selecione o texto manualmente.');
    }
  };

  const temTextos = !!(textos.reclamacao.trim() || textos.diagnostico.trim() || textos.acao.trim());

  const gerar = async (forcar: boolean) => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    setBusy('gerar');
    setErro('');
    setAviso('');
    try {
      const res = await fetch(`/api/garantias/${g.id}/formatar-textos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ator: userName, forcar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Falha ao gerar os textos.');
        return;
      }
      const t = data.textos || {};
      dirty.current = false;
      setTextos({
        reclamacao: String(t.reclamacao || ''),
        diagnostico: String(t.diagnostico || ''),
        acao: String(t.acao_tomada || ''),
        obs: String(t.observacoes || ''),
      });
      setAviso('Textos do Tratorilson prontos — revise e copie pro formulário da fábrica.');
      onChange();
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setBusy('');
    }
  };

  const salvar = async () => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    setBusy('salvar');
    setErro('');
    setAviso('');
    try {
      const res = await fetch(`/api/garantias/${g.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // merge server-side: só as chaves de texto — não manda o checklist
          // inteiro (a base local pode estar defasada).
          checklist_respostas_merge: {
            sg_reclamacao: textos.reclamacao,
            sg_diagnostico: textos.diagnostico,
            sg_acao_tomada: textos.acao,
            sg_observacoes: textos.obs,
            ...(ehKuhn ? { sg_kuhn_site: textoKuhn } : {}),
          },
          garantista_nome: userName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Falha ao salvar os textos.');
        return;
      }
      dirty.current = false;
      setAviso('Textos salvos.');
      onChange();
    } catch {
      setErro('Erro de conexão.');
    } finally {
      setBusy('');
    }
  };

  const copiar = async (chave: string) => {
    try {
      await navigator.clipboard.writeText(textos[chave] || '');
      setCopiado(chave);
      // Só limpa se o selo ainda for deste campo — senão o timer de uma cópia
      // anterior apaga o "Copiado!" da seguinte antes da hora.
      setTimeout(() => setCopiado((atual) => (atual === chave ? '' : atual)), 1600);
    } catch {
      setErro('Não consegui copiar — selecione o texto manualmente.');
    }
  };

  if (finalizada && !temTextos) {
    return (
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
        Garantia finalizada — nenhum relato foi gerado pra esta solicitação.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>
        O Tratorilson formata o relato da OS nos campos que o formulário da fábrica pede — revise,
        salve e use o botão de copiar de cada campo na hora de preencher o site.
      </div>

      {!temTextos && !finalizada && (
        <button onClick={() => gerar(false)} disabled={!!busy} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '9px 14px', borderRadius: 9, border: 'none',
          background: 'linear-gradient(135deg,#0d9488,#115e59)', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy === 'gerar' ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          Gerar com o Tratorilson
        </button>
      )}

      {temTextos && (
        <>
          {CAMPOS.map((c) => (
            <div key={c.chave} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>{c.label}</span>
                <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>{c.hint}</span>
                <button
                  type="button"
                  onClick={() => copiar(c.chave)}
                  title="Copiar pro formulário da fábrica"
                  style={{
                    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                    background: 'none', border: '1px solid var(--portal-border)', borderRadius: 6,
                    padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    color: copiado === c.chave ? '#16a34a' : 'var(--portal-text-secondary)',
                  }}
                >
                  {copiado === c.chave ? <Check size={12} /> : <Copy size={12} />}
                  {copiado === c.chave ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <textarea
                value={textos[c.chave]}
                onChange={(e) => {
                  dirty.current = true;
                  setTextos((t) => ({ ...t, [c.chave]: e.target.value }));
                }}
                readOnly={finalizada}
                style={areaStyle}
              />
            </div>
          ))}

          {!finalizada && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={salvar} disabled={!!busy} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                border: 'none', background: '#475569', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}>
                {busy === 'salvar' ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                Salvar textos
              </button>
              <button onClick={() => gerar(true)} disabled={!!busy} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--portal-border)', background: 'none',
                color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}>
                {busy === 'gerar' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                Regerar
              </button>
            </div>
          )}
        </>
      )}

      {/* ── KUHN: texto único pro campo "Provável causa e descrição do problema" ── */}
      {ehKuhn && (textoKuhn || !finalizada) && (
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #FDE68A', background: '#FFFBEB', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#92400E' }}>
              Texto único pro site da KUHN (aprovação da mão de obra)
            </span>
            {textoKuhn && (
              <button
                type="button"
                onClick={copiarTextoKuhn}
                title="Copiar o texto completo pra colar na Extranet"
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: '1px solid #FDE68A', borderRadius: 6,
                  padding: '2px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  color: copiado === 'kuhn' ? '#16a34a' : '#92400E',
                }}
              >
                {copiado === 'kuhn' ? <Check size={12} /> : <Copy size={12} />}
                {copiado === 'kuhn' ? 'Copiado!' : 'Copiar tudo'}
              </button>
            )}
          </div>
          <span style={{ fontSize: 11, color: '#92400E', lineHeight: 1.5 }}>
            Formato numerado 1–6 (data do atendimento, nº da OS, técnico, horas de M.O., KM e peças) —
            os <strong>____</strong> são dados que faltaram no relatório do técnico; complete antes de colar.
          </span>

          {!textoKuhn && !finalizada && (
            <button onClick={montarTextoKuhn} disabled={!!busy} style={{
              alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#d97706,#92400e)', color: '#fff',
              fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
            }}>
              {busy === 'kuhn' ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              Montar texto no formato da KUHN
            </button>
          )}

          {textoKuhn && (
            <>
              <textarea
                value={textoKuhn}
                onChange={(e) => { dirty.current = true; setTextoKuhn(e.target.value); }}
                readOnly={finalizada}
                style={{ ...areaStyle, minHeight: 170, background: '#fff', fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
              />
              {!finalizada && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={salvar} disabled={!!busy} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                    border: 'none', background: '#475569', color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}>
                    {busy === 'salvar' ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                    Salvar
                  </button>
                  <button onClick={montarTextoKuhn} disabled={!!busy} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                    border: '1px solid #FDE68A', background: 'none', color: '#92400E', fontSize: 12, fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}>
                    {busy === 'kuhn' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                    Remontar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {erro && <div style={{ fontSize: 12, color: '#dc2626' }}>{erro}</div>}
      {aviso && <div style={{ fontSize: 12, color: '#16a34a' }}>{aviso}</div>}
    </div>
  );
}
