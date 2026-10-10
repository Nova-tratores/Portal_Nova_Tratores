"""POPs — Fase 1: prova as regras do BANCO (sql/pops-01-schema.sql) direto pelo REST.

Roda contra o Supabase do .env.local, sem servidor Next:
    python scripts/teste-pops-banco.py

* anon: não lê nem grava nenhuma tabela pops_*;
* usuário comum (o "Mecânico Teste", sem módulo pops): lê POP PUBLICADO, não lê
  rascunho, não grava nada, só vê a execução se estiver no ticket;
* service role (o que as rotas usam): mesmo ela esbarra na imutabilidade,
  na máquina de estados, no encerramento com obrigatório pendente, nas FKs
  compostas e na idempotência do agendamento.

Fixture PERMANENTE: área TST (inativa) + POP "TESTE-POP banco". Versão publicada
não pode ser apagada (é a regra testada), então o script reaproveita o POP e
cada rodada publica uma versão nova. Tickets e agendamentos de teste são apagados.
"""
import json, sys, urllib.request, urllib.error, datetime, uuid
sys.stdout.reconfigure(encoding='utf-8')

env = {}
for l in open('.env.local', encoding='utf-8'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']; SRV = env['SUPABASE_SERVICE_ROLE_KEY']; ANON = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']


def rest(path, method='GET', body=None, key=SRV, token=None, prefer='return=representation'):
    h = {'apikey': key, 'Authorization': 'Bearer ' + (token or key), 'Content-Type': 'application/json'}
    if prefer: h['Prefer'] = prefer
    rq = urllib.request.Request(URL + '/rest/v1/' + path, method=method,
                                data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        r = urllib.request.urlopen(rq, timeout=60)
        txt = r.read()
        return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = (e.read() or b'').decode(errors='replace')
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt[:300]


def auth_post(path, body, key):
    rq = urllib.request.Request(URL + path, data=json.dumps(body).encode(),
                                headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(rq, timeout=30))


ok = 0; falhas = []
def check(nome, cond, extra=''):
    global ok
    if cond: ok += 1; print(f'  ok   {nome}')
    else: falhas.append(nome); print(f'  FAIL {nome} {str(extra)[:220]}')

def erro_pop(st, j):  # recusa vinda dos triggers/constraints
    return st >= 400 and isinstance(j, dict)

def msg(j): return (j or {}).get('message', '') if isinstance(j, dict) else str(j)

TABELAS = ['pops_areas', 'pops_area_papeis', 'pops', 'pops_versoes', 'pops_passos', 'pops_agendamentos',
           'pops_execucoes', 'pops_execucao_respostas', 'pops_ciencia_exigida', 'pops_ciencias']

# --------------------------------------------------------------------------- migration aplicada?
st, j = rest('pops_areas?select=sigla&order=sigla')
if st != 200:
    print('Migration sql/pops-01-schema.sql NÃO aplicada (pops_areas):', st, j); sys.exit(2)
check('8 áreas do seed', {'OFI', 'PEC', 'VEN', 'FIS', 'FIN', 'RH', 'ADM', 'FRO'} <= {a['sigla'] for a in j}, j)

# --------------------------------------------------------------------------- usuários
st, u2 = rest("financeiro_usu?select=id,email,nome&nome=ilike.*teste*&ativo=eq.true&order=nome&limit=1")
if not u2: print('Sem usuário de teste (nome com "teste") em financeiro_usu'); sys.exit(2)
COMUM = u2[0]['id']
st, perm = rest(f"portal_permissoes?select=is_admin,is_dev,modulos_permitidos&user_id=eq.{COMUM}")
mods = (perm[0].get('modulos_permitidos') or []) if perm else []
eh_admin = bool(perm and (perm[0].get('is_admin') or perm[0].get('is_dev')))
check('usuário comum não é admin nem tem módulo pops', not eh_admin and not any(m == 'pops' or m.startswith('pops:') for m in mods),
      (perm, u2[0]['nome']))
st, devs = rest("portal_permissoes?select=user_id&is_dev=eq.true&order=user_id&limit=1")
DONO = devs[0]['user_id']
g = auth_post('/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': u2[0]['email']}, SRV)
th = g.get('hashed_token') or g.get('properties', {}).get('hashed_token')
TOK2 = auth_post('/auth/v1/verify', {'type': 'magiclink', 'token_hash': th}, ANON)['access_token']
check('token do usuário comum', bool(TOK2))

