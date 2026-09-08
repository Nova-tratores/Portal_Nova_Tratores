'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// /lead — captura de lead no estande, pelo celular.
//
// Regras que vieram do campo, não do desenho:
//  * TEXTO é o único campo obrigatório. Quem está de pé numa feira não preenche
//    formulário; escreve "quer trator 75cv, volta amanhã" e segue.
//  * FILA OFFLINE: sinal de feira cai. POST que falha entra no localStorage e
//    é reenviado sozinho quando a rede volta. Perder um lead por falta de sinal
//    é o pior resultado possível.
//  * Duplicata AVISA, nunca bloqueia: três vendedores anotam o mesmo visitante.
//  * fontSize >= 16 em todo input, senão o iPhone dá zoom ao focar.
//
// Deep-link: /lead?acao=<uuid> — o QR do banner do estande já abre na ação certa.
// =============================================================================
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, Check, CloudOff, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { TEMPERATURAS } from '@/lib/marketing/tipos';
import {
  apiGet, apiEnviar, estiloInput, BotaoRosa, Campo, ROSA, ROSA_CLARO, ROSA_ESCURO,
  AvisoMigracao, Erro,
} from '@/components/marketing/ui';

const FILA = 'marketing-leads-fila';

interface AcaoCurta { id: string; nome: string; cidade: string | null; uf: string | null; data_inicio: string | null }
interface ClienteAchado { cod_cli: number; empresa: string; nome: string; cidade: string | null; documento: string | null }

// useSearchParams (o deep-link ?acao= do QR do estande) exige um limite de
// Suspense, senão a página inteira vira renderização dinâmica no build.
export default function LeadPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Carregando…</div>}>
      <CapturaLead />
    </Suspense>
  );
}

