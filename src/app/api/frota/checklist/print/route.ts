// GET /api/frota/checklist/print?token=<share_token>
// Documento imprimível (HTML → window.print → salvar como PDF) de um checklist
// mensal de veículo. Aberto por link (nova aba); acesso pelo share_token do
// checklist (mesmo segredo do "ver" do NT Mecânico). Lê do mesmo Supabase.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolverPlaca, extrairPlacaDeNumPlaca, formatarPlaca } from '@/lib/frota/placa';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtMes = (m: string) => { const [a, mm] = String(m || '').split('-'); return mm ? `${MESES[Number(mm) - 1] || mm} de ${a}` : (m || ''); };
const fmtDT = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const esc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const auto = req.nextUrl.searchParams.get('auto') === '1';
  if (!token) return new NextResponse('<h1>Token não informado</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 400 });

  const { data: chk } = await supabase.from('veiculo_checklist').select('*').eq('share_token', token).maybeSingle();
  if (!chk) return new NextResponse('<h1>Checklist não encontrado</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 404 });

  const { data: itensRaw } = await supabase
    .from('veiculo_checklist_itens')
    .select('item_key, categoria, titulo, resposta, observacao, foto_url, respondido_em')
    .eq('checklist_id', chk.id)
    .order('respondido_em', { ascending: true });
  const itens = itensRaw || [];

  const placaCanon = resolverPlaca(extrairPlacaDeNumPlaca(chk.placa));
  const { data: v } = placaCanon
    ? await supabase.from('frota_veiculos').select('placa_exibicao, modelo, marca').eq('placa', placaCanon).maybeSingle()
    : { data: null } as any;
  const placaFmt = v?.placa_exibicao || (placaCanon ? formatarPlaca(placaCanon) : (chk.placa || '—'));
  const veicDesc = [v?.marca, v?.modelo].filter(Boolean).join(' ') || '';

  const score = chk.score_confianca;
  const statusLabel = String(chk.status || '').toLowerCase() === 'suspeito' || (score != null && score < 50) ? 'SUSPEITO'
    : String(chk.status || '').toLowerCase() === 'completo' ? 'COMPLETO' : (chk.status || '').toUpperCase();
  const statusCor = statusLabel === 'SUSPEITO' ? '#b91c1c' : statusLabel === 'COMPLETO' ? '#15803d' : '#b45309';

  const info = (l: string, v2: string) => v2 ? `<div class="c"><div class="lab">${l}</div><div class="val">${esc(v2)}</div></div>` : '';

  const itensHtml = itens.length === 0
    ? `<p class="vazio">Este checklist não tem itens registrados.</p>`
    : `<div class="grid">${itens.map((it) => {
        const prob = String(it.resposta || '').toLowerCase().includes('problema');
        return `<div class="item">
          ${it.foto_url ? `<img src="${esc(it.foto_url)}" alt="">` : `<div class="semfoto">sem foto</div>`}
          <div class="it-tit">${esc(it.titulo || it.item_key || '')}</div>
          <div class="it-resp ${prob ? 'prob' : 'ok'}">${prob ? 'Problema' : 'OK'}</div>
          ${it.observacao ? `<div class="it-obs">${esc(it.observacao)}</div>` : ''}
        </div>`;
      }).join('')}</div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Checklist ${esc(placaFmt)} - ${esc(fmtMes(chk.mes_referencia))}</title>
<style>
  @page { margin: 1cm; size: A4; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#16181d; padding:20px; font-size:12px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2.5px solid #1b2230; padding-bottom:14px; margin-bottom:16px; }
  .co { font-size:18px; font-weight:800; }
  .co small { display:block; font-size:9px; font-weight:500; color:#666; margin-top:2px; }
  .doc { text-align:right; }
  .doc .k { font-size:8px; letter-spacing:1.5px; text-transform:uppercase; color:#8a919c; }
  .doc .t { font-size:15px; font-weight:800; }
  .doc .m { font-size:11px; color:#555; margin-top:2px; }
  .doc .st { display:inline-block; font-size:9px; font-weight:800; padding:2px 10px; border:1.5px solid ${statusCor}; color:${statusCor}; border-radius:5px; margin-top:5px; }
  .infos { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:#e6e9ef; border:1px solid #e6e9ef; border-radius:8px; overflow:hidden; margin-bottom:18px; }
  .c { background:#fff; padding:8px 12px; }
  .lab { font-size:8px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:#8a919c; }
  .val { font-size:13px; font-weight:600; margin-top:2px; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .item { border:1px solid #e6e9ef; border-radius:8px; overflow:hidden; page-break-inside:avoid; }
  .item img { width:100%; height:140px; object-fit:cover; display:block; }
  .semfoto { height:140px; background:#f2f3f6; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:11px; }
  .it-tit { font-size:11px; font-weight:700; padding:8px 10px 2px; }
  .it-resp { font-size:10px; font-weight:800; padding:0 10px; }
  .it-resp.ok { color:#15803d; } .it-resp.prob { color:#b91c1c; }
  .it-obs { font-size:10px; color:#555; padding:2px 10px 8px; line-height:1.4; }
  .vazio { color:#888; font-size:13px; padding:20px 0; }
  .foot { margin-top:20px; text-align:center; font-size:8px; color:#bbb; letter-spacing:.5px; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; padding:0; } }
</style>
${auto ? '<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>' : ''}
</head><body>
  <div class="head">
    <div class="co">Nova Tratores<small>Frota · Checklist mensal do veículo</small></div>
    <div class="doc">
      <div class="k">Checklist mensal</div>
      <div class="t">${esc(placaFmt)}</div>
      <div class="m">${esc(fmtMes(chk.mes_referencia))}</div>
      <div class="st">${esc(statusLabel)}</div>
    </div>
  </div>
  <div class="infos">
    ${info('Veículo', veicDesc)}
    ${info('Placa', placaFmt)}
    ${info('Técnico', chk.tecnico_nome || '')}
    ${info('Hodômetro', chk.km != null ? `${Number(chk.km).toLocaleString('pt-BR')} km` : '')}
    ${info('Score de confiança', score != null ? `${score}%` : '')}
    ${info('Concluído em', fmtDT(chk.fim_em))}
    ${info('Itens', `${itens.length}`)}
    ${info('Problemas', `${itens.filter((i) => String(i.resposta || '').toLowerCase().includes('problema')).length}`)}
  </div>
  ${itensHtml}
  <div class="foot">Gerado pelo Portal Nova Tratores — dados do NT Mecânico</div>
</body></html>`;

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
