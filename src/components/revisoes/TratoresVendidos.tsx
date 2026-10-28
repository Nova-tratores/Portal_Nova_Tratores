'use client';
// Tratores vendidos recentemente (/revisoes/vendidos): cada trator das notas de
// "Trator Novo", quantos dias faz da venda (marcos de 30, 60 e 90 dias), se já
// está no controle de revisões e, ao clicar, tudo do cliente: contato, onde fica
// (mapa), a nota e as revisões. Visual: estilo POS NewPortal (docs/estilo-pos-newportal.md).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { fetchAuth } from '@/lib/auth/client';
import FotoMaquina from '@/components/comum/FotoMaquina';
import MapaLocais from '@/components/comum/MapaLocais';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import { pdfDoCertificado } from '@/lib/mahindra/certificados';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { ROTULO_FASE, type Fase } from '@/lib/revisoes/vendidos';
import type { TratorVendido } from '@/lib/revisoes/vendidos-server';
import type { AtendimentoRadar } from '@/lib/revisoes/contatos-radar';
import type { CtxAtendimento } from '@/components/feedbacks/tratores/RoteiroLigacao';
import RegistroAtendimento from '@/components/feedbacks/tratores/RegistroAtendimento';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(iso)) return iso.slice(0, 10);
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
};
const diaMes = (iso: string) => dataBR(iso).slice(0, 5);
const finalChassi = (c: string | null) => (c ? c.slice(-7) : '—');

const COR = { azul: '#2563EB', verde: '#16A34A', ambar: '#D97706', vermelho: '#DC2626', roxo: '#7C3AED', cinza: '#64748B' };
const COR_FASE: Record<Fase, string> = { antes: COR.cinza, fez30: COR.azul, fez60: COR.roxo, fez90: COR.verde };
const MESES = [3, 6, 12, 24];

type Filtro = 'todos' | 'semana' | 'fora' | 'sem50' | Fase;