function CapturaLead() {
  const params = useSearchParams();
  const { userProfile } = useAuth();
  const { temAcesso, loading } = usePermissoes(userProfile?.id);

  const [acoes, setAcoes] = useState<AcaoCurta[]>([]);
  const [acaoId, setAcaoId] = useState('');
  const [migracao, setMigracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [salvos, setSalvos] = useState(0);
  const [naFila, setNaFila] = useState(0);
  const [avisoFoto, setAvisoFoto] = useState(false);
  const [maisDetalhes, setMais] = useState(false);

  const [texto, setTexto] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cidade, setCidade] = useState('');
  const [interesse, setInteresse] = useState('');
  const [temperatura, setTemperatura] = useState('');
  const [foto, setFoto] = useState<File | null>(null);

  const [buscaCli, setBuscaCli] = useState('');
  const [achados, setAchados] = useState<ClienteAchado[]>([]);
  const [cliente, setCliente] = useState<ClienteAchado | null>(null);

  const [jaCapturados, setJaCapturados] = useState<{ telefone_norm: string | null; nome: string | null; capturado_por_nome: string | null; capturado_em: string }[]>([]);
  const inputFoto = useRef<HTMLInputElement>(null);

  // ── Fila offline ───────────────────────────────────────────────────────────
  const lerFila = (): any[] => {
    try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch { return []; }
  };
  const gravarFila = (f: any[]) => {
    try { localStorage.setItem(FILA, JSON.stringify(f)); } catch { /* cota cheia: segue */ }
    setNaFila(f.length);
  };

  const drenarFila = useCallback(async () => {
    const fila = lerFila();
    if (fila.length === 0) return;
    const restantes: any[] = [];
    for (const item of fila) {
      try { await apiEnviar('/api/marketing/leads', 'POST', item); }
      catch { restantes.push(item); }
    }
    gravarFila(restantes);
    if (restantes.length < fila.length) setSalvos((n) => n + (fila.length - restantes.length));
  }, []);

  useEffect(() => {
    setNaFila(lerFila().length);
    drenarFila();
    const aoVoltar = () => drenarFila();
    window.addEventListener('online', aoVoltar);
    return () => window.removeEventListener('online', aoVoltar);
  }, [drenarFila]);

  // ── Ações disponíveis ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await apiGet<any>('/api/marketing/acoes-abertas');
        const lista: AcaoCurta[] = r.acoes ?? [];
        setAcoes(lista);
        const doLink = params?.get('acao');
        if (doLink && lista.some((a) => a.id === doLink)) setAcaoId(doLink);
        else if ((r.agora ?? []).length === 1) setAcaoId(r.agora[0]);
        else if (lista.length === 1) setAcaoId(lista[0].id);
      } catch (e: any) {
        if (e?.corpo?.migracaoFaltando) setMigracao(true);
        else if (e?.status !== 403) setErro(e?.message || 'Não foi possível carregar as ações.');
      }
    })();
  }, [params]);

  // Leads já anotados na ação — base do aviso de duplicata.
  useEffect(() => {
    if (!acaoId) { setJaCapturados([]); return; }
    (async () => {
      try {
        const r = await apiGet<any>(`/api/marketing/leads?acao_id=${acaoId}`);
        setJaCapturados(r.itens ?? []);
      } catch { setJaCapturados([]); }
    })();
  }, [acaoId, salvos]);

  // ── Busca de cliente (opcional) ────────────────────────────────────────────
  useEffect(() => {
    const t = buscaCli.trim();
    if (t.length < 3) { setAchados([]); return; }
    let vivo = true;
    const timer = setTimeout(async () => {
      try {
        const r = await apiGet<any>(`/api/marketing/clientes/buscar?q=${encodeURIComponent(t)}`);
        if (vivo) setAchados(r.clientes ?? []);
      } catch { if (vivo) setAchados([]); }
    }, 350);
    return () => { vivo = false; clearTimeout(timer); };
  }, [buscaCli]);

  // ── Duplicata (aviso, nunca bloqueio) ──────────────────────────────────────
  const digitos = telefone.replace(/\D/g, '');
  const duplicado = digitos.length >= 8
    ? jaCapturados.find((l) => l.telefone_norm && l.telefone_norm === digitos)
    : undefined;

  const limpar = () => {
    setTexto(''); setNome(''); setTelefone(''); setCidade(''); setInteresse('');
    setTemperatura(''); setFoto(null); setCliente(null); setBuscaCli(''); setAchados([]);
    setMais(false); setAvisoFoto(false);
    if (inputFoto.current) inputFoto.current.value = '';
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!acaoId) { setErro('Escolha a ação.'); return; }
    if (!texto.trim()) { setErro('Escreva o que o visitante quer.'); return; }

    setEnviando(true);
    setAvisoFoto(false);

    // A foto sobe DIRETO pro storage com a anon key (o bucket `anexos` é
    // público). Se falhar, o lead vai sem foto — nunca se perde o contato.
    let foto_url: string | null = null;
    if (foto) {
      try {
        const arq = `marketing/leads/${Date.now()}-${foto.name.replace(/[^a-zA-Z0-9.-]/g, '_') || 'foto.jpg'}`;
        const { error } = await supabase.storage.from('anexos').upload(arq, foto);
        if (error) throw error;
        foto_url = supabase.storage.from('anexos').getPublicUrl(arq).data.publicUrl;
      } catch {
        setAvisoFoto(true);
      }
    }

    const payload: any = {
      acao_id: acaoId,
      texto: texto.trim(),
      nome: nome.trim() || null,
      telefone: telefone.trim() || null,
      cidade: cidade.trim() || null,
      interesse: interesse.trim() || null,
      temperatura: temperatura || null,
      foto_url,
      cliente_cod_cli: cliente?.cod_cli ?? null,
      cliente_empresa: cliente?.empresa ?? null,
      cliente_nome: cliente?.nome ?? null,
    };

    try {
      await apiEnviar('/api/marketing/leads', 'POST', payload);
      setSalvos((n) => n + 1);
      limpar();
    } catch (err: any) {
      if (err?.status === 400 || err?.status === 403) {
        setErro(err?.message || 'Não foi possível salvar.');
      } else {
        // Rede caiu ou o servidor não respondeu: guarda pra depois. A foto não
        // é serializável, então o lead enfileirado vai sem ela.
        const semFoto = { ...payload, foto_url: null };
        gravarFila([...lerFila(), semFoto]);
        limpar();
        setAvisoFoto(!!foto);
        setErro('Sem conexão agora. O lead ficou guardado no aparelho e vai sozinho quando a rede voltar.');
      }
    } finally {
      setEnviando(false);
    }
  };

  if (!loading && userProfile && !temAcesso('lead') && !temAcesso('marketing')) return <SemPermissao />;
  if (migracao) return <AvisoMigracao />;

  const acaoEscolhida = acoes.find((a) => a.id === acaoId);

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)', background: 'var(--portal-bg)' }}>
      <div style={{ background: `linear-gradient(135deg, ${ROSA_CLARO}, ${ROSA_ESCURO})`, padding: '14px 16px' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#111111' }}>Captura de Leads</div>
        <div style={{ fontSize: 12, color: '#111111', opacity: 0.8 }}>
          Anote o contato e siga. Só o texto é obrigatório.
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {naFila > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111', fontSize: 13 }}>
            <CloudOff size={18} />
            <span style={{ flex: 1 }}>
              <b>{naFila}</b> lead(s) aguardando envio.
            </span>
            <button
              onClick={drenarFila}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', fontSize: 13, fontWeight: 700, borderRadius: 3, border: 'none', background: '#f59e0b', color: '#111111', cursor: 'pointer' }}
            >
              <RefreshCw size={14} /> Tentar agora
            </button>
          </div>
        )}

        {salvos > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 4, border: '1px solid #16a34a', background: '#f0fdf4', color: '#111111', fontSize: 13 }}>
            <Check size={18} /> <b>{salvos}</b> lead(s) registrado(s) nesta sessão.
          </div>
        )}

        {avisoFoto && (
          <div style={{ padding: 12, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111', fontSize: 13 }}>
            A foto deste lead não foi enviada. O contato foi salvo do mesmo jeito.
          </div>
        )}

        {erro && <Erro>{erro}</Erro>}

        <form onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Campo label="Ação / evento" largura="1 1 100%">
            <select style={estiloInput} value={acaoId} onChange={(e) => setAcaoId(e.target.value)}>
              <option value="">— escolher —</option>
              {acoes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}{a.cidade ? ` · ${a.cidade}` : ''}
                </option>
              ))}
            </select>
          </Campo>
          {acaoEscolhida && (
            <div style={{ marginTop: -8, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
              Capturando para <b>{acaoEscolhida.nome}</b>.
            </div>
          )}

          <Campo label="O que o visitante quer *" largura="1 1 100%">
            <textarea
              rows={4}
              style={{ ...estiloInput, resize: 'vertical' }}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: quer trator 75cv com carregadeira, volta amanhã de tarde"
              required
            />
          </Campo>

          <div>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputFoto.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
                padding: '14px', fontSize: 15, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
                border: `1px dashed ${ROSA}`, background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
              }}
            >
              <Camera size={20} /> {foto ? foto.name.slice(0, 28) : 'Foto do cartão ou do crachá (opcional)'}
            </button>
            {foto && (
              <button
                type="button"
                onClick={() => { setFoto(null); if (inputFoto.current) inputFoto.current.value = ''; }}
                style={{ marginTop: 6, fontSize: 12, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
              >
                Tirar a foto
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Campo label="Nome"><input style={estiloInput} value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Campo label="Telefone">
              <input
                style={estiloInput}
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(14) 99999-9999"
              />
            </Campo>
          </div>

          {duplicado && (
            <div style={{ padding: 10, borderRadius: 4, border: '1px solid #f59e0b', background: '#fffbeb', color: '#111111', fontSize: 13 }}>
              Esse telefone já foi anotado
              {duplicado.capturado_por_nome ? ` por ${duplicado.capturado_por_nome}` : ''}
              {duplicado.nome ? ` (${duplicado.nome})` : ''}. Pode salvar assim mesmo.
            </div>
          )}

          <button
            type="button"
            onClick={() => setMais((v) => !v)}
            style={{ alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', color: ROSA, cursor: 'pointer', padding: 0 }}
          >
            {maisDetalhes ? '− Menos detalhes' : '+ Mais detalhes'}
          </button>

          {maisDetalhes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, border: '1px solid var(--portal-border)', borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <Campo label="Cidade"><input style={estiloInput} value={cidade} onChange={(e) => setCidade(e.target.value)} /></Campo>
                <Campo label="Interesse"><input style={estiloInput} value={interesse} onChange={(e) => setInteresse(e.target.value)} placeholder="Modelo, implemento…" /></Campo>
              </div>
              <Campo label="Temperatura" largura="1 1 100%">
                <select style={estiloInput} value={temperatura} onChange={(e) => setTemperatura(e.target.value)}>
                  <option value="">— não sei —</option>
                  {TEMPERATURAS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </Campo>

              <Campo label="Já é cliente?" ajuda="Opcional. A maioria numa feira ainda não é." largura="1 1 100%">
                {cliente ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', border: '1px solid var(--portal-border)', borderRadius: 3, fontSize: 14, color: 'var(--portal-text)' }}>
                    <span style={{ flex: 1 }}>{cliente.nome} · {cliente.empresa}</span>
                    <button type="button" onClick={() => { setCliente(null); setBuscaCli(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: 9, top: 12, opacity: 0.5 }} />
                    <input
                      style={{ ...estiloInput, paddingLeft: 30 }}
                      value={buscaCli}
                      onChange={(e) => setBuscaCli(e.target.value)}
                      placeholder="Nome ou CNPJ/CPF"
                    />
                  </div>
                )}
              </Campo>

              {achados.length > 0 && !cliente && (
                <div style={{ border: '1px solid var(--portal-border)', borderRadius: 3, maxHeight: 200, overflowY: 'auto' }}>
                  {achados.map((c) => (
                    <button
                      key={`${c.empresa}-${c.cod_cli}`}
                      type="button"
                      onClick={() => { setCliente(c); setAchados([]); if (!nome) setNome(c.nome); if (!cidade && c.cidade) setCidade(c.cidade); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', fontSize: 14, border: 'none', borderBottom: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}
                    >
                      {c.nome}
                      <span style={{ opacity: 0.6, fontSize: 12 }}> · {c.empresa}{c.cidade ? ` · ${c.cidade}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <BotaoRosa tipo="submit" disabled={enviando || !texto.trim()} style={{ padding: '15px', fontSize: 16 }}>
            {enviando ? 'Salvando…' : 'Salvar lead'}
          </BotaoRosa>
        </form>
      </div>
    </div>
  );
}
