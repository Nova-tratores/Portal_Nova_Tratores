import json, os, sys, urllib.request, urllib.error, datetime
env = {}
for l in open('.env.local', encoding='utf-8'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']; SRV = env['SUPABASE_SERVICE_ROLE_KEY']; ANON = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
sess = json.load(open(os.environ['TEMP'] + '/sess.json'))
TOK = sess['access_token']; ME = sess['user']['id']
BASE = 'http://localhost:3000'

def api(path, method='GET', body=None, token=TOK):
    rq = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(rq, timeout=120); return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}

def rest(path, method='GET', body=None, key=SRV):
    rq = urllib.request.Request(URL + '/rest/v1/' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=representation'})
    try:
        r = urllib.request.urlopen(rq, timeout=60); return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, (e.read() or b'')[:200].decode(errors='replace')

ok = 0; falhas = []
def check(nome, cond, extra=''):
    global ok
    if cond: ok += 1; print(f'  ok   {nome}')
    else: falhas.append(nome); print(f'  FAIL {nome} {extra}')

# outro usuário ativo (de teste, se houver) para o aceite pendente
st, usu = rest("financeiro_usu?select=id,nome,ativo&ativo=eq.true&nome=ilike.*teste*&limit=1")
outro = usu[0] if st == 200 and usu else None
print('outro usuário de teste:', outro['nome'] if outro else 'nenhum (R8 pendente será só com o próprio condutor)')

hoje = datetime.date.today()
def prox_util(d, n):
    d = d + datetime.timedelta(days=n)
    while d.weekday() >= 5: d += datetime.timedelta(days=1)
    return d
dia1 = prox_util(hoje, 1); dia2 = prox_util(dia1, 7)
criados = {'tickets': [], 'series': []}
try:
    print('\n[séries]')
    st, j = api('/api/reunioes/series', 'POST', {'nome': 'TESTE-SERIE crons', 'recorrencia': 'semanal', 'dia_semana': dia1.weekday() + 1 if dia1.weekday() < 6 else 0, 'hora': '10:00', 'corte_antecedencia_horas': 18, 'participantes_padrao': [outro['id']] if outro else []})
    check('POST série 200', st == 200, j); serie = j.get('serie'); criados['series'].append(serie['id'])
    st, j = api('/api/reunioes/series/' + serie['id'], 'PATCH', {'corte_antecedencia_horas': 999}); check('PATCH série corte 999 → 400', st == 400)
    st, j = api('/api/reunioes/series'); check('GET séries lista a criada', st == 200 and any(s['id'] == serie['id'] for s in j['series']))

    print('\n[reunião 1 — pauta]')
    st, j = api('/api/reunioes', 'POST', {'serie_id': serie['id'], 'dia': dia1.isoformat(), 'hora': '10:00', 'titulo': 'TESTE-REUNIAO 1'})
    check('POST reunião 200', st == 200, j); r1 = j['reuniao']; criados['tickets'].append(r1['id'])
    check('ticket tipo=reuniao etapa=agendada status=aberto prazo=dia', r1['tipo'] == 'reuniao' and r1['reuniao_etapa'] == 'agendada' and r1['status'] == 'aberto' and r1['prazo'] == dia1.isoformat())
    check('aceite ok (sem pendente)', r1.get('aceite') == 'ok')
    st, j = api('/api/reunioes/' + r1['id']); check('GET reunião', st == 200, j)
    check('condutor = eu; posso_conduzir', j['condutor_id'] == ME and j['posso_conduzir'] is True)
    check('R1 bloco de pendências presente (vazio)', 'pendencias' in j and j['pendencias']['atrasadas'] == [])
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'incluir', 'pergunta': 'Trocar o cron das 03h?', 'tipo': 'decidir', 'tempo_min': 10}); check('R5 incluir item decidir', st == 200, j); it1 = j['item']
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'incluir', 'pergunta': 'Status do deploy', 'tipo': 'informar'}); check('incluir item informar', st == 200, j); it2 = j['item']
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'incluir', 'pergunta': 'x', 'tipo': 'votar'}); check('tipo inválido → 400', st == 400)
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'reordenar', 'ordem': [it2['id'], it1['id']]}); check('reordenar', st == 200 and j['ordem'][it2['id']] == 0)
    # Pra organizar / fila não mostram a reunião (C6); cronograma geral mostra
    st, j = api('/api/trabalho/central'); check('C6 reunião fora de "Pra organizar"', st == 200 and not any(t['id'] == r1['id'] for t in j.get('praOrganizar', [])), str(j)[:100])
    st, j = api('/api/trabalho/fila'); check('C6 reunião fora da fila', st == 200 and r1['id'] not in json.dumps(j))
    st, j = api('/api/trabalho/cronograma-geral'); check('C6 reunião NO cronograma geral', st == 200 and r1['id'] in json.dumps(j))
    st, j = api(f'/api/tickets/{r1["id"]}/acoes', 'POST', {'acao': 'status', 'para': 'em_andamento'}); check('C7 status genérico recusa reunião', st == 400 and 'reuni' in j.get('error', '').lower())
    st, j = api(f'/api/tickets/{r1["id"]}/acoes', 'POST', {'acao': 'transferir', 'para': ME}); check('C7 transferir genérico recusa reunião', st == 400)

    print('\n[condução]')
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'etapa', 'para': 'ata_rascunho'}); check('transição inválida agendada→ata_rascunho = 409', st == 409)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'etapa', 'para': 'em_andamento'}); check('etapa → em_andamento', st == 200, j)
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'incluir', 'pergunta': 'Fora da pauta', 'tipo': 'discutir', 'parking': True}); check('R13 parking lot (urgente, origem parking)', st == 200 and j['item']['urgente'] is True and j['item']['origem'] == 'parking', j); it3 = j['item']
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'item_resultado', 'item_id': it1['id'], 'resultado': 'decidido', 'decisao_texto': 'Sim'}); check('R7 decidido sem motivo → 400', st == 400)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'publicar_ata'}); check('R7 publicar com decidir sem resultado → 409', st == 409 and j.get('pendentes'))
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'item_resultado', 'item_id': it1['id'], 'resultado': 'decidido', 'decisao_texto': 'Trocar', 'decisao_motivo': 'Duplica à noite'}); check('R7 decidido com motivo', st == 200, j)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'item_resultado', 'item_id': it2['id'], 'resultado': 'informado'}); check('informar → informado', st == 200)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'item_resultado', 'item_id': it3['id'], 'resultado': 'parking'}); check('discutir → parking', st == 200)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'criar_acao', 'titulo': 'TESTE-ACAO sem prazo', 'responsavel_id': ME}); check('R8 ação sem prazo → 400', st == 400)
    resp = outro['id'] if outro else ME
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'criar_acao', 'titulo': 'TESTE-ACAO trocar cron', 'responsavel_id': resp, 'prazo': dia1.isoformat(), 'item_id': it1['id']}); check('R8 criar ação', st == 200, j); acao = j['ticket']; criados['tickets'].append(acao['id'])
    check('ação: generico, origem_reuniao_id, solicitante=condutor, aceite ' + ('pendente' if outro else 'ok'), acao['tipo'] == 'generico' and acao['origem_reuniao_id'] == r1['id'] and acao['solicitante_id'] == ME and acao['aceite'] == ('pendente' if outro else 'ok'))
    st, j = api('/api/trabalho/hoje', token=TOK); check('hoje responde', st == 200)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'presenca', 'usuario_id': ME, 'presente': True}); check('presença', st == 200)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'publicar_ata'}); check('publicar ata (em_andamento → rascunho → publicada)', st == 200 and j.get('ata'), j)
    ata = j.get('ata') or {}
    check('texto WhatsApp com cabeçalho e ação', ata.get('texto_whatsapp', '').startswith('📋') and 'TESTE-ACAO' in ata.get('texto_whatsapp', ''), ata.get('texto_whatsapp'))
    st, j = api('/api/reunioes/' + r1['id']); check('etapa ata_publicada / status resolvido', j['reuniao']['reuniao_etapa'] == 'ata_publicada' and j['reuniao']['status'] == 'resolvido')
    st, j = api(f'/api/reunioes/{r1["id"]}/itens', 'POST', {'acao': 'editar', 'item_id': it2['id'], 'pergunta': 'x'}); check('R10 editar item após ata → 409', st == 409)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'publicar_ata'}); check('R10 publicar de novo → 409', st == 409)
    st, j = api(f'/api/reunioes/{r1["id"]}/acoes', 'POST', {'acao': 'adendo', 'texto': 'Corrigindo: o cron é das 03h30.'}); check('R10 adendo ok', st == 200)
    st, ev = rest(f"tickets_eventos?select=tipo&ticket_id=eq.{r1['id']}")
    tipos = sorted(set(e['tipo'] for e in ev)) if st == 200 else []
    check('eventos: reuniao_etapa, item_resultado, acao_criada, ata_publicada, ata_adendo', all(t in tipos for t in ['reuniao_etapa', 'item_resultado', 'acao_criada', 'ata_publicada', 'ata_adendo']), tipos)

    print('\n[reunião 2 — pendências e R4]')
    # a ação fica atrasada: prazo no passado via service role (simula o tempo passando)
    rest(f"tickets?id=eq.{acao['id']}", 'PATCH', {'prazo': (hoje - datetime.timedelta(days=3)).isoformat()})
    st, j = api('/api/reunioes', 'POST', {'serie_id': serie['id'], 'dia': dia2.isoformat(), 'hora': '10:00', 'titulo': 'TESTE-REUNIAO 2'}); check('POST reunião 2', st == 200, j); r2 = j['reuniao']; criados['tickets'].append(r2['id'])
    st, j = api('/api/reunioes/' + r2['id']); check('R13 sugestão parking_anterior puxada', any(i['origem'] == 'parking_anterior' and i['item_origem_id'] == it3['id'] for i in j['itens']), [i['origem'] for i in j['itens']])
    check('R2 ação atrasada no bloco da próxima reunião', any(p['id'] == acao['id'] for p in j['pendencias']['atrasadas']), j['pendencias'])
    check('R2 concluídas só contagem', isinstance(j['pendencias']['concluidas']['n'], int))
    # três dias úteis DISTINTOS a partir de amanhã
    uteis = []; d = hoje
    while len(uteis) < 3:
        d = prox_util(d, 1); uteis.append(d.isoformat())
    d1, d2, d3 = uteis
    st, j = api(f'/api/reunioes/{r2["id"]}/acoes', 'POST', {'acao': 'tratar_pendencia', 'ticket_id': acao['id'], 'saida': 'novo_prazo', 'prazo': d1}); check('R3 novo prazo 1', st == 200 and j.get('reprogramacoes') == 1, j)
    # 2ª reprogramação pela tela normal do ticket (editar) — também conta
    st, j = api(f'/api/tickets/{acao["id"]}/acoes', 'POST', {'acao': 'editar', 'prazo': d2}); check('C4 editar prazo pela tela normal → 200', st == 200, j)
    st, t = rest(f"tickets?select=prazo_reprogramacoes&id=eq.{acao['id']}"); check('C4 reprogramações = 2 após editar', t and t[0]['prazo_reprogramacoes'] == 2, t)
    rest(f"tickets?id=eq.{acao['id']}", 'PATCH', {'prazo': (hoje - datetime.timedelta(days=1)).isoformat()})
    st, j = api('/api/reunioes/' + r2['id']); pend = [p for p in j['pendencias']['atrasadas'] if p['id'] == acao['id']]
    check('R4 bloqueada_novo_prazo=true', pend and pend[0]['bloqueada_novo_prazo'] is True, pend)
    st, j = api(f'/api/reunioes/{r2["id"]}/acoes', 'POST', {'acao': 'tratar_pendencia', 'ticket_id': acao['id'], 'saida': 'novo_prazo', 'prazo': d3}); check('R4 3º novo prazo → 409 pela API', st == 409, j)
    st, j = api(f'/api/reunioes/{r2["id"]}/acoes', 'POST', {'acao': 'tratar_pendencia', 'ticket_id': acao['id'], 'saida': 'escalar'}); check('R4 escalar cria item na PRÓXIMA reunião (instância gerada)', st == 200 and j.get('item_id') and j.get('reuniao_id'), j)
    if j.get('reuniao_id'): criados['tickets'].append(j['reuniao_id'])
    st, j2 = api('/api/reunioes/' + j['reuniao_id']); check('item origem pendencia_escalada aponta para a ação', any(i['origem'] == 'pendencia_escalada' and i['ticket_referencia_id'] == acao['id'] for i in j2['itens']))
    st, j = api(f'/api/reunioes/{r2["id"]}/acoes', 'POST', {'acao': 'tratar_pendencia', 'ticket_id': acao['id'], 'saida': 'cancelar', 'motivo': 'teste'}); check('R3 cancelar', st == 200)
    st, t = rest(f"tickets?select=status&id=eq.{acao['id']}"); check('ação cancelada', t and t[0]['status'] == 'cancelado')
    st, ev = rest(f"tickets_eventos?select=tipo&ticket_id=eq.{acao['id']}&tipo=eq.pendencia_tratada"); check('eventos pendencia_tratada na ação (3: novo prazo, escalar, cancelar; o 3º prazo recusado não gera)', st == 200 and len(ev) == 3, len(ev) if st == 200 else ev)

    print('\n[RLS pelo navegador]')
    st, a = rest(f"reunioes_itens?select=id&reuniao_id=eq.{r1['id']}", key=ANON); check('anon não lê itens ([] ou 401)', st == 401 or (st == 200 and a == []), (st, a))
    rq = urllib.request.Request(URL + f"/rest/v1/reunioes_itens?select=id&reuniao_id=eq.{r1['id']}", headers={'apikey': ANON, 'Authorization': 'Bearer ' + TOK})
    mine = json.load(urllib.request.urlopen(rq, timeout=30)); check('participante lê itens via RLS', len(mine) >= 3, len(mine))
    rq = urllib.request.Request(URL + f"/rest/v1/reunioes_ata?select=reuniao_id&reuniao_id=eq.{r1['id']}", headers={'apikey': ANON, 'Authorization': 'Bearer ' + TOK})
    check('participante lê ata via RLS', len(json.load(urllib.request.urlopen(rq, timeout=30))) == 1)
    st, s = rest("reunioes_series?select=id", key=ANON); check('anon não lê séries', st == 401 or s == [])
finally:
    print('\n[limpeza]')
    for t in criados['tickets']:
        rest(f"tickets?id=eq.{t}", 'DELETE')
    for s in criados['series']:
        rest(f"reunioes_series?id=eq.{s}", 'DELETE')
    st, rest_t = rest("tickets?select=id&titulo=like.TESTE-*"); print('  tickets TESTE restantes:', len(rest_t) if st == 200 else rest_t)
    st, rest_s = rest("reunioes_series?select=id&nome=like.TESTE-*"); print('  séries TESTE restantes:', len(rest_s) if st == 200 else rest_s)
print(f'\nRESULTADO: {ok} ok, {len(falhas)} falhas', falhas)
