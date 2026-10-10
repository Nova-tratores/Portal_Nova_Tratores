# Prova de runtime dos crons de reuniões (dev com CRON_SECRET=teste-local). Cria e apaga dados TESTE-CRON.
import json, os, urllib.request, urllib.error, datetime
env = {}
for l in open('.env.local', encoding='utf-8'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']; SRV = env['SUPABASE_SERVICE_ROLE_KEY']
sess = json.load(open(os.environ['TEMP'] + '/sess.json')); TOK = sess['access_token']; ME = sess['user']['id']
SECRET = 'teste-local'
def api(path, body=None, method=None, cron=False):
    h = {'Content-Type': 'application/json'}
    h.update({'x-cron-secret': SECRET} if cron else {'Authorization': 'Bearer ' + TOK})
    rq = urllib.request.Request('http://localhost:3000' + path, method=method or ('POST' if body is not None or cron else 'GET'), data=json.dumps(body or {}).encode() if (body is not None or cron) else None, headers=h)
    try: r = urllib.request.urlopen(rq, timeout=180); return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def rest(path, method='GET', body=None):
    rq = urllib.request.Request(URL + '/rest/v1/' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'apikey': SRV, 'Authorization': 'Bearer ' + SRV, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    try: r = urllib.request.urlopen(rq, timeout=60); return r.status, json.load(r)
    except urllib.error.HTTPError as e: return e.code, (e.read() or b'')[:200].decode(errors='replace')
ok = 0; falhas = []
def check(n, c, extra=''):
    global ok
    if c: ok += 1; print('  ok  ', n)
    else: falhas.append(n); print('  FAIL', n, extra)

hoje = datetime.date.today()
agora = datetime.datetime.now()
try:
    print('[auth]')
    st, _ = api('/api/reunioes/cron/corte-pauta', method='POST'); check('sem secret → 401', st == 401)
    # série semanal cujo dia_semana é daqui a 3 dias (garante instância futura dentro de 14 d)
    alvo = hoje + datetime.timedelta(days=3); ds = (alvo.weekday() + 1) % 7
    st, j = api('/api/reunioes/series', {'nome': 'TESTE-CRON Serie', 'recorrencia': 'semanal', 'dia_semana': ds, 'hora': '09:00'}); serie = j['serie']['id']
    print('[gerar-instancias]')
    st, j = api('/api/reunioes/cron/gerar-instancias', cron=True); r = j.get('resultado', {})
    check('1ª rodada cria instâncias (<= 14 d)', st == 200 and len([c for c in r.get('criadas', []) if 'TESTE-CRON' in c]) >= 1, j)
    st, j2 = api('/api/reunioes/cron/gerar-instancias', cron=True)
    check('2ª rodada idempotente (0 novas da série)', st == 200 and not [c for c in j2.get('resultado', {}).get('criadas', []) if 'TESTE-CRON' in c], j2)
    st, inst = rest(f"tickets?select=id,prazo,reuniao_etapa&reuniao_serie_id=eq.{serie}&order=prazo")
    check('instância no dia certo', inst and inst[0]['prazo'] == alvo.isoformat(), inst)
    st, s2 = rest(f"reunioes_series?select=instancias_geradas&id=eq.{serie}"); check('instancias_geradas incrementado', s2 and s2[0]['instancias_geradas'] >= 1, s2)

    print('[corte-pauta]')
    # reunião hoje daqui a 1 h → corte (18 h) já passou
    hora = (agora + datetime.timedelta(hours=1)).strftime('%H:%M')
    st, j = api('/api/reunioes', {'dia': hoje.isoformat(), 'hora': hora, 'titulo': 'TESTE-CRON corte'}); rc = j['reuniao']['id']
    api(f'/api/reunioes/{rc}/itens', {'acao': 'incluir', 'pergunta': 'Pergunta de teste?', 'tipo': 'decidir'})
    st, j = api('/api/reunioes/cron/corte-pauta', cron=True); r = j.get('resultado', {})
    check('corte fecha a pauta (fechadas >= 1)', st == 200 and r.get('fechadas', 0) >= 1, j)
    st, t = rest(f"tickets?select=reuniao_etapa,status&id=eq.{rc}"); check('etapa pauta_fechada / status aberto', t and t[0]['reuniao_etapa'] == 'pauta_fechada' and t[0]['status'] == 'aberto', t)
    st, j = api('/api/reunioes/cron/corte-pauta', cron=True); check('2ª rodada não refaz (fechadas 0)', st == 200 and j.get('resultado', {}).get('fechadas') == 0, j)
    st, ev = rest(f"tickets_eventos?select=tipo,payload,autor_id&ticket_id=eq.{rc}&tipo=eq.reuniao_etapa"); check('evento reuniao_etapa auto com autor null', ev and ev[0]['payload'].get('auto') is True and ev[0]['autor_id'] is None, ev)

    print('[lembrete-ata]')
    st, j = api('/api/reunioes', {'dia': hoje.isoformat(), 'hora': hora, 'titulo': 'TESTE-CRON ata'}); ra = j['reuniao']['id']
    api(f'/api/reunioes/{ra}/acoes', {'acao': 'etapa', 'para': 'em_andamento'})
    rest(f"tickets?id=eq.{ra}", 'PATCH', {'reuniao_inicio': (agora - datetime.timedelta(hours=25)).astimezone().isoformat()})
    st, j = api('/api/reunioes/cron/lembrete-ata', cron=True); check('lembra 1 (24 h+ sem ata)', st == 200 and j.get('resultado', {}).get('lembradas') == 1, j)
    st, j = api('/api/reunioes/cron/lembrete-ata', cron=True); check('2ª rodada não repete (0)', st == 200 and j.get('resultado', {}).get('lembradas') == 0, j)
    st, n = rest(f"portal_notificacoes?select=id,titulo&user_id=eq.{ME}&titulo=like.Ata%20pendente*&order=created_at.desc&limit=1"); check('notificação "Ata pendente" ao condutor', n and len(n) == 1, n)
    st, runs = rest("cron_runs?select=job,status&job=like.reunioes-*&order=iniciado_em.desc&limit=3"); check('cron_runs registrou', st == 200 and len(runs) >= 1, runs)
finally:
    print('[limpeza]')
    st, t = rest("tickets?select=id&titulo=like.TESTE-CRON*"); [rest(f"tickets?id=eq.{x['id']}", 'DELETE') for x in t]
    st, t2 = rest(f"tickets?select=id&reuniao_serie_id=not.is.null&titulo=like.*TESTE-CRON*"); [rest(f"tickets?id=eq.{x['id']}", 'DELETE') for x in t2]
    st, s = rest("reunioes_series?select=id&nome=like.TESTE-CRON*")
    for x in s:
        rest(f"tickets?reuniao_serie_id=eq.{x['id']}", 'DELETE'); rest(f"reunioes_series?id=eq.{x['id']}", 'DELETE')
    rest(f"portal_notificacoes?user_id=eq.{ME}&titulo=like.*TESTE-CRON*", 'DELETE')
    st, rt = rest("tickets?select=id&or=(titulo.like.TESTE-CRON*,titulo.like.*TESTE-CRON*)"); print('  restantes:', len(rt) if st == 200 else rt)
print(f'RESULTADO: {ok} ok, {len(falhas)} falhas', falhas)