export default function TratoresVendidos() {
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeControle = pode('revisoes', 'tratores');

  const [meses, setMeses] = useState(6);
  const [seminovos, setSeminovos] = useState(false);
  const [lista, setLista] = useState<TratorVendido[] | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<TratorVendido | null>(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const r = await fetchAuth(`/api/revisoes/vendidos?meses=${meses}&seminovos=${seminovos ? 1 : 0}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui ler as vendas.');
      setLista(j.tratores);
      setAberto((a) => (a ? (j.tratores as TratorVendido[]).find((t) => t.chave === a.chave) || null : null));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); }
  }, [meses, seminovos]);
  useEffect(() => { setLista(null); void carregar(); }, [carregar]);

  const sem50 = (t: TratorVendido) => !!t.controle && !t.controle.revisoes.some((r) => r.horas === 50);
  const contas = useMemo(() => {
    const l = lista || [];
    return {
      todos: l.length,
      semana: l.filter((t) => t.marcoSemana).length,
      fora: l.filter((t) => !t.controle).length,
      sem50: l.filter(sem50).length,
      antes: l.filter((t) => t.fase === 'antes').length,
      fez30: l.filter((t) => t.fase === 'fez30').length,
      fez60: l.filter((t) => t.fase === 'fez60').length,
      fez90: l.filter((t) => t.fase === 'fez90').length,
    };
  }, [lista]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista || []).filter((t) => {
      if (filtro === 'semana' && !t.marcoSemana) return false;
      if (filtro === 'fora' && t.controle) return false;
      if (filtro === 'sem50' && !sem50(t)) return false;
      if ((['antes', 'fez30', 'fez60', 'fez90'] as string[]).includes(filtro) && t.fase !== filtro) return false;
      if (!q) return true;
      return [t.cliente?.nome, t.cliente?.cidade, t.modelo, t.chassi, t.nota?.numero, t.pedido, t.vendedor].some((x) => String(x || '').toLowerCase().includes(q));
    });
  }, [lista, filtro, busca]);

  return (
    <div className="tv-vn">
      <style>{ESTILO_TV}</style>
      <div className="tv-topo">
        <Link href="/revisoes" className="tv-btn"><i className="fa-solid fa-arrow-left" /> Controle Revisões</Link>
        <div className="tv-seg" role="group" aria-label="Período">
          {MESES.map((m) => (
            <button key={m} type="button" className={m === meses ? 'on' : ''} onClick={() => setMeses(m)}>{m} meses</button>
          ))}
        </div>
        <label className="tv-check"><input type="checkbox" checked={seminovos} onChange={(e) => setSeminovos(e.target.checked)} /> Incluir seminovos</label>
        <div className="tv-busca">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Cliente, cidade, modelo, chassi, nota…" />
        </div>
      </div>

      <div className="tv-kpis">
        <Kpi cor={COR.azul} icone="fa-tractor" rotulo="Vendidos no período" valor={contas.todos} on={filtro === 'todos'} onClick={() => setFiltro('todos')} />
        <Kpi cor={COR.roxo} icone="fa-phone" rotulo="Fizeram 30, 60 ou 90 dias esta semana" valor={contas.semana} on={filtro === 'semana'} onClick={() => setFiltro('semana')} pulsa={contas.semana > 0} />
        <Kpi cor={COR.vermelho} icone="fa-clipboard-question" rotulo="Fora do controle de revisões" valor={contas.fora} on={filtro === 'fora'} onClick={() => setFiltro('fora')} />
        <Kpi cor={COR.ambar} icone="fa-wrench" rotulo="No controle, sem a 50 h" valor={contas.sem50} on={filtro === 'sem50'} onClick={() => setFiltro('sem50')} />
      </div>

      <div className="tv-fases">
        {(['antes', 'fez30', 'fez60', 'fez90'] as Fase[]).map((f) => (
          <button key={f} type="button" className={`tv-fase ${filtro === f ? 'on' : ''}`} style={{ ['--c' as string]: COR_FASE[f] } as React.CSSProperties} onClick={() => setFiltro(filtro === f ? 'todos' : f)}>
            {ROTULO_FASE[f]} <span>{contas[f]}</span>
          </button>
        ))}
      </div>

      {erro && <div className="tv-aviso">{erro}</div>}
      {lista === null ? (
        <div className="tv-vazio"><i className="fa-solid fa-spinner fa-spin" /> Lendo as notas de trator…</div>
      ) : visiveis.length === 0 ? (
        <div className="tv-vazio">Nenhum trator {filtro !== 'todos' || busca ? 'com esse filtro' : 'vendido nesse período'}.</div>
      ) : (
        <div className="tv-grade">
          {visiveis.map((t) => <Cartao key={t.chave} t={t} onAbrir={() => setAberto(t)} />)}
        </div>
      )}

      {aberto && <Ficha t={aberto} podeControle={podeControle} meses={meses} seminovos={seminovos} onFechar={() => setAberto(null)} onMudou={carregar} />}
    </div>
  );
}

function Kpi({ cor, icone, rotulo, valor, on, onClick, pulsa }: { cor: string; icone: string; rotulo: string; valor: number; on: boolean; onClick: () => void; pulsa?: boolean }) {
  return (
    <button type="button" className={`tv-card tv-kpi ${on ? 'on' : ''}`} style={{ ['--c' as string]: cor } as React.CSSProperties} onClick={onClick}>
      <span className={`tv-ico ${pulsa ? 'tv-pulsa' : ''}`}><i className={`fa-solid ${icone}`} /></span>
      <span>
        <span className="tv-num">{valor}</span>
        <span className="tv-rot">{rotulo}</span>
      </span>
    </button>
  );
}

/** Régua da venda até 90 dias, com os três marcos. */
function Regua({ t }: { t: TratorVendido }) {
  const pct = Math.min(100, (t.dias / 90) * 100);
  return (
    <div className="tv-regua" style={{ ['--c' as string]: COR_FASE[t.fase] } as React.CSSProperties}>
      <div className="tv-regua-barra"><span style={{ width: `${pct}%` }} /></div>
      {t.marcos.map((m) => (
        <span key={m.dias} className={`tv-marco ${m.passou ? 'ok' : ''} ${t.marcoSemana === m.dias ? 'agora' : ''}`} style={{ left: `${(m.dias / 90) * 100}%` }}
          title={m.passou ? `Fez ${m.dias} dias em ${dataBR(m.data)}` : `Faz ${m.dias} dias em ${dataBR(m.data)} (daqui a ${m.diasFalta} dia${m.diasFalta === 1 ? '' : 's'})`}>
          <i />
          <small>{m.dias} d · {diaMes(m.data)}</small>
        </span>
      ))}
    </div>
  );
}

function SeloControle({ t }: { t: TratorVendido }) {
  if (!t.controle) return <span className="tv-pilula" style={{ ['--c' as string]: COR.vermelho } as React.CSSProperties}><i className="fa-solid fa-circle-exclamation" /> Fora do controle de revisões</span>;
  const ult = t.controle.revisoes[t.controle.revisoes.length - 1];
  return (
    <>
      {ult
        ? <span className="tv-pilula" style={{ ['--c' as string]: COR.verde } as React.CSSProperties}><i className="fa-solid fa-check" /> {ult.horas} h feita em {dataBR(ult.data)}</span>
        : <span className="tv-pilula" style={{ ['--c' as string]: COR.ambar } as React.CSSProperties}><i className="fa-solid fa-wrench" /> Ainda sem a 50 h</span>}
      {t.controle.previsao?.data && (
        <span className="tv-pilula" style={{ ['--c' as string]: COR.cinza } as React.CSSProperties}>Próxima: {t.controle.previsao.revisao} h ~{dataBR(t.controle.previsao.data)}</span>
      )}
    </>
  );
}

function Cartao({ t, onAbrir }: { t: TratorVendido; onAbrir: () => void }) {
  const cor = COR_FASE[t.fase];
  return (
    <button type="button" className={`tv-card tv-trator clicavel ${t.marcoSemana ? 'tv-pulsa' : ''}`} style={{ ['--c' as string]: cor } as React.CSSProperties} onClick={onAbrir}>
      <div className="tv-trator-topo">
        <FotoMaquina modelo={t.modelo} chassi={t.chassi} largura={76} altura={56} cor={cor} />
        <span style={{ minWidth: 0 }}>
          <span className="tv-etq">{t.nota ? <><small>NF</small> {t.nota.numero}</> : <><small>PV</small> {t.pedido}</>}</span>
          <span className="tv-modelo">{t.modelo}</span>
        </span>
        <span className="tv-dias"><b>{t.dias}</b><small>dias</small></span>
      </div>
      <div className="tv-cliente">{t.cliente?.nome || 'Cliente não achado no cadastro'}</div>
      <div className="tv-sub">
        <span><i className="fa-solid fa-location-dot" /> {t.cliente?.cidade || '—'}</span>
        <span><i className="fa-solid fa-barcode" /> …{finalChassi(t.chassi)}</span>
        <span><i className="fa-regular fa-calendar" /> {dataBR(t.dataVenda)}</span>
        {t.chegada && <span title="Da chegada da fábrica até a venda"><i className="fa-solid fa-warehouse" /> {t.chegada.diasEstoque} d no pátio</span>}
      </div>
      <Regua t={t} />
      <div className="tv-selos">
        {t.marcoSemana && <span className="tv-pilula" style={{ ['--c' as string]: COR.roxo } as React.CSSProperties}><i className="fa-solid fa-phone" /> Fez {t.marcoSemana} dias esta semana</span>}
        <SeloControle t={t} />
      </div>
    </button>
  );
}

/** Ficha do trator vendido (também usada no Radar de tratores dos Feedbacks, dentro de um .tv-vn com ESTILO_TV). */
export function Ficha({ t, podeControle, meses, seminovos, onFechar, atendimento, onMudou }: {
  t: TratorVendido; podeControle: boolean; meses: number; seminovos: boolean; onFechar: () => void; onMudou: () => Promise<void> | void;
  /** vindo do Radar: o atendimento é feito aqui dentro (Iniciar → atendeu? → como foi) */
  atendimento?: CtxAtendimento;
}) {
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  useEffect(() => {
    // com o PDF aberto, o Esc fecha só o PDF (o visualizador cuida dele)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !doc) onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar, doc]);

  const c = t.cliente;
  const faltaNoControle = t.controle && (!t.controle.entrega || !t.controle.cliente);
  const controlar = async () => {
    setSalvando(true); setMsg('');
    try {
      const r = await fetchAuth('/api/revisoes/vendidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chave: t.chave, meses, seminovos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui gravar.');
      setMsg(j.criado ? 'Trator colocado no controle de revisões.' : j.preenchidos.length ? `Completei no controle: ${j.preenchidos.join(', ')}.` : 'Já estava tudo preenchido no controle.');
      await onMudou();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setSalvando(false); }
  };

  return (
    <div className="tv-fundo" onClick={onFechar}>
      <div className="tv-janela" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${t.modelo} — ${c?.nome || ''}`}>
        <div className="tv-janela-topo" style={{ ['--c' as string]: COR_FASE[t.fase] } as React.CSSProperties}>
          <FotoMaquina modelo={t.modelo} chassi={t.chassi} largura={92} altura={68} cor={COR_FASE[t.fase]} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tv-modelo" style={{ fontSize: 18 }}>{t.modelo}</span>
            <span className="tv-sub" style={{ marginTop: 2 }}>{c?.nome || 'Cliente não achado'}</span>
            <span className="tv-datas">
              <span><i className="fa-solid fa-file-invoice-dollar" /> Vendido {dataBR(t.dataVenda)} <small>há {t.dias} dias</small></span>
              {t.entrega.origem === 'mahindra'
                ? <span className="ok"><i className="fa-solid fa-handshake-simple" /> Entrega técnica {dataBR(t.entrega.data)} <small>há {t.entrega.dias} dias</small></span>
                : <span className="falta"><i className="fa-solid fa-circle-exclamation" /> Sem entrega técnica na Mahindra</span>}
            </span>
          </span>
          <button type="button" className="tv-x" onClick={onFechar} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="tv-janela-corpo">
          {/* Começar o atendimento (José, 28/10/2026: "mais dinâmico e fácil de entender para começar") */}
          <Comecar t={t} atendimento={atendimento} />

          {/* Situação: o que está atrasado e há quantos dias (José, 28/10/2026) */}
          <Situacao t={t} />

          {/* Onde fica: primeiro o mapa, depois o botão do Google Maps */}
          <section className="tv-card tv-sec">
            <Titulo icone="fa-map-location-dot" cor={COR.verde}>Onde fica</Titulo>
            <MapaLocais altura={300} locais={t.locais} endereco={[c?.endereco, c?.bairro, c?.cidade].filter(Boolean).join(', ') || null} />
          </section>

          {/* 30 / 60 / 90 dias */}
          <section className="tv-card tv-sec">
            <Titulo icone="fa-calendar-check" cor={COR.roxo}>30, 60 e 90 dias {t.entrega.origem === 'mahindra' ? 'da entrega técnica' : 'da venda'}</Titulo>
            <div className="tv-marcos">
              {t.marcos.map((m) => (
                <div key={m.dias} className={`tv-marco-box ${m.passou ? 'ok' : ''} ${t.marcoSemana === m.dias ? 'agora' : ''}`}>
                  <span className="tv-marco-ico"><i className={`fa-solid ${m.passou ? 'fa-check' : t.marcoSemana === m.dias ? 'fa-phone-volume' : 'fa-hourglass-half'}`} /></span>
                  <span>
                    <span className="tv-num" style={{ fontSize: 20 }}>{m.dias} dias</span>
                    <span className="tv-rot">{m.passou ? `Bateu em ${dataBR(m.data)}` : `Bate em ${dataBR(m.data)} · faltam ${m.diasFalta} dia${m.diasFalta === 1 ? '' : 's'}`}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="tv-duas">
            {/* Cliente */}
            <section className="tv-card tv-sec" style={{ gridColumn: '1 / -1' }}>
              <Titulo icone="fa-user" cor={COR.azul}>Cliente</Titulo>
              {c ? (
                <>
                  <div className="tv-linha"><span>Nome</span><b>{c.nome}{c.fantasia ? ` (${c.fantasia})` : ''}</b></div>
                  <div className="tv-linha"><span>CPF/CNPJ</span><b>{c.doc || '—'}</b></div>
                  {c.ie && <div className="tv-linha"><span>Inscrição estadual</span><b>{c.ie}</b></div>}
                  <div className="tv-linha"><span>Telefone</span><b>{c.telefone || '—'}</b></div>
                  {c.email && <div className="tv-linha"><span>E-mail</span><b>{c.email}</b></div>}
                  <div className="tv-linha"><span>Endereço</span><b>{[c.endereco, c.bairro].filter(Boolean).join(', ') || '—'}</b></div>
                  <div className="tv-linha"><span>Cidade</span><b>{c.cidade || '—'}{c.cep ? ` · CEP ${c.cep}` : ''}</b></div>
                  <div className="tv-acoes">
                    {c.whats && <a className="tv-btn cheio" style={{ ['--c' as string]: COR.verde } as React.CSSProperties} href={`https://wa.me/${c.whats}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
                    {c.telefone && <a className="tv-btn" href={`tel:${c.telefone.replace(/\D/g, '')}`}><i className="fa-solid fa-phone" /> Ligar</a>}
                    <a className="tv-btn" href={c.pasta} target="_blank" rel="noreferrer"><i className="fa-solid fa-folder-open" /> Pasta do cliente</a>
                  </div>
                </>
              ) : <div className="tv-rot">O código do cliente da nota não está no cadastro do portal.</div>}
            </section>
          </div>

          <div className="tv-duas">
            {/* Venda */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-file-invoice" cor={COR.azul}>Venda</Titulo>
              {t.certificado ? (
                <>
                  <div className="tv-linha"><span>Entrega técnica</span><b>{t.certificado.dataEntrega ? dataBR(t.certificado.dataEntrega) : "sem data"}{t.certificado.entregaTecnica === false ? " · NÃO realizada" : ""}{t.certificado.responsavel ? ` · ${t.certificado.responsavel}` : ""}{t.certificado.horasEntrega != null ? ` · ${t.certificado.horasEntrega} h` : ""}</b></div>
                  {(t.certificado.motor || t.certificado.bombaInjetora) && <div className="tv-linha"><span>Motor · bomba</span><b className="mono">{t.certificado.motor || "—"} · {t.certificado.bombaInjetora || "—"}</b></div>}
                  {t.certificado.banco && <div className="tv-linha"><span>Pagamento</span><b>{t.certificado.banco}{t.certificado.linhaCredito && t.certificado.linhaCredito !== "N/A" ? ` · ${t.certificado.linhaCredito}` : ""}</b></div>}
                  <div className="tv-linha"><span>Certificado Mahindra</span><b>
                    <a href={t.certificado.link} target="_blank" rel="noreferrer">nº {t.certificado.itemId} ({t.certificado.status || "—"})</a>
                  </b></div>
                  {t.certificado.documentos.length > 0 && (
                    <div className="tv-docs">
                      {t.certificado.documentos.map((d) => {
                        const nome = rotuloDoc(d.tipo);
                        return (
                          <button key={d.url} type="button" className={`tv-doc ${d === pdfDoCertificado(t.certificado?.documentos) ? 'principal' : ''}`}
                            onClick={() => setDoc({ titulo: `${nome.titulo} · ${t.modelo} ${t.chassi?.slice(-6) || ''}`, url: d.url, nome: `${nome.titulo} ${t.chassi?.slice(-6) || ''}` })}>
                            <span className="tv-doc-ico"><i className={`fa-solid ${nome.ico}`} /></span>
                            <span className="tv-doc-tx"><b>{nome.titulo}</b><small>{nome.sub} · PDF</small></span>
                            <i className="fa-solid fa-eye tv-doc-ver" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : <div className="tv-linha"><span>Entrega técnica</span><b style={{ color: COR.ambar }}>sem certificado no portal da Mahindra</b></div>}
              {t.chegada && <div className="tv-linha"><span>Chegou da fábrica</span><b>{dataBR(t.chegada.data)} · NF {t.chegada.nf}{t.chegada.fornecedor ? ` · ${t.chegada.fornecedor}` : ""} · {t.chegada.diasEstoque} dia{t.chegada.diasEstoque === 1 ? "" : "s"} no pátio</b></div>}
              <div className="tv-linha"><span>Nota fiscal</span><b>{t.nota ? `${t.nota.numero} · ${dataBR(t.nota.emissao)}` : 'não achei a nota'}</b></div>
              <div className="tv-linha"><span>Pedido</span><b>{t.pedido} · {t.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro'}</b></div>
              <div className="tv-linha"><span>Valor</span><b>{brl(t.valor)}</b></div>
              <div className="tv-linha"><span>Vendedor</span><b>{t.vendedor || '—'}</b></div>
              <div className="tv-linha"><span>Chassi</span><b className="mono">{t.chassi || '—'}</b></div>
              {t.motor && <div className="tv-linha"><span>Motor</span><b className="mono">{t.motor}</b></div>}
              <div className="tv-desc">{t.descricao}</div>
            </section>

            {/* Revisões */}
            <section className="tv-card tv-sec">
              <Titulo icone="fa-screwdriver-wrench" cor={COR.ambar}>Revisões</Titulo>
              {t.controle ? (
                <>
                  <div className="tv-linha"><span>Entrega no controle</span><b>{t.controle.entrega ? dataBR(t.controle.entrega) : <span style={{ color: COR.ambar }}>vazia</span>}</b></div>
                  <div className="tv-revs">
                    {[50, 300, 600, 900].map((h) => {
                      const r = t.controle!.revisoes.find((x) => x.horas === h);
                      return <span key={h} className={`tv-rev ${r ? 'ok' : ''}`}><b>{h} h</b><small>{r ? dataBR(r.data) : 'não feita'}</small></span>;
                    })}
                  </div>
                  {t.controle.previsao && (
                    <div className="tv-rot" style={{ marginTop: 4 }}>
                      Próxima: <b style={{ fontWeight: 500, color: 'var(--portal-text)' }}>{t.controle.previsao.revisao} h</b>
                      {t.controle.previsao.data ? ` por volta de ${dataBR(t.controle.previsao.data)}` : ''} · {t.controle.previsao.situacao.toLowerCase()}. {t.controle.previsao.explicacao}
                    </div>
                  )}
                  <div className="tv-acoes">
                    <Link className="tv-btn" href={`/revisoes?busca=${encodeURIComponent(t.chassi || '')}`}><i className="fa-solid fa-arrow-up-right-from-square" /> Abrir no Controle Revisões</Link>
                    {faltaNoControle && podeControle && (
                      <button type="button" className="tv-btn" onClick={controlar} disabled={salvando}><i className="fa-solid fa-pen" /> {salvando ? 'Gravando…' : 'Completar com os dados da nota'}</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="tv-rot">Este trator ainda não está no controle de revisões. Sem ele, a 50 h e as próximas não aparecem para ninguém acompanhar.</div>
                  {podeControle ? (
                    <div className="tv-acoes">
                      <button type="button" className="tv-btn cheio" style={{ ['--c' as string]: COR.vermelho } as React.CSSProperties} onClick={controlar} disabled={salvando || !t.chassi}>
                        <i className="fa-solid fa-plus" /> {salvando ? 'Gravando…' : 'Colocar no controle de revisões'}
                      </button>
                    </div>
                  ) : <div className="tv-rot">Peça a quem cuida das revisões para colocar.</div>}
                  <div className="tv-rot" style={{ fontSize: 12 }}>Entra com modelo, chassi, motor, cliente, cidade, vendedor e a data da nota como entrega.</div>
                </>
              )}
              {msg && <div className="tv-rot" style={{ color: msg.startsWith('Não') ? COR.vermelho : COR.verde }}>{msg}</div>}
            </section>
          </div>
        </div>
      </div>
      {doc && createPortal(<div style={{ position: 'relative', zIndex: 90000 }} onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>, document.body)}
    </div>
  );
}

/** Nome amigável dos anexos do certificado da Mahindra. */
function rotuloDoc(tipo: string): { titulo: string; sub: string; ico: string } {
  if (/certificado/i.test(tipo)) return { titulo: 'Certificado de garantia', sub: 'Mahindra', ico: 'fa-award' };
  if (/mahindra/i.test(tipo)) return { titulo: 'Nota da Mahindra', sub: 'fábrica → loja', ico: 'fa-industry' };
  if (/concession/i.test(tipo)) return { titulo: 'Nota da venda', sub: 'loja → cliente', ico: 'fa-file-invoice-dollar' };
  return { titulo: tipo, sub: 'anexo do certificado', ico: 'fa-file-pdf' };
}

const diasEntre = (de: string | null | undefined, ate: string | null | undefined) => {
  if (!de || !ate) return null;
  const a = Date.parse(de.slice(0, 10)), b = Date.parse(ate.slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
};

/** O que está pegando neste trator, em frases curtas (vermelho = atrasado, laranja = atenção, verde = em dia). */
/** Atendimento do cliente dentro da ficha (José, 28/10/2026: "quando a gente clicar aqui tem que formalizar
 *  o atendimento dentro do modal" e "coloca iniciar atendimento, pra gente conseguir fazer uma aba de
 *  atendimentos em andamento"): quem ligar e os botões → Iniciar atendimento (grava em andamento, a equipe vê
 *  em "Em atendimento agora") → atendeu? → como foi → registrado, tudo aqui. Fora do Radar só mostra o contato. */
function Comecar({ t, atendimento }: { t: TratorVendido; atendimento?: CtxAtendimento }) {
  const c = t.cliente;
  const p = (c?.nome || '').trim().split(/\s+/)[0] || '';
  const nome = p ? p[0] + p.slice(1).toLowerCase() : '';
  const tel = (c?.telefone || '').replace(/\D/g, '');
  const [atend, setAtend] = useState<AtendimentoRadar | null>(atendimento?.aberto ?? null);
  const [semTabela, setSemTabela] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<string | null>(null);

  const iniciar = useCallback(async () => {
    if (!atendimento) return;
    setIniciando(true); setErro('');
    try {
      const r = await fetchAuth('/api/revisoes/vendidos/atendimentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar', chave: t.chave, marco: atendimento.s.marco }) });
      const j = await r.json().catch(() => ({}));
      if (j.semTabela) { // sem o SQL: atende do mesmo jeito, só não aparece em "Em atendimento agora"
        setSemTabela(true);
        setAtend({ id: '', chave: t.chave, marco: atendimento.s.marco, user_id: null, user_nome: null, iniciado_em: new Date().toISOString() });
        return;
      }
      if (!r.ok || !j.ok) throw new Error(j.erro || 'Não consegui iniciar.');
      setAtend(j.atendimento);
      atendimento.onMudou();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setIniciando(false); }
  }, [atendimento, t.chave]);
  // "Iniciar atendimento" no cartão do Radar abre a ficha já iniciando
  useEffect(() => {
    if (!atendimento?.iniciar || atendimento.aberto) return;
    const id = setTimeout(() => { void iniciar(); }, 0);
    return () => clearTimeout(id);
  }, [atendimento, iniciar]);

  const cancelar = async () => {
    if (atend?.id) await fetchAuth('/api/revisoes/vendidos/atendimentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'cancelar', id: atend.id }) }).catch(() => null);
    setAtend(null);
    atendimento?.onMudou();
  };
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <section className={`tv-card tv-comecar ${atend && !feito ? 'andando' : ''}`}>
      <div className="tv-cm-topo">
        <span className="tv-cm-ico"><i className="fa-solid fa-headset" /></span>
        <span className="tv-cm-quem">
          <b>Ligar para {nome || 'o cliente'}</b>
          {c?.telefone ? <small>{c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}</small> : <small className="falta">sem telefone no cadastro — veja na pasta do cliente</small>}
        </span>
        <span className="tv-acoes">
          {c?.whats && <a className="tv-btn cheio" style={{ ['--c' as string]: COR.verde } as React.CSSProperties} href={`https://wa.me/${c.whats}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
          {tel && <a className="tv-btn cheio" style={{ ['--c' as string]: COR.azul } as React.CSSProperties} href={`tel:${tel}`}><i className="fa-solid fa-phone" /> Ligar</a>}
          {c?.pasta && <a className="tv-btn" href={c.pasta} target="_blank" rel="noreferrer"><i className="fa-solid fa-folder-open" /> Pasta</a>}
        </span>
      </div>

      {atendimento && (feito ? (
        <div className="tv-cm-feito"><i className="fa-solid fa-circle-check" /> <span><b>Atendimento registrado</b>{feito}</span></div>
      ) : !atend ? (
        <div className="tv-cm-iniciar">
          <button type="button" className="tv-btn cheio grande" style={{ ['--c' as string]: COR.verde } as React.CSSProperties} disabled={iniciando} onClick={() => void iniciar()}>
            {iniciando ? <i className="fa-solid fa-circle-notch fa-spin" /> : <i className="fa-solid fa-headset" />} Iniciar atendimento
          </button>
          <small>A equipe vê que você está falando com {nome || 'o cliente'}. Depois é só dizer como foi.</small>
          {erro && <span className="tv-cm-erro">{erro}</span>}
        </div>
      ) : (
        <div className="tv-cm-and">
          <div className="tv-cm-and-cab">
            <span className="pulso" />
            <b>Atendimento em andamento</b>
            <small>{semTabela ? 'sem registro de andamento (falta o SQL radar-tratores-atendimentos)' : `desde ${hora(atend.iniciado_em)}${atend.user_nome ? ` · ${atend.user_nome}` : ''}`}</small>
            <button type="button" className="tv-cm-link" onClick={() => void cancelar()}>Cancelar o atendimento</button>
          </div>
          <RegistroAtendimento t={t} s={atendimento.s} atendimentoId={atend.id || null} rotuloSalvar="Salvar o atendimento"
            onGravado={(ct, txt) => { setFeito(txt.replace(/^[^:]*:\s*/, ' · ')); atendimento.onGravado(ct, txt); }} />
        </div>
      ))}
    </section>
  );
}

function Situacao({ t }: { t: TratorVendido }) {
  const itens: { cor: string; ico: string; tx: string; sub?: string }[] = [];
  const r50 = t.revisao50;
  if (r50?.feita) {
    const d = diasEntre(t.entrega.data, r50.dataFeita);
    itens.push({ cor: COR.verde, ico: 'fa-circle-check', tx: `Revisão de 50 h feita em ${dataBR(r50.dataFeita)}`, sub: d != null ? `${d} dias depois da entrega${r50.os ? ` · ${r50.os}` : ''}` : r50.os || undefined });
  } else if (r50) {
    itens.push({ cor: COR.azul, ico: 'fa-screwdriver-wrench', tx: `OS da revisão de 50 h aberta${r50.os ? ` (${r50.os})` : ''}`, sub: r50.status || undefined });
  } else if (t.entrega.dias > 90) {
    itens.push({ cor: COR.vermelho, ico: 'fa-circle-exclamation', tx: `Sem orçamento da revisão de 50 h há ${t.entrega.dias} dias`, sub: `passou ${t.entrega.dias - 90} dias dos 90 — ligar e abrir a OS` });
  } else if (t.entrega.dias >= 30) {
    itens.push({ cor: COR.ambar, ico: 'fa-hourglass-half', tx: 'Revisão de 50 h ainda sem orçamento', sub: `${t.entrega.dias} dias com o cliente` });
  }
  if (t.previsao300) {
    const f = t.previsao300.diasFaltam;
    itens.push({ cor: f < 0 ? COR.vermelho : f <= 30 ? COR.ambar : COR.verde, ico: 'fa-calendar-day',
      tx: f < 0 ? `Revisão de 300 h atrasada ${-f} dias` : `Revisão de 300 h em ${dataBR(t.previsao300.data300)}`,
      sub: `${f >= 0 ? `daqui a ${f} dias · ` : ''}≈ ${String(t.previsao300.horasDia).replace('.', ',')} h por dia (levou ${t.previsao300.diasAte50} dias até a 50 h)` });
  } else if (t.controle?.previsao && /atrasad/i.test(t.controle.previsao.situacao)) {
    itens.push({ cor: COR.vermelho, ico: 'fa-circle-exclamation', tx: `Revisão de ${t.controle.previsao.revisao} h atrasada`, sub: t.controle.previsao.explicacao });
  }
  if (t.entrega.origem !== 'mahindra') itens.push({ cor: COR.ambar, ico: 'fa-handshake-slash', tx: 'Entrega técnica não está no portal da Mahindra', sub: 'os prazos contam da nota de venda' });
  else {
    const d = diasEntre(t.dataVenda, t.entrega.data);
    if (d != null && d > 15) itens.push({ cor: COR.ambar, ico: 'fa-truck-ramp-box', tx: `Entrega técnica ${d} dias depois da venda`, sub: `vendido ${dataBR(t.dataVenda)} · entregue ${dataBR(t.entrega.data)}` });
  }
  if (t.chegada && t.chegada.diasEstoque > 180) itens.push({ cor: COR.ambar, ico: 'fa-warehouse', tx: `Ficou ${t.chegada.diasEstoque} dias no pátio antes de vender`, sub: `chegou da fábrica em ${dataBR(t.chegada.data)}` });
  if (!t.controle) itens.push({ cor: COR.vermelho, ico: 'fa-table-list', tx: 'Fora do controle de revisões', sub: 'colocar para a 50 h e as próximas aparecerem' });
  if (!itens.length) return null;
  const peso = (c: string) => (c === COR.vermelho ? 0 : c === COR.ambar ? 1 : c === COR.azul ? 2 : 3);
  itens.sort((a, b) => peso(a.cor) - peso(b.cor));
  return (
    <section className="tv-card tv-sec">
      <Titulo icone="fa-stethoscope" cor={itens.some((x) => x.cor === COR.vermelho) ? COR.vermelho : COR.verde}>Situação do trator</Titulo>
      <div className="tv-situ">
        {itens.map((x, i) => (
          <div key={i} className="tv-situ-l" style={{ ['--c' as string]: x.cor, animationDelay: `${i * 60}ms` } as React.CSSProperties}>
            <span className="tv-situ-ico"><i className={`fa-solid ${x.ico}`} /></span>
            <span><b>{x.tx}</b>{x.sub && <small>{x.sub}</small>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Titulo({ icone, cor, children }: { icone: string; cor: string; children: React.ReactNode }) {
  return (
    <h3 className="tv-tit" style={{ ['--c' as string]: cor } as React.CSSProperties}>
      <span className="tv-ico pequeno"><i className={`fa-solid ${icone}`} /></span>{children}
    </h3>
  );
}

export const ESTILO_TV = `
.tv-vn { padding: 18px 22px 40px; color: var(--portal-text, #0f172a); --tv-borda: var(--border, #e2e8f0); --tv-sec: var(--portal-text-secondary, #475569) }
.tv-vn i[class*="fa-"] { font-weight: 900 }
.tv-vn i.fa-regular { font-weight: 400 }
.tv-vn .tv-topo { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px }
.tv-vn .tv-btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); font: inherit; font-size: 14px; cursor: pointer; text-decoration: none; white-space: nowrap; transition: border-color .2s, background .2s }
.tv-vn .tv-btn:hover { border-color: color-mix(in srgb, var(--c, #2563eb) 40%, var(--tv-borda)) }
.tv-vn .tv-btn.cheio { background: var(--c); border-color: var(--c); color: #fefefe }
.tv-vn .tv-btn:disabled { opacity: .55; cursor: wait }
.tv-vn .tv-seg { display: inline-flex; border: 1px solid var(--tv-borda); border-radius: 11px; overflow: hidden; background: var(--surface, #fefefe) }
.tv-vn .tv-seg button { height: 36px; padding: 0 13px; border: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--tv-sec); cursor: pointer }
.tv-vn .tv-seg button.on { background: color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe)); color: #1d4ed8 }
.tv-vn .tv-check { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; color: var(--tv-sec); cursor: pointer }
.tv-vn .tv-busca { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); color: var(--portal-text-muted, #64748b) }
.tv-vn .tv-busca input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--portal-text, #0f172a) }

.tv-vn .tv-card { background: var(--surface, #fefefe); border: 1px solid var(--tv-borda); border-radius: 16px; padding: 16px 18px 14px; box-shadow: none; transition: box-shadow .25s, transform .25s, border-color .25s; color: var(--portal-text, #0f172a); text-align: left; font: inherit }
.tv-vn .tv-card.clicavel { cursor: pointer }
.tv-vn .tv-card.clicavel:hover, .tv-vn .tv-kpi:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c, #2563eb) 35%, var(--tv-borda)) }
.tv-vn .tv-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.tv-vn .tv-ico.pequeno { width: 32px; height: 32px; border-radius: 9px; font-size: 14px }
.tv-vn .tv-num { display: block; font-size: 26px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.15 }
.tv-vn .tv-rot { display: block; font-size: 13px; color: var(--tv-sec); line-height: 1.45 }

.tv-vn .tv-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 14px }
.tv-vn .tv-kpi { display: flex; align-items: center; gap: 13px; cursor: pointer }
.tv-vn .tv-kpi.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 6%, var(--surface, #fefefe)) }

.tv-vn .tv-fases { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px }
.tv-vn .tv-fase { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 99px; font: inherit; font-size: 13.5px; cursor: pointer; color: var(--portal-text, #0f172a); background: var(--surface, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 30%, var(--tv-borda)) }
.tv-vn .tv-fase span { font-size: 12px; padding: 0 8px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, var(--surface, #fefefe)) }
.tv-vn .tv-fase.on { background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)); border-color: var(--c) }
.tv-vn .tv-fase.on span { background: var(--c); color: #fefefe }

.tv-vn .tv-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px }
.tv-vn .tv-trator { display: flex; flex-direction: column; gap: 8px; width: 100% }
.tv-vn .tv-trator-topo { display: grid; grid-template-columns: auto minmax(0,1fr) auto; column-gap: 11px; align-items: center }
.tv-vn .tv-etq { display: inline-flex; align-items: baseline; gap: 5px; font-size: 13px; padding: 0 9px; border-radius: 7px; font-variant-numeric: tabular-nums; background: color-mix(in srgb, var(--c) 8%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); line-height: 1.6 }
.tv-vn .tv-etq small { font-size: 11px; color: color-mix(in srgb, var(--c) 75%, #0f172a) }
.tv-vn .tv-modelo { display: block; font-size: 15.5px; font-weight: 500; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.tv-vn .tv-dias { text-align: right; line-height: 1 }
.tv-vn .tv-dias b { display: block; font-size: 26px; font-weight: 500; color: var(--c); font-variant-numeric: tabular-nums }
.tv-vn .tv-dias small { font-size: 12px; color: var(--tv-sec) }
.tv-vn .tv-cliente { font-size: 16px; font-weight: 500; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.tv-vn .tv-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--tv-sec) }
.tv-vn .tv-sub i { color: var(--portal-text-muted, #94a3b8); margin-right: 4px; font-size: 11px }

.tv-vn .tv-regua { position: relative; height: 40px; margin: 6px 10px 2px }
.tv-vn .tv-regua-barra { position: absolute; left: 0; right: 0; top: 7px; height: 6px; border-radius: 99px; background: var(--portal-bg-secondary, #eef2f6); overflow: hidden }
.tv-vn .tv-regua-barra span { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--c); transition: width .7s cubic-bezier(.16,1,.3,1) }
.tv-vn .tv-marco { position: absolute; top: 0; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px }
.tv-vn .tv-marco i { width: 20px; height: 20px; border-radius: 50%; background: var(--surface, #fefefe); border: 2px solid var(--tv-borda) }
.tv-vn .tv-marco.ok i { background: var(--c); border-color: var(--c) }
.tv-vn .tv-marco.agora i { box-shadow: 0 0 0 5px color-mix(in srgb, #7C3AED 22%, transparent); border-color: #7C3AED }
.tv-vn .tv-marco small { font-size: 11px; color: var(--tv-sec); white-space: nowrap; font-variant-numeric: tabular-nums }
.tv-vn .tv-marco:last-child small { transform: translateX(-30%) }
.tv-vn .tv-selos { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px }
.tv-vn .tv-pilula { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 10px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); white-space: nowrap }
.tv-vn .tv-pulsa { animation: tvPulsa 2.4s ease-in-out infinite }
@keyframes tvPulsa { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, #7C3AED 0%, transparent) } 50% { box-shadow: 0 0 0 6px color-mix(in srgb, #7C3AED 20%, transparent) } }
@media (prefers-reduced-motion: reduce) { .tv-vn .tv-pulsa { animation: none } }
.tv-vn .tv-vazio, .tv-vn .tv-aviso { padding: 40px 16px; text-align: center; color: var(--tv-sec); font-size: 14px }
.tv-vn .tv-aviso { padding: 12px 14px; border-radius: 12px; color: #b91c1c; background: color-mix(in srgb, #dc2626 7%, var(--surface, #fefefe)); margin-bottom: 12px; text-align: left }

.tv-vn .tv-fundo { position: fixed; inset: 0; z-index: 10000; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px }
.tv-vn .tv-janela { width: 100%; max-width: 1080px; max-height: 92vh; overflow: auto; border-radius: 18px; background: var(--portal-bg-secondary, #f8fafc) }
.tv-vn .tv-janela-topo { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--surface, #fefefe); border-bottom: 1px solid var(--tv-borda) }
.tv-vn .tv-x { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); cursor: pointer; color: var(--tv-sec) }
.tv-vn .tv-janela-corpo { padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 14px }
.tv-vn .tv-duas { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px }
.tv-vn .tv-sec { display: flex; flex-direction: column; gap: 9px }
.tv-vn .tv-tit { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; font-size: 16px; font-weight: 500 }
.tv-vn .tv-linha { display: grid; grid-template-columns: 140px minmax(0,1fr); gap: 10px; font-size: 14px }
.tv-vn .tv-linha span { color: var(--tv-sec); font-size: 13px }
.tv-vn .tv-linha b { font-weight: 400; overflow-wrap: anywhere }
.tv-vn .mono { font-family: ui-monospace, monospace }
.tv-vn .tv-acoes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px }
.tv-vn .tv-desc { font-size: 12.5px; color: var(--tv-sec); padding: 9px 11px; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9) }
.tv-vn .tv-marcos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.tv-vn .tv-marco-box { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 12px; border: 1px dashed var(--tv-borda) }
.tv-vn .tv-marco-ico { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 14px; color: var(--tv-sec); background: var(--portal-bg-secondary, #f1f5f9) }
.tv-vn .tv-marco-box.ok .tv-marco-ico { color: #fefefe; background: #16a34a }
.tv-vn .tv-marco-box.agora .tv-marco-ico { color: #fefefe; background: #7C3AED }
.tv-vn .tv-datas { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px }
.tv-vn .tv-datas > span { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; padding: 3px 10px; border-radius: 99px; color: #1d4ed8; background: color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe)) }
.tv-vn .tv-datas > span.ok { color: #0e7490; background: color-mix(in srgb, #0e7490 9%, var(--surface, #fefefe)) }
.tv-vn .tv-datas > span.falta { color: #b45309; background: color-mix(in srgb, #d97706 10%, var(--surface, #fefefe)) }
.tv-vn .tv-datas small { font-size: 12px; opacity: .8 }
.tv-vn .tv-comecar { display: grid; gap: 14px; padding: 16px 18px; border-color: color-mix(in srgb, #2563eb 30%, var(--tv-borda)); background: linear-gradient(135deg, color-mix(in srgb, #2563eb 6%, var(--surface, #fefefe)), var(--surface, #fefefe) 60%) }
.tv-vn .tv-cm-topo { display: flex; flex-wrap: wrap; gap: 12px; align-items: center }
.tv-vn .tv-cm-ico { width: 44px; height: 44px; flex: none; border-radius: 13px; display: grid; place-items: center; font-size: 18px; color: #fefefe; background: linear-gradient(140deg, #60a5fa, #2563eb); box-shadow: 0 8px 18px -10px #2563eb }
.tv-vn .tv-cm-quem { flex: 1 1 200px; display: grid; min-width: 0 }
.tv-vn .tv-cm-quem b { font-weight: 500; font-size: 17px }
.tv-vn .tv-cm-quem small { font-size: 13px; color: var(--tv-sec) } .tv-vn .tv-cm-quem small.falta { color: #b91c1c }
  transition: background .2s, border-color .2s, color .2s; animation: tvEntra .4s cubic-bezier(.16,1,.3,1) both }
.tv-vn .tv-cm-iniciar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding-top: 12px; border-top: 1px dashed var(--tv-borda) }
.tv-vn .tv-cm-iniciar small { font-size: 13px; color: var(--tv-sec) }
.tv-vn .tv-btn.grande { padding: 12px 22px; font-size: 15.5px; border-radius: 14px }
.tv-vn .tv-cm-erro { color: #b91c1c; font-size: 13px }
.tv-vn .tv-comecar.andando { border-color: color-mix(in srgb, #16a34a 45%, var(--tv-borda)); background: linear-gradient(135deg, color-mix(in srgb, #16a34a 6%, var(--surface, #fefefe)), var(--surface, #fefefe) 60%) }
.tv-vn .tv-cm-and { display: grid; gap: 12px; padding-top: 12px; border-top: 1px dashed var(--tv-borda) }
.tv-vn .tv-cm-and-cab { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center }
.tv-vn .tv-cm-and-cab b { font-weight: 500; color: #15803d } .tv-vn .tv-cm-and-cab small { font-size: 12.5px; color: var(--tv-sec) }
.tv-vn .tv-cm-and-cab .tv-cm-link { background: none; border: 0; font: inherit; font-size: 13px; cursor: pointer; padding: 0 }
.tv-vn .tv-cm-and .pulso { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; animation: tvPulsoA 1.6s ease-in-out infinite }
@keyframes tvPulsoA { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, #16a34a 25%, transparent) } }
.tv-vn .tv-cm-feito { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, #16a34a 9%, var(--surface, #fefefe)); color: #166534; font-size: 14px }
.tv-vn .tv-cm-feito i { font-size: 18px } .tv-vn .tv-cm-feito b { font-weight: 500 }
.tv-vn .tv-cm-link { margin-left: auto; font-size: 13.5px; color: var(--tv-sec); text-decoration: none } .tv-vn .tv-cm-link:hover { color: #2563eb; text-decoration: underline }
.tv-vn .tv-situ { display: grid; gap: 8px }
.tv-vn .tv-situ-l { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--c) 6%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 22%, var(--tv-borda)); animation: tvEntra .4s cubic-bezier(.16,1,.3,1) both }
.tv-vn .tv-situ-ico { width: 34px; height: 34px; flex: none; border-radius: 10px; display: grid; place-items: center; color: #fefefe; background: var(--c) }
.tv-vn .tv-situ-l b { display: block; font-weight: 500; font-size: 14.5px; color: var(--c) }
.tv-vn .tv-situ-l small { display: block; font-size: 12.5px; color: var(--tv-sec) }
@keyframes tvEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.tv-vn .tv-docs { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; margin: 4px 0 }
.tv-vn .tv-doc { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tv-borda); background: var(--surface, #fefefe); font: inherit; color: var(--portal-text, #0f172a); text-align: left; cursor: pointer; transition: border-color .2s, transform .2s }
.tv-vn .tv-doc:hover { border-color: #2563eb; transform: translateY(-1px) }
.tv-vn .tv-doc-ico { width: 36px; height: 36px; flex: none; border-radius: 10px; display: grid; place-items: center; color: #dc2626; background: color-mix(in srgb, #dc2626 8%, var(--surface, #fefefe)) }
.tv-vn .tv-doc.principal .tv-doc-ico { color: #fefefe; background: #2563eb }
.tv-vn .tv-doc-tx { flex: 1; min-width: 0 } .tv-vn .tv-doc-tx b { display: block; font-weight: 500; font-size: 14px } .tv-vn .tv-doc-tx small { display: block; font-size: 12px; color: var(--tv-sec) }
.tv-vn .tv-doc-ver { color: var(--portal-text-muted, #94a3b8); font-size: 13px }
@media (prefers-reduced-motion: reduce) { .tv-vn .tv-situ-l { animation: none } }
.tv-vn .tv-marco-box.ok { border-style: solid; border-color: color-mix(in srgb, #16a34a 30%, var(--tv-borda)); background: color-mix(in srgb, #16a34a 5%, var(--surface, #fefefe)) }
.tv-vn .tv-marco-box.agora { border-color: #7C3AED; background: color-mix(in srgb, #7C3AED 7%, var(--surface, #fefefe)) }
.tv-vn .tv-revs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.tv-vn .tv-rev { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 10px; border: 1px dashed var(--tv-borda) }
.tv-vn .tv-rev b { font-weight: 500; font-size: 14px }
.tv-vn .tv-rev small { font-size: 12px; color: var(--tv-sec) }
.tv-vn .tv-rev.ok { border-style: solid; border-color: color-mix(in srgb, #16a34a 30%, var(--tv-borda)); background: color-mix(in srgb, #16a34a 6%, var(--surface, #fefefe)) }
@media (max-width: 640px) {
  .tv-vn { padding: 12px 12px 30px }
  .tv-vn .tv-grade { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-duas { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-marcos { grid-template-columns: minmax(0, 1fr) }
  .tv-vn .tv-revs { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .tv-vn .tv-linha { grid-template-columns: 110px minmax(0,1fr) }
  .tv-vn .tv-fundo { padding: 0 }
  .tv-vn .tv-janela { max-height: 100vh; height: 100%; border-radius: 0 }
}
`;
