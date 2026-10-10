"""POPs — Fase 5: carrega os MODELOS DO SISTEMA (src/lib/pops/modelos-sistema.json).

    python scripts/pops-seed-modelos.py                 # simula (não grava nada)
    python scripts/pops-seed-modelos.py --gravar        # grava
    python scripts/pops-seed-modelos.py --gravar --dono outro@email

* Usa as MESMAS funções do banco das rotas (pops_criar com template 'sistema',
  pops_salvar_rascunho) e respeita os triggers de imutabilidade.
* Seed publica direto (rascunho → em_revisao → publicado, changelog "Modelo
  inicial do sistema"), SEM ticket de revisão: é o ponto de partida da
  biblioteca. Toda edição depois passa pela aprovação normal (admin do módulo).
* Idempotente: modelo do sistema com o mesmo título já existente é pulado.
* Conteúdo já validado por src/lib/pops/__tests__/modelos-sistema.test.ts
  (mesma regra das rotas) — rode o vitest antes de gravar.
* Dono padrão: o 1º Dev do portal (antonio.novatratores@gmail.com). O admin
  troca o dono depois pela tela.
"""
import argparse, datetime, json, sys, urllib.error, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
ap = argparse.ArgumentParser()
ap.add_argument('--gravar', action='store_true')
ap.add_argument('--dono', default='antonio.novatratores@gmail.com')
args = ap.parse_args()

env = {}
for l in open('.env.local', encoding='utf-8'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']; SRV = env['SUPABASE_SERVICE_ROLE_KEY']


def rest(path, method='GET', body=None):
    rq = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                                data=json.dumps(body).encode() if body is not None else None,
                                headers={'apikey': SRV, 'Authorization': 'Bearer ' + SRV,
                                         'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    try:
        r = urllib.request.urlopen(rq, timeout=60); t = r.read()
        return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} → {e.code} {(e.read() or b"").decode(errors="replace")[:300]}')


dados = json.load(open('src/lib/pops/modelos-sistema.json', encoding='utf-8'))
areas = {a['sigla']: a for a in rest('pops_areas?select=id,sigla,ativo')}
dono = rest(f"financeiro_usu?select=id,nome,ativo&email=eq.{args.dono}")
if not dono or dono[0].get('ativo') is False:
    raise SystemExit(f'Dono {args.dono} não encontrado ou inativo.')
DONO = dono[0]['id']
existentes = {p['titulo'] for p in rest("pops?select=titulo&template_tipo=eq.sistema")}
agora = datetime.datetime.now(datetime.timezone.utc).isoformat()

print(f"{'GRAVANDO' if args.gravar else 'SIMULAÇÃO'} — dono: {dono[0]['nome']}")
criados = 0
for m in dados['modelos']:
    validar = sum(json.dumps(p, ensure_ascii=False).count('[VALIDAR:') for p in m['passos'])
    linha = f"  {m['area']} · {m['titulo']} — {len(m['passos'])} passos, {validar} [VALIDAR]"
    if m['titulo'] in existentes:
        print(linha + ' — já existe, pulado'); continue
    area = areas.get(m['area'])
    if not area or not area['ativo']:
        print(linha + ' — ÁREA inexistente/inativa, pulado'); continue
    if not args.gravar:
        print(linha + ' — seria criado'); continue

    r = rest('rpc/pops_criar', 'POST', {'p_area': area['id'], 'p_titulo': m['titulo'], 'p_dono': DONO,
                                        'p_autor': DONO, 'p_template_tipo': 'sistema', 'p_periodicidade': 365})
    v = r['versao_id']
    rest('rpc/pops_salvar_rascunho', 'POST', {'p_versao': v, 'p_passos': m['passos'], 'p_cabecalho': {
        'objetivo': m['objetivo'], 'escopo': m['escopo'], 'materiais': m.get('materiais', '')}})
    rest(f'pops_versoes?id=eq.{v}', 'PATCH', {'estado': 'em_revisao', 'changelog': 'Modelo inicial do sistema (carga da Fase 5).',
                                             'submetido_por': DONO, 'submetido_em': agora})
    rest(f'pops_versoes?id=eq.{v}', 'PATCH', {'estado': 'publicado', 'aprovado_por': DONO, 'aprovado_em': agora,
                                             'publicado_por': DONO, 'publicado_em': agora})
    proxima = (datetime.date.today() + datetime.timedelta(days=365)).isoformat()
    rest(f"pops?id=eq.{r['pop_id']}", 'PATCH', {'proxima_revisao_em': proxima, 'revisado_em': agora, 'revisado_por': DONO})
    criados += 1
    print(linha + f" — criado {r['codigo']}")

print(f'\n{criados} criado(s).' if args.gravar else '\nNada gravado (use --gravar).')
