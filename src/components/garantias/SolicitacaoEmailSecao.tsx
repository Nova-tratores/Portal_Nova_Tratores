'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send, Loader2, Sparkles, FileText, Printer, Search, CheckCircle2, XCircle,
  Camera, Mail,
} from 'lucide-react';
import type { GarantiaDetalhe } from '@/lib/garantias/types';
import { fmtDataHora } from '@/lib/garantias/format';
import GarantiaAnexos from './GarantiaAnexos';
import { MSG_SEM_PERMISSAO } from '@/lib/permissoes/ui';

interface Props {
  g: GarantiaDetalhe;
  userName: string;
  naFabrica: boolean;
  finalizada: boolean;
  podeAnalisar: boolean;
  podeEnviarFabrica: boolean;
  onChange: () => void; // recarrega a garantia no drawer
}

interface FotoDisponivel { chave: string; label: string; url: string }
interface CandidatoNF {
  tipo: string; origem: string; numero: string; link: string; valor: number; data: string;
}

const btn = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 9, border: 'none', background: bg,
  color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

const btnGhost = (disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  padding: '7px 12px', borderRadius: 8,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text-secondary)', fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
});

const taStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)', fontSize: 13, fontFamily: 'inherit',
  resize: 'vertical', outline: 'none',
};

const inputStyle: React.CSSProperties = { ...taStyle, resize: 'none' };

const label11: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.4,
};

