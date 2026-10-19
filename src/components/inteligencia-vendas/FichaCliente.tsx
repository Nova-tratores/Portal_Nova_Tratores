'use client';
import { X, FolderOpen, FileText, Calculator, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { borda, brl, dataBR, fundo2, fundoCard, mut, num, Selo, txt, VERMELHO } from './ui';

// Ficha do cliente: tudo o que o cruzamento achou, com o porquê de cada
// oportunidade e atalhos pra agir (Pasta, Proposta, Calculadora, Indicação).
export default function FichaCliente({ c, onFechar }: { c: ClienteIV; onFechar: () => void }) {
  const cod = c.codigos.find((x) => x.empresa === 'NOVA') || c.codigos[0];
  const linha = (r: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: borda, fontSize: 14.5 }}>
      <span style={{ color: mut }}>{r}</span><span style={{ color: txt, fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
  const atalho = (href: string, icone: React.ReactNode, texto: string) => (
    <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid ${VERMELHO}`, color: VERMELHO, fontSize: 14.5, fontWeight: 700, textDecoration: 'none' }}>
      {icone}{texto}
    </Link>
  );
  const docFmt = c.doc.length === 14
    ? c.doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    : c.doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--portal-bg, #f9fafb)', boxShadow: '-6px 0 24px rgba(0,0,0,0.2)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'linear-gradient(135deg, #F87171, #991B1B)', padding: '14px 18px', color: '#fefefe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{c.nome || '(sem nome)'}</div>
              <div style={{ fontSize: 14.5, opacity: 0.92, marginTop: 3 }}>
                {[docFmt, c.cidade, c.lojas.join(' + '), c.telefone].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={onFechar} aria-label="Fechar" style={{ background: 'rgba(255,255,255,0.2)', border: 0, borderRadius: 8, width: 34, height: 34, color: '#fefefe', cursor: 'pointer', flexShrink: 0 }}>
              <X size={18} style={{ margin: 'auto' }} />
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 14.5 }}>Score <b style={{ fontSize: 20 }}>{c.score}</b> / 100</div>
        </div>

        <div style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cod && atalho(`/clientes?cod=${cod.cod}&doc=${c.doc}&empresa=${cod.empresa === 'NOVA' ? 'Nova Tratores' : 'Castro Pecas'}`, <FolderOpen size={15} />, 'Pasta do cliente')}
            {atalho('/propostas', <FileText size={15} />, 'Nova proposta')}
            {atalho(`/inteligencia-vendas/calculadora?cliente=${encodeURIComponent(c.nome)}${c.areaHa ? `&area=${Math.round(c.areaHa)}` : ''}`, <Calculator size={15} />, 'Calcular retorno')}
            {atalho(`/inteligencia-vendas/indicacoes?indicante=${encodeURIComponent(c.nome)}&doc=${c.doc}`, <UserPlus size={15} />, 'Registrar indicação')}
          </div>

          <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 800, color: txt, marginBottom: 8 }}>Por que ligar e o que oferecer</div>
            {c.oportunidades.length === 0 && <div style={{ color: mut, fontSize: 14.5 }}>Nenhuma regra disparou para este cliente.</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {c.oportunidades.map((o) => (
                <div key={o.regra} style={{ borderLeft: `4px solid ${REGRAS[o.regra].cor}`, background: fundo2, borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Selo cor={REGRAS[o.regra].cor}>{REGRAS[o.regra].rotulo}</Selo>
                    <b style={{ color: txt, fontSize: 15.5 }}>{o.titulo}</b>
                    <span style={{ marginLeft: 'auto', fontSize: 13.5, color: mut }}>+{o.peso}</span>
                  </div>
                  <div style={{ fontSize: 14.5, color: mut, marginTop: 4 }}>{o.porque}</div>
                  <div style={{ fontSize: 14.5, color: txt, marginTop: 4 }}>→ <b>{o.oferecer}</b></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: 14 }}>
            <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 800, color: txt, marginBottom: 6 }}>Compras e oficina</div>
              {linha('Tratores comprados', c.qtdTratores)}
              {linha('Implementos comprados', c.qtdImplementos)}
              {linha('Valor em máquinas (Omie)', brl(c.valorMaquinas))}
              {linha('Peças — últimos 12 meses', `${brl(c.pecas12m)} · ${c.pedidosPecas12m} ped.`)}
              {linha('Peças — 12 a 24 meses', `${brl(c.pecas12a24m)} · ${c.pedidosPecas12a24m} ped.`)}
              {linha('Última compra de peças', dataBR(c.ultimaCompraPecas))}
              {linha('OS nos últimos 12 meses', c.os12m)}
              {linha('Última OS', dataBR(c.ultimaOS))}
              {linha('Maior horímetro visto', c.maiorHorimetro ? `${num(c.maiorHorimetro)} h` : '—')}
              {linha('Outras marcas na oficina', c.marcasNaOficina.join(', ') || '—')}
            </div>
            <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 800, color: txt, marginBottom: 6 }}>Comercial</div>
              {linha('Vendedor', c.vendedor || '—')}
              {linha('Propostas em aberto', `${c.propostasAbertas} · ${brl(c.valorPropostasAbertas)}`)}
              {linha('Ganhas / perdidas', `${c.propostasGanhas} / ${c.propostasPerdidas}`)}
              {linha('Última proposta', dataBR(c.ultimaProposta))}
              {linha('Visitas no CRM', c.visitas)}
              {linha('Última visita', dataBR(c.ultimaVisita))}
              {linha('Área (CRM)', c.areaHa ? `${num(c.areaHa)} ha` : '—')}
              {linha('Culturas (CRM)', c.culturas.join(', ') || '—')}
              {linha('CNAE', c.cnae ? `${c.cnae} — ${c.cnaeDescricao}` : '—')}
              {linha('Porte / abertura', c.porte || c.abertura ? `${c.porte || '—'} · ${dataBR(c.abertura)}` : '—')}
            </div>
          </div>

          <div style={{ background: fundoCard, border: borda, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 800, color: txt, marginBottom: 8 }}>Máquinas compradas conosco</div>
            {c.maquinas.length === 0 && <div style={{ color: mut, fontSize: 14.5 }}>Nenhuma máquina na nossa base (Omie desde 11/2022 e controle de revisões desde 2019).</div>}
            {c.maquinas.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: borda, fontSize: 14.5, alignItems: 'center' }}>
                <Selo cor={m.tipo === 'trator' ? VERMELHO : m.tipo === 'implemento' ? '#EA580C' : '#475569'}>{m.tipo}</Selo>
                <span style={{ color: txt, fontWeight: 600, flex: 1, minWidth: 0 }}>{m.modelo}</span>
                <span style={{ color: mut }}>{m.familia}</span>
                <span style={{ color: txt, width: 86, textAlign: 'right' }}>{dataBR(m.data)}</span>
                <span style={{ color: txt, width: 96, textAlign: 'right' }}>{m.valor ? brl(m.valor) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