def comum(path, method='GET', body=None): return rest(path, method, body, key=ANON, token=TOK2)
def anon(path, method='GET', body=None): return rest(path, method, body, key=ANON)

criados = {'tickets': [], 'agend': []}
agora = datetime.datetime.now(datetime.timezone.utc).isoformat()
try:
    # ----------------------------------------------------------------------- fixture
    print('\n[fixture]')
    st, a = rest("pops_areas?select=id&sigla=eq.TST")
    if not a:
        st, a = rest('pops_areas', 'POST', {'sigla': 'TST', 'nome': 'Área de teste (scripts)', 'ativo': False})
    AREA = a[0]['id']
    st, p = rest(f"pops?select=id&codigo=eq.TST-001")
    if not p:
        st, p = rest('pops', 'POST', {'area_id': AREA, 'codigo': 'TST-001', 'titulo': 'TESTE-POP banco', 'dono_id': DONO, 'criado_por': DONO})
    POP = p[0]['id']
    st, vs = rest(f"pops_versoes?select=id,numero,estado&pop_id=eq.{POP}&order=numero.desc")
    # sobra de rodada interrompida
    for v in vs:
        if v['estado'] == 'em_revisao': rest(f"pops_versoes?id=eq.{v['id']}", 'PATCH', {'estado': 'rascunho'})
    for v in vs:
        if v['estado'] in ('rascunho', 'em_revisao'): rest(f"pops_versoes?id=eq.{v['id']}", 'DELETE')
    st, vs = rest(f"pops_versoes?select=id,numero,estado&pop_id=eq.{POP}&order=numero.desc")
    anterior = next((v for v in vs if v['estado'] == 'publicado'), None)
    proximo = (vs[0]['numero'] + 1) if vs else 1
    print('  POP', POP, '· próxima versão', proximo, '· publicada atual', anterior and anterior['numero'])

    # ----------------------------------------------------------------------- versão: rascunho → revisão → publicado
    print('\n[versão: máquina de estados e imutabilidade]')
    st, j = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo, 'estado': 'publicado', 'criado_por': DONO})
    check('versão não nasce publicada', erro_pop(st, j), (st, j))
    st, j = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo, 'objetivo': 'Testar o banco', 'criado_por': DONO})
    check('rascunho criado', st == 201, (st, j)); V = j[0]['id']
    st, j = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo + 1, 'criado_por': DONO})
    check('R4 só um rascunho por POP (23505)', st == 409 and j.get('code') == '23505', (st, j))
    passos = [
        {'versao_id': V, 'ordem': 1, 'tipo': 'instrucao', 'titulo': 'Leia', 'obrigatorio': True},
        {'versao_id': V, 'ordem': 2, 'tipo': 'check', 'titulo': 'Pneus ok?', 'obrigatorio': True},
        {'versao_id': V, 'ordem': 3, 'tipo': 'foto', 'titulo': 'Fotos', 'obrigatorio': True, 'config': {'min_fotos': 2}},
        {'versao_id': V, 'ordem': 4, 'tipo': 'numero', 'titulo': 'Pressão', 'obrigatorio': True, 'config': {'unidade': 'psi', 'min': 20, 'max': 40}},
        {'versao_id': V, 'ordem': 5, 'tipo': 'texto', 'titulo': 'Obs', 'obrigatorio': False},
    ]
    for x in passos: x.setdefault('config', {})   # lote do PostgREST exige as mesmas chaves
    st, j = rest('pops_passos', 'POST', passos)
    check('passos no rascunho', st == 201 and len(j) == 5, (st, j)); P = {x['ordem']: x['id'] for x in j}
    st, j = rest(f"pops_passos?id=eq.{P[5]}", 'PATCH', {'ajuda': 'livre no rascunho'})
    check('passo editável no rascunho', st == 200, (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'estado': 'publicado'})
    check('R3 rascunho não pula para publicado', erro_pop(st, j), (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'estado': 'em_revisao'})
    check('R5 changelog obrigatório (23514)', st == 400 and j.get('code') == '23514', (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'estado': 'em_revisao', 'changelog': f'v{proximo}: teste', 'submetido_por': DONO, 'submetido_em': agora})
    check('submetido para revisão', st == 200, (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'objetivo': 'mudei na revisão'})
    check('R1 em_revisao não muda conteúdo', erro_pop(st, j) and 'imutável' in msg(j), (st, j))
    st, j = rest('pops_passos', 'POST', {'versao_id': V, 'ordem': 6, 'tipo': 'check', 'titulo': 'tarde demais'})
    check('R2 não inclui passo em revisão', erro_pop(st, j), (st, j))
    if anterior:
        st, j = rest(f"pops_versoes?id=eq.{anterior['id']}", 'PATCH', {'estado': 'obsoleto', 'obsoleto_em': agora})
        check('publicada anterior → obsoleta', st == 200, (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'estado': 'publicado', 'aprovado_por': DONO, 'aprovado_em': agora, 'publicado_por': DONO, 'publicado_em': agora})
    check('publicada', st == 200 and j[0]['estado'] == 'publicado', (st, j))
    # versão extra para provar "uma publicada só"
    st, j = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo + 1, 'criado_por': DONO}); V2 = j[0]['id']
    rest(f"pops_versoes?id=eq.{V2}", 'PATCH', {'estado': 'em_revisao', 'changelog': 'x'})
    st, j = rest(f"pops_versoes?id=eq.{V2}", 'PATCH', {'estado': 'publicado', 'aprovado_por': DONO, 'publicado_em': agora})
    check('R4 só uma publicada por POP (23505)', st == 409 and j.get('code') == '23505', (st, j))
    rest(f"pops_versoes?id=eq.{V2}", 'PATCH', {'estado': 'rascunho'})   # reprovar devolve
    st, j = rest(f"pops_versoes?id=eq.{V2}", 'DELETE')
    check('rascunho pode ser apagado', st in (200, 204), (st, j))

    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'objetivo': 'editar publicado'})
    check('R1 publicada não muda conteúdo', erro_pop(st, j), (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'PATCH', {'estado': 'rascunho'})
    check('R3 publicada não volta a rascunho', erro_pop(st, j), (st, j))
    st, j = rest(f"pops_versoes?id=eq.{V}", 'DELETE')
    check('R1 publicada não é apagada', erro_pop(st, j), (st, j))
    st, j = rest(f"pops_passos?id=eq.{P[2]}", 'PATCH', {'titulo': 'outro'})
    check('R2 passo da publicada não muda', erro_pop(st, j), (st, j))
    st, j = rest(f"pops_passos?id=eq.{P[2]}", 'DELETE')
    check('R2 passo da publicada não é apagado', erro_pop(st, j), (st, j))
    st, j = rest(f"pops?id=eq.{POP}", 'DELETE')
    check('R1 POP com versão publicada não é apagado', erro_pop(st, j), (st, j))
    if anterior:
        st, j = rest(f"pops_versoes?id=eq.{anterior['id']}", 'PATCH', {'estado': 'publicado'})
        check('R3 obsoleta não volta', erro_pop(st, j), (st, j))
        st, j = rest(f"pops_versoes?id=eq.{anterior['id']}", 'PATCH', {'escopo': 'x'})
        check('R1 obsoleta não muda conteúdo', erro_pop(st, j), (st, j))

    # ----------------------------------------------------------------------- execução
    print('\n[execução: ticket tipo pop]')
    st, j = rest('tickets', 'POST', {'tipo': 'pop', 'titulo': 'TESTE-POP execução', 'descricao': 'teste', 'status': 'resolvido',
                                     'solicitante_id': DONO, 'responsavel_id': DONO})
    check('ticket pop não nasce resolvido', erro_pop(st, j), (st, j))
    st, j = rest('tickets', 'POST', {'tipo': 'pop', 'titulo': 'TESTE-POP execução', 'descricao': 'teste',
                                     'solicitante_id': DONO, 'responsavel_id': DONO,
                                     'payload': {'pop_id': POP, 'pop_versao_id': V}})
    check('ticket pop criado', st == 201, (st, j)); T = j[0]['id']; criados['tickets'].append(T)
    st, j = rest(f"tickets?id=eq.{T}", 'PATCH', {'status': 'resolvido'})
    check('R8 sem execução vinculada não encerra', erro_pop(st, j) and 'sem execução' in msg(j), (st, j))
    st, j = rest('tickets', 'POST', {'titulo': 'TESTE-POP genérico', 'descricao': 'x', 'solicitante_id': DONO, 'responsavel_id': DONO})
    TG = j[0]['id']; criados['tickets'].append(TG)
    st, j = rest('pops_execucoes', 'POST', {'ticket_id': TG, 'pop_id': POP, 'versao_id': V})
    check('execução só em ticket tipo pop', erro_pop(st, j), (st, j))
    if anterior:
        st, j = rest('pops_execucoes', 'POST', {'ticket_id': T, 'pop_id': str(uuid.uuid4()), 'versao_id': V})
        check('R6 versão precisa ser do mesmo POP (FK composta)', erro_pop(st, j), (st, j))
    st, j = rest('pops_execucoes', 'POST', {'ticket_id': T, 'pop_id': POP, 'versao_id': V, 'ref_externa': 'OS-TESTE', 'data_referencia': datetime.date.today().isoformat()})
    check('execução vinculada à versão exata', st == 201, (st, j))
    if anterior:
        st, j = rest(f"pops_execucoes?ticket_id=eq.{T}", 'PATCH', {'versao_id': anterior['id']})
        check('R6 execução não troca de versão', erro_pop(st, j), (st, j))
        st, pa = rest(f"pops_passos?select=id&versao_id=eq.{anterior['id']}&limit=1")
        if pa:
            st, j = rest('pops_execucao_respostas', 'POST', {'ticket_id': T, 'versao_id': V, 'passo_id': pa[0]['id'], 'valor': {'sim': True}, 'respondido_por': DONO})
            check('R7 resposta só para passo da versão da execução', erro_pop(st, j), (st, j))
    st, j = rest('tickets_eventos', 'POST', {'ticket_id': T, 'autor_id': DONO, 'tipo': 'pop_resposta', 'payload': {'passo_id': P[2]}})
    check('CHECK de eventos aceita pop_resposta', st == 201, (st, j))
    st, j = rest('tickets_eventos', 'POST', {'ticket_id': T, 'autor_id': DONO, 'tipo': 'tipo_inventado'})
    check('CHECK de eventos recusa tipo desconhecido', st == 400 and j.get('code') == '23514', (st, j))
    st, j = rest(f"tickets_eventos?select=id&tipo=eq.ata_adendo&limit=1")
    check('CHECK de eventos manteve os tipos das Reuniões (leitura ok)', st == 200, (st, j))

    def responder(passo, valor=None, fotos=None, metodo='POST'):
        body = {'ticket_id': T, 'versao_id': V, 'passo_id': passo, 'valor': valor or {}, 'fotos': fotos or [], 'respondido_por': DONO}
        if metodo == 'POST':
            return rest('pops_execucao_respostas', 'POST', body, prefer='return=representation,resolution=merge-duplicates')
        return rest(f"pops_execucao_respostas?ticket_id=eq.{T}&passo_id=eq.{passo}", 'PATCH', {'valor': valor, 'fotos': fotos or []})

    responder(P[2], {'sim': False})
    responder(P[3], {}, ['a.jpg'])          # 1 foto, mínimo 2
    responder(P[4], {'numero': 55})         # fora da faixa = válido (só alerta)
    st, j = rest(f"tickets?id=eq.{T}", 'PATCH', {'status': 'resolvido'})
    check('R8 foto abaixo do mínimo bloqueia encerrar', erro_pop(st, j) and 'faltam 1' in msg(j), (st, j))
    st, j = rest(f"tickets?id=eq.{T}", 'PATCH', {'status': 'fechado'})
    check('R8 atalho direto para fechado também bloqueado', erro_pop(st, j), (st, j))
    st, j = responder(P[3], {}, ['a.jpg', 'b.jpg'])
    check('resposta refeita (upsert por ticket+passo)', st in (200, 201), (st, j))
    st, j = rest(f"tickets?id=eq.{T}", 'PATCH', {'status': 'resolvido'})
    check('encerra com obrigatórios completos (instrução e opcional não contam)', st == 200, (st, j))
    st, j = responder(P[5], {'texto': 'depois'})
    check('R9 resolvida não aceita resposta nova', erro_pop(st, j), (st, j))
    st, j = responder(P[2], {'sim': True}, metodo='PATCH')
    check('R9 resolvida não muda resposta', erro_pop(st, j), (st, j))
    st, j = rest(f"tickets?id=eq.{T}", 'PATCH', {'status': 'em_andamento'})
    st, j = responder(P[5], {'texto': 'reaberta'})
    check('reaberta volta a aceitar resposta', st in (200, 201), (st, j))

    # ----------------------------------------------------------------------- agendamento
    print('\n[agendamento: idempotência]')
    st, j = rest('pops_agendamentos', 'POST', {'pop_id': POP, 'recorrencia': 'semanal', 'responsavel_padrao_id': DONO})
    check('semanal sem dia_semana recusado', st == 400 and j.get('code') == '23514', (st, j))
    st, j = rest('pops_agendamentos', 'POST', {'pop_id': POP, 'recorrencia': 'diario', 'responsavel_padrao_id': DONO})
    AG = j[0]['id']; criados['agend'].append(AG)
    d = '2026-01-15'
    tks = []
    for i in range(2):
        st, j = rest('tickets', 'POST', {'tipo': 'pop', 'titulo': f'TESTE-POP agendado {i}', 'descricao': 'x', 'solicitante_id': DONO, 'responsavel_id': DONO})
        tks.append(j[0]['id']); criados['tickets'].append(j[0]['id'])
    st, j = rest('pops_execucoes', 'POST', {'ticket_id': tks[0], 'pop_id': POP, 'versao_id': V, 'agendamento_id': AG, 'data_referencia': d})
    check('1ª execução do dia', st == 201, (st, j))
    st, j = rest('pops_execucoes', 'POST', {'ticket_id': tks[1], 'pop_id': POP, 'versao_id': V, 'agendamento_id': AG, 'data_referencia': d})
    check('R11 2ª execução do mesmo agendamento+dia recusada (23505)', st == 409 and j.get('code') == '23505', (st, j))

    # ----------------------------------------------------------------------- ciência
    print('\n[ciência]')
    st, j = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo + 2, 'criado_por': DONO}); VR = j[0]['id']
    st, j = rest('pops_ciencias', 'POST', {'versao_id': VR, 'usuario_id': COMUM})
    check('R10 ciência em rascunho recusada', erro_pop(st, j), (st, j))
    rest(f"pops_versoes?id=eq.{VR}", 'DELETE')
    st, j = rest('pops_ciencias', 'POST', {'versao_id': V, 'usuario_id': COMUM})
    check('ciência na publicada', st == 201, (st, j))
    st, j = rest(f"pops_ciencias?versao_id=eq.{V}&usuario_id=eq.{COMUM}", 'DELETE')
    check('R10 ciência é permanente', erro_pop(st, j), (st, j))

    # ----------------------------------------------------------------------- RLS anon
    print('\n[RLS: anon]')
    for t in TABELAS:
        st, j = anon(f'{t}?select=*&limit=1')
        check(f'anon não lê {t}', st in (401, 403) or (st == 200 and j == []), (st, j))
    st, j = anon('pops_areas', 'POST', {'sigla': 'HAX', 'nome': 'x'})
    check('anon não grava pops_areas', st in (401, 403), (st, j))
    st, j = anon('rpc/pops_pode_editar', 'POST', {'p_pop': POP})
    check('anon não chama pops_pode_editar', st in (401, 403, 404), (st, j))

    # ----------------------------------------------------------------------- RLS usuário comum
    print('\n[RLS: usuário comum sem o módulo]')
    st, VD = rest('pops_versoes', 'POST', {'pop_id': POP, 'numero': proximo + 2, 'objetivo': 'rascunho secreto', 'criado_por': DONO}); VD = VD[0]['id']
    rest('pops_passos', 'POST', {'versao_id': VD, 'ordem': 1, 'tipo': 'check', 'titulo': 'secreto'})
    st, j = comum('pops_areas?select=sigla')
    check('comum lê áreas', st == 200 and len(j) >= 8, (st, j))
    st, j = comum(f'pops?select=id,codigo&id=eq.{POP}')
    check('comum vê POP que tem versão publicada', st == 200 and len(j) == 1, (st, j))
    st, j = comum(f'pops_versoes?select=id,estado&pop_id=eq.{POP}&order=numero')
    est = {x['id']: x['estado'] for x in (j or [])}
    check('comum lê a versão publicada', est.get(V) == 'publicado', (st, j))
    check('comum NÃO lê o rascunho', VD not in est, (st, j))
    st, j = comum(f'pops_passos?select=id&versao_id=eq.{V}')
    check('comum lê passos da publicada', st == 200 and len(j) == 5, (st, j))
    st, j = comum(f'pops_passos?select=id&versao_id=eq.{VD}')
    check('comum NÃO lê passos do rascunho', st == 200 and j == [], (st, j))
    st, j = comum('pops', 'POST', {'area_id': AREA, 'codigo': 'TST-999', 'titulo': 'hack', 'dono_id': COMUM})
    check('comum não cria POP (42501)', st in (401, 403), (st, j))
    st, j = comum(f'pops_versoes?id=eq.{VD}', 'PATCH', {'objetivo': 'hack'})
    check('comum não altera versão', st in (401, 403) or (st == 200 and j == []), (st, j))
    st, j = comum('pops_ciencias', 'POST', {'versao_id': V, 'usuario_id': COMUM})
    check('comum não grava ciência direto (só pela rota)', st in (401, 403), (st, j))
    st, j = comum(f'pops_ciencias?select=versao_id&versao_id=eq.{V}')
    check('comum vê a própria ciência', st == 200 and len(j) == 1, (st, j))
    st, j = comum(f'pops_execucoes?select=ticket_id&ticket_id=eq.{T}')
    check('comum NÃO vê execução de ticket privado alheio', st == 200 and j == [], (st, j))
    st, j = comum(f'pops_execucao_respostas?select=passo_id&ticket_id=eq.{T}')
    check('comum NÃO vê respostas de ticket privado alheio', st == 200 and j == [], (st, j))
    rest('tickets_participantes', 'POST', {'ticket_id': T, 'user_id': COMUM, 'adicionado_por': DONO})
    st, j = comum(f'pops_execucoes?select=ticket_id&ticket_id=eq.{T}')
    check('participante do ticket vê a execução', st == 200 and len(j) == 1, (st, j))
    st, j = comum(f'pops_execucao_respostas?select=passo_id&ticket_id=eq.{T}')
    check('participante do ticket vê as respostas', st == 200 and len(j) >= 3, (st, j))
    st, j = comum(f'pops_execucao_respostas?ticket_id=eq.{T}', 'DELETE')
    check('participante não apaga respostas', st in (401, 403) or (st == 200 and j == []), (st, j))
    st, j = comum('rpc/pops_execucao_pendentes', 'POST', {'p_ticket': T})
    check('comum não chama pops_execucao_pendentes', st in (401, 403, 404), (st, j))
    rest(f"pops_versoes?id=eq.{VD}", 'DELETE')

finally:
    print('\n[limpeza]')
    for t in criados['tickets']:
        st, j = rest(f'tickets?id=eq.{t}', 'DELETE')
        if st not in (200, 204): print('  ticket não apagado', t, st, j)
    for a in criados['agend']:
        rest(f'pops_agendamentos?id=eq.{a}', 'DELETE')
    st, j = rest(f"pops_execucoes?select=ticket_id&ticket_id=in.({','.join(criados['tickets']) or '00000000-0000-0000-0000-000000000000'})")
    check('limpeza: tickets apagados levaram execuções e respostas (cascata passa pelo R9)', st == 200 and j == [], (st, j))

print(f'\n{ok} ok · {len(falhas)} falha(s)')
for f in falhas: print('  -', f)
sys.exit(1 if falhas else 0)