// Seção "Solicitação de garantia por e-mail" (montadoras tipo_template='email',
// ex. Ipacol): textos do Tratorilson revisáveis + RAT (PDF preenchido ou
// imprimível) + NF de venda pelo chassi + fotos selecionáveis + preview do
// e-mail + envio.
export default function SolicitacaoEmailSecao({ g, userName, naFabrica, finalizada, podeAnalisar, podeEnviarFabrica, onChange }: Props) {
  const [busy, setBusy] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  // Textos do Tratorilson (sg_*)
  const resp = (g.checklist_respostas as Record<string, unknown>) || {};
  const [reclamacao, setReclamacao] = useState(String(resp['sg_reclamacao'] || ''));
  const [diagnostico, setDiagnostico] = useState(String(resp['sg_diagnostico'] || ''));
  const [acao, setAcao] = useState(String(resp['sg_acao_tomada'] || ''));
  const [obs, setObs] = useState(String(resp['sg_observacoes'] || ''));

  // RAT — campos variáveis
  const [ratHorimetro, setRatHorimetro] = useState(String(resp['rat_horimetro'] || ''));
  const [ratDataFalha, setRatDataFalha] = useState(String(resp['rat_data_falha'] || ''));
  const [ratDataAtendimento, setRatDataAtendimento] = useState(String(resp['rat_data_atendimento'] || ''));

  // Quando a garantia recarrega (carregar() no drawer), re-sincroniza os campos
  // com o banco — a não ser que o garantista esteja com edição em curso
  // (senão um "Salvar textos" depois do reload sobrescreveria com vazio os
  // textos que o servidor acabou de gerar/persistir).
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current) return;
    const r = (g.checklist_respostas as Record<string, unknown>) || {};
    setReclamacao(String(r['sg_reclamacao'] || ''));
    setDiagnostico(String(r['sg_diagnostico'] || ''));
    setAcao(String(r['sg_acao_tomada'] || ''));
    setObs(String(r['sg_observacoes'] || ''));
    setRatHorimetro(String(r['rat_horimetro'] || ''));
    setRatDataFalha(String(r['rat_data_falha'] || ''));
    setRatDataAtendimento(String(r['rat_data_atendimento'] || ''));
  }, [g.checklist_respostas]);

  // E-mail (preview) + fotos
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  const [fotos, setFotos] = useState<FotoDisponivel[]>([]);
  const [fotosSel, setFotosSel] = useState<Set<string>>(new Set());
  const [carregouPreview, setCarregouPreview] = useState(false);

  // NF de venda — candidatos da busca por chassi
  const [candidatosNF, setCandidatosNF] = useState<CandidatoNF[] | null>(null);

  const anexosRat = g.anexos.filter((a) => a.categoria === 'relatorio_at');
  const anexosNf = g.anexos.filter((a) => a.categoria === 'nf_venda');
  const temTextos = !!(reclamacao.trim() || diagnostico.trim());
  const jaEnviado = g.eventos?.find((e) => e.tipo === 'solicitacao_email_enviada') || null;

  const carregarPreview = useCallback(async () => {
    try {
      const res = await fetch(`/api/garantias/${g.id}/enviar-email-solicitacao`);
      const data = await res.json();
      if (!res.ok) return;
      setAssunto(data.assunto || '');
      setCorpo(data.corpo || '');
      setDestinatarios(data.destinatarios || []);
      setFotos(data.fotos || []);
      setFotosSel(new Set((data.fotos || []).map((f: FotoDisponivel) => f.chave)));
      setCarregouPreview(true);
    } catch { /* preview é conveniência */ }
  }, [g.id]);

  useEffect(() => {
    carregarPreview();
  }, [carregarPreview]);

  async function chamar(acao: string, fn: () => Promise<Response>): Promise<Record<string, unknown> | null> {
    setBusy(acao);
    setErro('');
    setAviso('');
    try {
      const res = await fn();
      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('application/pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        return {};
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro((data as { error?: string }).error || 'Falha na operação.');
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      setErro('Erro de conexão.');
      return null;
    } finally {
      setBusy('');
    }
  }

  // ── Textos (Tratorilson) ───────────────────────────────────────────────────
  const gerarTextos = async (forcar: boolean) => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    const data = await chamar('tratorilson', () =>
      fetch(`/api/garantias/${g.id}/formatar-textos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ator: userName, forcar }),
      })
    );
    const textos = data?.textos as { reclamacao?: string; diagnostico?: string; acao_tomada?: string; observacoes?: string } | undefined;
    if (textos) {
      dirty.current = false;
      setReclamacao(textos.reclamacao || '');
      setDiagnostico(textos.diagnostico || '');
      setAcao(textos.acao_tomada || '');
      setObs(textos.observacoes || '');
      setAviso('Textos formatados pelo Tratorilson — revise antes de enviar.');
      onChange();
    }
  };

  // Persiste os textos/campos locais no banco. Reusado pelo botão "Salvar
  // textos" E pelo envio do e-mail — o que está na TELA é o que vai no e-mail.
  const persistirTextos = async (acaoLabel: string): Promise<boolean> => {
    const data = await chamar(acaoLabel, () =>
      fetch(`/api/garantias/${g.id}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist_respostas: {
            ...((g.checklist_respostas as Record<string, unknown>) || {}),
            sg_reclamacao: reclamacao,
            sg_diagnostico: diagnostico,
            sg_acao_tomada: acao,
            sg_observacoes: obs,
            rat_horimetro: ratHorimetro,
            rat_data_falha: ratDataFalha,
            rat_data_atendimento: ratDataAtendimento,
          },
          garantista_nome: userName,
        }),
      })
    );
    if (data) dirty.current = false;
    return !!data;
  };

  const salvarTextos = async () => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    const ok = await persistirTextos('salvar_textos');
    if (ok) {
      setAviso('Textos salvos.');
      onChange();
    }
  };

  // ── RAT ────────────────────────────────────────────────────────────────────
  const gerarRAT = async (modo: 'preenchido' | 'imprimir') => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    const data = await chamar(`rat_${modo}`, () =>
      fetch(`/api/garantias/${g.id}/relatorio-assistencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ator: userName,
          modo,
          campos: {
            rat_horimetro: ratHorimetro,
            rat_data_falha: ratDataFalha,
            rat_data_atendimento: ratDataAtendimento,
            rat_reclamacao: reclamacao,
            rat_diagnostico: diagnostico,
            rat_acao: acao,
            rat_obs: obs,
          },
        }),
      })
    );
    if (data && modo === 'preenchido') {
      setAviso('RAT gerado e anexado à garantia.');
      onChange();
    }
  };

  // ── NF de venda ────────────────────────────────────────────────────────────
  const buscarNF = async () => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    const data = await chamar('nf_buscar', () => fetch(`/api/garantias/${g.id}/nf-venda`));
    if (data) {
      const lista = (data.candidatos as CandidatoNF[]) || [];
      setCandidatosNF(lista);
      if (lista.length === 0) setAviso('Nenhuma NF encontrada pelo chassi — anexe manualmente.');
    }
  };

  const anexarNF = async (c: CandidatoNF) => {
    if (!podeAnalisar) { setErro(MSG_SEM_PERMISSAO); return; }
    const data = await chamar('nf_anexar', () =>
      fetch(`/api/garantias/${g.id}/nf-venda`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: c.link, numero: c.numero, ator: userName }),
      })
    );
    if (data) {
      setCandidatosNF(null);
      setAviso('NF de venda anexada.');
      onChange();
    }
  };

  // ── Envio ──────────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!podeEnviarFabrica) { setErro(MSG_SEM_PERMISSAO); return; }
    const faltando: string[] = [];
    if (anexosRat.length === 0) faltando.push('RAT');
    if (anexosNf.length === 0) faltando.push('NF de venda');
    if (faltando.length > 0) {
      const ok = confirm(`Ainda sem: ${faltando.join(' e ')}.\n\nEnviar o e-mail mesmo assim?`);
      if (!ok) return;
    }
    // O relato que está NA TELA precisa estar no banco antes do envio — é de
    // lá que o servidor monta o bloco "Relato técnico" do e-mail.
    const salvou = await persistirTextos('enviar');
    if (!salvou) {
      setErro('Não consegui salvar os textos antes do envio — tente de novo.');
      return;
    }
    const data = await chamar('enviar', () =>
      fetch(`/api/garantias/${g.id}/enviar-email-solicitacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ator: userName,
          fotosSelecionadas: [...fotosSel],
          assuntoOverride: assunto,
          corpoOverride: corpo,
        }),
      })
    );
    if (data) {
      setAviso('E-mail de solicitação enviado à fábrica.');
      onChange();
    }
  };

  const Badge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
        background: ok ? '#ECFDF5' : '#FEF2F2',
        color: ok ? '#047857' : '#B91C1C',
      }}
    >
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );

  return (
    <div
      style={{
        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        <Mail size={14} />
        Solicitação de garantia por e-mail — {g.montadora?.nome}
      </div>

      {erro && (
        <div style={{ fontSize: 12, color: '#dc2626', background: '#dc262615', padding: '8px 10px', borderRadius: 8 }}>{erro}</div>
      )}
      {aviso && (
        <div style={{ fontSize: 12, color: '#047857', background: '#04785715', padding: '8px 10px', borderRadius: 8 }}>{aviso}</div>
      )}

      {/* Prontidão */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Badge ok={temTextos} label="Relato" />
        <Badge ok={anexosRat.length > 0} label="RAT" />
        <Badge ok={anexosNf.length > 0} label="NF de venda" />
        <Badge ok={destinatarios.length > 0} label="Destinatários" />
      </div>

      {finalizada && (
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', background: 'var(--portal-bg-secondary)', padding: '8px 10px', borderRadius: 8 }}>
          Garantia finalizada — relato, RAT e NF ficam congelados (só leitura).
        </div>
      )}

      {/* Relato (Tratorilson) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={label11}>Relato técnico (entra no e-mail e no RAT)</span>
          {!finalizada && (
            <button
              type="button"
              onClick={() => gerarTextos(temTextos)}
              disabled={!!busy}
              style={btnGhost(!!busy)}
            >
              {busy === 'tratorilson' ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
              {temTextos ? 'Regerar com o Tratorilson' : 'Gerar com o Tratorilson'}
            </button>
          )}
        </div>
        <textarea value={reclamacao} onChange={(e) => { dirty.current = true; setReclamacao(e.target.value); }} readOnly={finalizada} rows={2} placeholder="Reclamação do cliente" style={taStyle} />
        <textarea value={diagnostico} onChange={(e) => { dirty.current = true; setDiagnostico(e.target.value); }} readOnly={finalizada} rows={2} placeholder="Diagnóstico técnico" style={taStyle} />
        <textarea value={acao} onChange={(e) => { dirty.current = true; setAcao(e.target.value); }} readOnly={finalizada} rows={2} placeholder="Ação corretiva" style={taStyle} />
        <textarea value={obs} onChange={(e) => { dirty.current = true; setObs(e.target.value); }} readOnly={finalizada} rows={1} placeholder="Observações (opcional)" style={taStyle} />
        {!finalizada && (
          <button type="button" onClick={salvarTextos} disabled={!!busy} style={btnGhost(!!busy)}>
            {busy === 'salvar_textos' ? <Loader2 size={13} className="spin" /> : null}
            Salvar textos
          </button>
        )}
      </div>

      {/* RAT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--portal-border)', paddingTop: 10 }}>
        <span style={label11}>Relatório de Assistência Técnica (RAT)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 110px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>Horímetro</span>
            <input value={ratHorimetro} onChange={(e) => { dirty.current = true; setRatHorimetro(e.target.value); }} readOnly={finalizada} placeholder="Ex.: 320h" style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 110px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>Data da falha</span>
            <input value={ratDataFalha} onChange={(e) => { dirty.current = true; setRatDataFalha(e.target.value); }} readOnly={finalizada} placeholder="dd/mm/aaaa" style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 110px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--portal-text-faint)' }}>Data do atendimento</span>
            <input value={ratDataAtendimento} onChange={(e) => { dirty.current = true; setRatDataAtendimento(e.target.value); }} readOnly={finalizada} placeholder="dd/mm/aaaa" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!finalizada && (
            <button type="button" onClick={() => gerarRAT('preenchido')} disabled={!!busy} style={{ ...btnGhost(!!busy), flex: 1 }}>
              {busy === 'rat_preenchido' ? <Loader2 size={13} className="spin" /> : <FileText size={13} />}
              Gerar PDF preenchido
            </button>
          )}
          <button
            type="button"
            onClick={() => gerarRAT('imprimir')}
            disabled={!!busy}
            title="Gera o PDF com os dados fixos e áreas em branco pra preencher à mão — depois anexe o escaneado"
            style={{ ...btnGhost(!!busy), flex: 1 }}
          >
            {busy === 'rat_imprimir' ? <Loader2 size={13} className="spin" /> : <Printer size={13} />}
            Imprimir pra preencher à mão
          </button>
        </div>
        <GarantiaAnexos
          garantiaId={g.id}
          anexos={anexosRat}
          uploadCategoria={finalizada ? undefined : 'relatorio_at'}
          enviadoPor={userName}
          onChange={onChange}
          vazioTexto="Nenhum RAT ainda — gere o PDF ou anexe o escaneado preenchido à mão."
        />
      </div>

      {/* NF de venda */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--portal-border)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={label11}>NF de venda do equipamento</span>
          {!finalizada && (
            <button type="button" onClick={buscarNF} disabled={!!busy || !g.chassis} title={!g.chassis ? 'Garantia sem chassi' : undefined} style={btnGhost(!!busy || !g.chassis)}>
              {busy === 'nf_buscar' ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
              Buscar NF pelo chassi
            </button>
          )}
        </div>
        {candidatosNF !== null && candidatosNF.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {candidatosNF.slice(0, 6).map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  padding: '6px 8px', borderRadius: 8,
                  background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
                }}
              >
                <span style={{ flex: 1, color: 'var(--portal-text)' }}>
                  <strong>{c.tipo}</strong> {c.numero ? `nº ${c.numero}` : ''} · {c.origem}
                  {c.valor ? ` · ${c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}
                </span>
                <a href={c.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600 }}>Abrir</a>
                <button type="button" onClick={() => anexarNF(c)} disabled={!!busy} style={{ ...btnGhost(!!busy), padding: '4px 8px', fontSize: 11 }}>
                  {busy === 'nf_anexar' ? <Loader2 size={11} className="spin" /> : 'Anexar esta'}
                </button>
              </div>
            ))}
          </div>
        )}
        <GarantiaAnexos
          garantiaId={g.id}
          anexos={anexosNf}
          uploadCategoria={finalizada ? undefined : 'nf_venda'}
          enviadoPor={userName}
          onChange={onChange}
          vazioTexto="Nenhuma NF anexada — busque pelo chassi ou anexe o PDF."
        />
      </div>

      {/* Fotos da OS */}
      {!finalizada && fotos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--portal-border)', paddingTop: 10 }}>
          <span style={label11}>
            <Camera size={11} style={{ marginRight: 4 }} />
            Fotos que vão no e-mail ({fotosSel.size} de {fotos.length})
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6 }}>
            {fotos.map((f) => {
              const sel = fotosSel.has(f.chave);
              return (
                <label
                  key={f.chave}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
                    border: `2px solid ${sel ? '#0d9488' : 'var(--portal-border)'}`,
                    borderRadius: 8, padding: 3, background: 'var(--portal-bg-secondary)',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.label} style={{ width: '100%', height: 56, objectFit: 'cover', borderRadius: 5, opacity: sel ? 1 : 0.5 }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--portal-text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() =>
                        setFotosSel((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.chave)) n.delete(f.chave); else n.add(f.chave);
                          return n;
                        })
                      }
                    />
                    {f.label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview do e-mail + envio */}
      {!finalizada && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px dashed var(--portal-border)', paddingTop: 10 }}>
        <span style={label11}>E-mail (revise antes de enviar)</span>
        {carregouPreview ? (
          <>
            <input value={assunto} onChange={(e) => setAssunto(e.target.value)} style={inputStyle} />
            <span style={{ fontSize: 10.5, color: 'var(--portal-text-faint)' }}>
              O número da garantia ({g.numero}) é mantido no assunto pra rastrearmos a resposta da fábrica.
            </span>
            <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={3} style={taStyle} />
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Carregando preview…</span>
        )}
        {destinatarios.length > 0 ? (
          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
            Para: {destinatarios.join(', ')} · o relato técnico, os vídeos (como link) e a assinatura entram automaticamente.
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#dc2626' }}>
            Cadastre os e-mails da fábrica em Montadoras → {g.montadora?.nome} para liberar o envio.
          </span>
        )}
        {jaEnviado && (
          <span style={{ fontSize: 11, color: '#047857' }}>
            Já enviado em {fmtDataHora(jaEnviado.created_at)}.
          </span>
        )}
        {!naFabrica && (
          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
            O envio fica disponível quando a garantia for enviada à fábrica.
          </span>
        )}
        <button
          onClick={enviar}
          disabled={!!busy || !naFabrica || !podeEnviarFabrica || destinatarios.length === 0}
          title={!podeEnviarFabrica ? MSG_SEM_PERMISSAO : undefined}
          style={btn('linear-gradient(135deg,#dc2626,#7f1d1d)', !!busy || !naFabrica || !podeEnviarFabrica || destinatarios.length === 0)}
        >
          {busy === 'enviar' ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
          {jaEnviado ? 'Reenviar e-mail de solicitação' : 'Enviar solicitação por e-mail'}
        </button>
      </div>
      )}
    </div>
  );
}
