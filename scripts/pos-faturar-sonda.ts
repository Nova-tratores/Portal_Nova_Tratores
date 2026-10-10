// Sonda SÓ DE LEITURA do faturamento de OS (docs/pos-faturar-os-plano.md, rollout passo 2):
// ConsultarOS + StatusOS em OS reais do POS. Nenhuma escrita no Omie nem no banco.
// Uso: npx tsx scripts/pos-faturar-sonda.ts
process.loadEnvFile('.env.local');
import { createClient } from '@supabase/supabase-js';
import { conferirIdentidade, estadoNoOmie, situacaoNfse } from '../src/lib/pos/faturamento-regras';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function omie(ep: string, call: string, param: Record<string, unknown>) {
  const r = await fetch(`https://app.omie.com.br/api/v1${ep}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call, app_key: process.env.OMIE_APP_KEY || process.env.OMIE_APP_KEY_NOVA, app_secret: process.env.OMIE_APP_SECRET || process.env.OMIE_APP_SECRET_NOVA, param: [param] }) });
  return r.json();
}
(async () => {
  const { data: abertas } = await sb.from('Ordem_Servico').select('Id_Ordem, Ordem_Omie, Status, Valor_Total').eq('Status', 'Cobrando Cliente').not('Ordem_Omie', 'is', null).order('Id_Ordem', { ascending: false }).limit(3);
  const { data: concl } = await sb.from('Ordem_Servico').select('Id_Ordem, Ordem_Omie, Status, Valor_Total').eq('Status', 'Concluída').not('Ordem_Omie', 'is', null).eq('Servico_Interno', false).order('Id_Ordem', { ascending: false }).limit(2);
  for (const os of [...(abertas || []), ...(concl || [])]) {
    const c = await omie('/servicos/os/', 'ConsultarOS', { cCodIntOS: os.Id_Ordem });
    if (c.faultstring) { console.log(os.Id_Ordem, 'FAULT', c.faultstring); continue; }
    console.log('\n==', os.Id_Ordem, os.Status, 'portal Ordem_Omie=', os.Ordem_Omie, 'valor portal', os.Valor_Total);
    console.log(' Cabecalho:', JSON.stringify({ nCodOS: c.Cabecalho?.nCodOS, cNumOS: c.Cabecalho?.cNumOS, cCodIntOS: c.Cabecalho?.cCodIntOS, cEtapa: c.Cabecalho?.cEtapa, nValorTotal: c.Cabecalho?.nValorTotal, cCodParc: c.Cabecalho?.cCodParc, nQtdeParc: c.Cabecalho?.nQtdeParc }));
    console.log(' InfoCadastro:', JSON.stringify({ cFaturada: c.InfoCadastro?.cFaturada, cCancelada: c.InfoCadastro?.cCancelada, dDtFat: c.InfoCadastro?.dDtFat }));
    console.log(' Parcelas:', JSON.stringify(c.Parcelas)?.slice(0, 300), '| chaves topo:', Object.keys(c).join(','));
    console.log(' identidade:', conferirIdentidade({ idOrdem: os.Id_Ordem, ordemOmie: String(os.Ordem_Omie) }, c.Cabecalho) ?? 'OK', '| estado:', estadoNoOmie(c.Cabecalho, c.InfoCadastro));
    if (c.InfoCadastro?.cFaturada === 'S') {
      const st = await omie('/servicos/os/', 'StatusOS', { nCodOS: c.Cabecalho.nCodOS, lMsg: true });
      const l = st.ListaRpsNfse || [];
      console.log(' StatusOS RPS:', JSON.stringify(l.map((x: any) => ({ cStatusRps: x.cStatusRps, cStatusLote: x.cStatusLote, nNfse: x.nNfse, msgs: x.mensagens ? JSON.stringify(x.mensagens).slice(0, 120) : null }))));
      console.log(' situacaoNfse:', JSON.stringify(situacaoNfse(l)));
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
})();
