"""POPs — Fase 2: prova as ROTAS /api/pops/* (e a regressão da engine de tickets).

Pré-requisitos:
  * sql/pops-01-schema.sql e sql/pops-02-funcoes.sql aplicadas;
  * servidor local com o mesmo CRON_SECRET deste script:
      PowerShell:  $env:CRON_SECRET='teste-local'; npm run dev
  * python scripts/teste-pops-api.py   (BASE padrão http://localhost:3000; env POPS_BASE muda)

Atores (tokens reais por magic link):
  DEV   = 1º usuário is_dev (admin do módulo) — cria, executa, duplica;
  COMUM = "Mecânico Teste" (sem módulo) — vira APROVADOR da área TST durante o teste.

Tudo acontece na área TST (inativa fora do teste). Sobras PERMANENTES por regra:
POP publicado não se apaga (fica arquivado em TST) e o ticket de revisão de uma
versão publicada não se apaga (FK da versão). Tickets de execução, genérico, SC,
agendamentos e o quadro temporário são apagados no fim.
Nenhuma notificação vai para pessoa real (só DEV e o usuário de teste).
"""
import base64, datetime, json, os, sys, urllib.error, urllib.request

sys.stdout.reconfigure(encoding='utf-8')
env = {}
for l in open('.env.local', encoding='utf-8'):
    l = l.strip()
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL']; SRV = env['SUPABASE_SERVICE_ROLE_KEY']; ANON = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
BASE = os.environ.get('POPS_BASE', 'http://localhost:3000')
CRON = os.environ.get('CRON_SECRET', 'teste-local')
JPEG = base64.b64decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=')


def http(url, method='GET', body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    rq = urllib.request.Request(url, method=method, data=data, headers=headers or {})
    try:
        r = urllib.request.urlopen(rq, timeout=120); txt = r.read()
        try: return r.status, json.loads(txt) if txt else None
        except Exception: return r.status, txt[:200]
    except urllib.error.HTTPError as e:
        txt = e.read() or b''
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt[:300].decode(errors='replace')


def api(path, method='GET', body=None, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    return http(BASE + path, method, body, h)


def rest(path, method='GET', body=None):
    return http(URL + '/rest/v1/' + path, method, body, {'apikey': SRV, 'Authorization': 'Bearer ' + SRV,
                'Content-Type': 'application/json', 'Prefer': 'return=representation'})


def token_de(email):
    def post(path, body, key):
        st, j = http(URL + path, 'POST', body, {'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
        return j
    g = post('/auth/v1/admin/generate_link', {'type': 'magiclink', 'email': email}, SRV)
    th = g.get('hashed_token') or g.get('properties', {}).get('hashed_token')
    return post('/auth/v1/verify', {'type': 'magiclink', 'token_hash': th}, ANON)['access_token']


ok = 0; falhas = []
def check(nome, cond, extra=''):
    global ok
    if cond: ok += 1; print(f'  ok   {nome}')
    else: falhas.append(nome); print(f'  FAIL {nome} {str(extra)[:240]}')

# ---------------------------------------------------------------------------- pré
st, j = http(BASE + '/api/pops/areas', 'GET')
if st == 0 or st is None: print('Servidor local fora do ar em', BASE); sys.exit(2)
st, j = rest('rpc/pops_hoje', 'POST', {})
if st != 200: print('sql/pops-02-funcoes.sql NÃO aplicada:', st, j); sys.exit(2)

st, devs = rest("portal_permissoes?select=user_id&is_dev=eq.true&order=user_id&limit=1"); DEV = devs[0]['user_id']
st, u = rest(f"financeiro_usu?select=email,nome&id=eq.{DEV}"); DEV_EMAIL = u[0]['email']
st, u2 = rest("financeiro_usu?select=id,email,nome&nome=ilike.*teste*&ativo=eq.true&order=nome&limit=1")
COMUM = u2[0]['id']
TD, TC = token_de(DEV_EMAIL), token_de(u2[0]['email'])
print('DEV =', u[0]['nome'], '· COMUM =', u2[0]['nome'])
st, a = rest("pops_areas?select=id&sigla=eq.TST"); AREA = a[0]['id']
rest(f"pops_areas?id=eq.{AREA}", 'PATCH', {'ativo': True})

limpar = {'tickets': [], 'agend': [], 'pops': [], 'quadro': None}
try:
    # ------------------------------------------------------------------ 401 sem sessão
    print('\n[sem sessão → 401 em toda escrita]')
    Z = '00000000-0000-0000-0000-000000000000'
    escritas = [
        ('POST', '/api/pops', {}), ('PATCH', f'/api/pops/{Z}', {}), ('POST', f'/api/pops/{Z}/acoes', {'acao': 'nova_versao'}),
        ('POST', f'/api/pops/revisao/{Z}', {'acao': 'aprovar'}), ('POST', '/api/pops/execucoes', {}),
        ('POST', f'/api/pops/execucoes/{Z}', {'acao': 'encerrar'}), ('POST', '/api/pops/ciencia', {}),
        ('POST', f'/api/pops/{Z}/agendamentos', {}), ('PATCH', f'/api/pops/{Z}/agendamentos', {}),
        ('DELETE', f'/api/pops/{Z}/agendamentos', None), ('POST', '/api/pops/areas', {}),
        ('GET', '/api/pops', None), ('GET', f'/api/pops/execucoes/{Z}', None),
    ]
    for m, path, b in escritas:
        st, j = api(path, m, b)
        check(f'401 {m} {path.replace(Z, ":id")}', st == 401, (st, j))
    st, j = api('/api/pops', 'POST', {}, tok='token-falso')
    check('401 com token inválido', st == 401, (st, j))
    st, j = http(BASE + '/api/pops/cron/recorrencias', 'POST', {}, {'Content-Type': 'application/json'})
    check('cron sem segredo → 401', st == 401, (st, j))

    # ------------------------------------------------------------------ papéis
    print('\n[papéis]')
    st, j = api('/api/pops/areas', 'POST', {'acao': 'papel_add', 'area_id': AREA, 'user_id': COMUM, 'papel': 'aprovador'}, TC)
    check('403 comum não gerencia papéis', st == 403, (st, j))
    st, j = api('/api/pops/areas', 'POST', {'acao': 'papel_add', 'area_id': AREA, 'user_id': COMUM, 'papel': 'aprovador'}, TD)
    check('admin designa o comum como aprovador da TST', st == 200, (st, j))
    st, j = api('/api/pops', 'POST', {'area_id': AREA, 'titulo': 'TESTE-API hack'}, TC)
    check('403 aprovador não cria POP (não é dono da área)', st == 403, (st, j))

    # ------------------------------------------------------------------ criar + rascunho + revisão
    print('\n[criar → rascunho → revisão → publicar]')
    st, j = api('/api/pops', 'POST', {'area_id': AREA, 'titulo': 'TESTE-API Entrega técnica'}, TD)
    check('admin cria POP (código TST-nnn)', st == 201 and j['codigo'].startswith('TST-'), (st, j))
    POP, V1 = j['pop_id'], j['versao_id']; limpar['pops'].append(POP)
    passos = [
        {'tipo': 'instrucao', 'titulo': 'Separe as ferramentas'},
        {'tipo': 'check', 'titulo': 'Pneus calibrados?'},
        {'tipo': 'foto', 'titulo': 'Foto do painel', 'config': {'min_fotos': 1, 'max_fotos': 2}},
        {'tipo': 'numero', 'titulo': 'Horímetro', 'config': {'min': 0, 'max': 100, 'unidade': 'h'}},
        {'tipo': 'selecao', 'titulo': 'Combustível', 'config': {'opcoes': ['Cheio', 'Meio', 'Reserva']}},
        {'tipo': 'texto', 'titulo': 'Observações', 'obrigatorio': False},
    ]
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V1, 'passos': [{'tipo': 'selecao', 'titulo': 'x', 'config': {'opcoes': ['a']}}]}, TD)
    check('400 passo inválido (seleção com 1 opção)', st == 400, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V1,
              'cabecalho': {'objetivo': 'Entregar a máquina', 'escopo': 'Oficina'}, 'passos': passos}, TD)
    check('salva rascunho com 6 passos', st == 200, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V1, 'passos': passos}, TC)
    check('403 aprovador não edita', st == 403, (st, j))
    st, j = api(f'/api/pops/{POP}', 'GET', None, TC)
    check('aprovador da área vê o rascunho', st == 200 and j['versao']['estado'] == 'rascunho', (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V1}, TD)
    check('400 submeter sem changelog', st == 400, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V1, 'changelog': 'Primeira versão', 'aprovador_id': DEV}, TD)
    check('400 aprovador fora da área / ele mesmo', st == 400, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V1, 'changelog': 'Primeira versão'}, TD)
    check('submete (aprovador único da área escolhido sozinho)', st == 200 and j.get('ticket_id'), (st, j))
    REV1 = j.get('ticket_id')
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V1, 'passos': passos}, TD)
    check('409 versão em revisão não é editada', st == 409, (st, j))
    st, j = api(f'/api/tickets/{REV1}/acoes', 'POST', {'acao': 'status', 'para': 'resolvido'}, TD)
    check('engine recusa status genérico na revisão de POP (até admin)', st == 400 and 'POP' in str(j), (st, j))
    st, j = api(f'/api/tickets/{REV1}/acoes', 'POST', {'acao': 'transferir', 'para': COMUM}, TD)
    check('engine recusa transferir a revisão de POP', st == 400 and 'POP' in str(j), (st, j))
    st, j = api(f'/api/pops/revisao/{REV1}', 'POST', {'acao': 'reprovar'}, TC)
    check('400 reprovar sem motivo', st == 400, (st, j))
    st, j = api(f'/api/pops/revisao/{REV1}', 'POST', {'acao': 'aprovar', 'parecer': 'ok'}, TC)
    check('aprovador designado publica a v1', st == 200 and j['aprovado'], (st, j))
    st, j = api(f'/api/pops/revisao/{REV1}', 'POST', {'acao': 'aprovar'}, TC)
    check('400 decidir de novo uma revisão já decidida', st == 400, (st, j))
    st, j = api(f'/api/pops/{POP}', 'GET', None, TD)
    check('v1 publicada; próxima revisão definida', j['versao']['estado'] == 'publicado' and j['pop']['proxima_revisao_em'], j.get('versao'))
    P1 = {p['ordem']: p for p in j['passos']}

    # ------------------------------------------------------------------ imutabilidade pela API
    print('\n[imutabilidade da publicada pela API]')
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V1, 'passos': passos[:1]}, TD)
    check('409 salvar na publicada', st == 409, (st, j))
    st, j = rest('rpc/pops_salvar_rascunho', 'POST', {'p_versao': V1, 'p_cabecalho': {'objetivo': 'x'}, 'p_passos': None})
    check('função do banco recusa mesmo pela service role', st >= 400 and 'rascunho' in str(j), (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'excluir'}, TD)
    check('409 POP publicado não se exclui', st == 409, (st, j))

    # ------------------------------------------------------------------ execução
    print('\n[execução]')
    st, j = api('/api/pops/execucoes', 'POST', {'pop_id': POP}, TC)
    check('aprovador da área pode executar', st == 201, (st, j))
    if st == 201: limpar['tickets'].append(j['ticket_id'])
    st, j = api('/api/pops/execucoes', 'POST', {'pop_id': POP, 'ref_externa': 'OS-TESTE-1'}, TD)
    check('cria execução (ticket pop)', st == 201, (st, j)); EX = j['ticket_id']; limpar['tickets'].append(EX)
    st, j = api(f'/api/pops/execucoes/{EX}', 'GET', None, TD)
    check('execução aponta a v1 e lista 4 pendentes', st == 200 and j['execucao']['versao_id'] == V1 and len(j['pendentes']) == 4, (st, j and j.get('pendentes')))
    st, j = api(f'/api/pops/execucoes/{EX}', 'GET', None, TC)
    check('comum NÃO vê execução privada alheia (404)', st == 404, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[2]['id'], 'valor': {'sim': True}}, TC)
    check('comum não responde (404)', st == 404, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[2]['id'], 'valor': {'sim': True}}, TD)
    check('responde check', st == 200 and j['pendentes'] == 3, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[4]['id'], 'valor': {'numero': 150}}, TD)
    check('número fora da faixa grava e alerta', st == 200 and j['fora_faixa'] and j['alerta_novo'], (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[5]['id'], 'valor': {'opcao': 'Vazio'}}, TD)
    check('400 opção fora da lista', st == 400, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[5]['id'], 'valor': {'opcao': 'Meio'}}, TD)
    check('responde seleção', st == 200, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'encerrar'}, TD)
    check('400 encerrar com foto faltando', st == 400 and j.get('pendentes') == 1, (st, j))
    st, j = api(f'/api/tickets/{EX}/acoes', 'POST', {'acao': 'status', 'para': 'resolvido'}, TD)
    check('400 status genérico resolvido com obrigatório faltando', st == 400 and 'obrigat' in str(j), (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[3]['id'], 'fotos': [f'{EX}/outro/x.jpg']}, TD)
    check('400 foto fora da pasta da execução', st == 400, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'upload_url', 'passo_id': P1[3]['id'], 'content_type': 'application/pdf'}, TD)
    check('400 upload de tipo não aceito', st == 400, (st, j))
    st, up = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'upload_url', 'passo_id': P1[3]['id'], 'content_type': 'image/jpeg'}, TD)
    check('URL assinada de upload', st == 200 and up.get('signedUrl'), (st, up))
    st, j = http(up['signedUrl'], 'PUT', raw=JPEG, headers={'Content-Type': 'image/jpeg'})
    check('foto sobe pela URL assinada', st == 200, (st, j))
    st, j = http(f"{URL}/storage/v1/object/public/pops-execucao/{up['path']}")
    check('bucket privado: URL pública não abre', st >= 400, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[3]['id'], 'fotos': [up['path']]}, TD)
    check('responde foto', st == 200 and j['pendentes'] == 0, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'GET', None, TD)
    url_foto = (j.get('fotos_url') or {}).get(up['path'])
    check('GET devolve URL assinada da foto', bool(url_foto), j.get('fotos_url'))
    if url_foto:
        st, _ = http(url_foto)
        check('URL assinada abre a foto', st == 200, st)
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'encerrar'}, TD)
    check('encerra (estágio 1 → resolvido)', st == 200, (st, j))
    st, j = api(f'/api/pops/execucoes/{EX}', 'POST', {'acao': 'responder', 'passo_id': P1[6]['id'], 'valor': {'texto': 'tarde'}}, TD)
    check('409 resposta depois de encerrada', st == 409, (st, j))
    st, ev = rest(f"tickets_eventos?select=tipo&ticket_id=eq.{EX}&order=created_at")
    tipos = [e['tipo'] for e in ev]
    check('timeline: criacao, pop_resposta×4, pop_alerta, status', tipos.count('pop_resposta') == 4 and 'pop_alerta' in tipos and tipos[0] == 'criacao' and tipos.count('status') >= 2, tipos)

    # ------------------------------------------------------------------ nova versão não mexe na execução
    print('\n[v2: execução antiga continua na v1]')
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'nova_versao'}, TD)
    check('nova versão (rascunho v2)', st == 201, (st, j)); V2 = j['versao_id']
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'nova_versao'}, TD)
    check('400 segunda versão em edição', st == 400, (st, j))
    st, det = api(f'/api/pops/{POP}?versao={V2}', 'GET', None, TD)
    novos = det['passos'] + [{'tipo': 'check', 'titulo': 'Cliente assinou o termo?'}]
    novos[1] = {**novos[1], 'titulo': 'Pneus calibrados e sem corte?'}
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': V2, 'passos': novos}, TD)
    check('edita v2 (mantém a chave dos passos)', st == 200, (st, j))
    st, j = rest(f"pops_passos?select=chave&versao_id=eq.{V2}&order=ordem")
    check('chave dos passos atravessa as versões', [x['chave'] for x in j][:6] == [P1[i]['chave'] for i in range(1, 7)], j)
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V2, 'changelog': 'Pergunta do termo'}, TD)
    REV2 = j.get('ticket_id')
    st, j = api(f'/api/pops/revisao/{REV2}', 'POST', {'acao': 'reprovar', 'parecer': 'Faltou a foto do termo'}, TC)
    check('aprovador reprova com motivo → v2 volta a rascunho', st == 200 and not j['aprovado'], (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V2, 'changelog': 'Pergunta do termo (ajustada)'}, TD)
    REV3 = j.get('ticket_id')
    st, j = api(f'/api/pops/revisao/{REV3}', 'POST', {'acao': 'aprovar'}, TC)
    check('aprovador publica a v2', st == 200 and j['aprovado'], (st, j))
    st, j = rest(f"pops_versoes?select=numero,estado&pop_id=eq.{POP}&order=numero")
    check('v1 obsoleta, v2 publicada', [(x['numero'], x['estado']) for x in j] == [(1, 'obsoleto'), (2, 'publicado')], j)
    st, j = api(f'/api/pops/execucoes/{EX}', 'GET', None, TD)
    check('execução antiga segue na v1 (6 passos) e avisa que a vigente mudou',
          j['execucao']['versao_id'] == V1 and len(j['passos']) == 6 and j['versao_vigente_diferente'], (j.get('execucao'), len(j.get('passos', []))))

    # ------------------------------------------------------------------ duplicação
    print('\n[duplicar não altera a origem]')
    snap = lambda vid: rest(f"pops_passos?select=chave,titulo,tipo,config&versao_id=eq.{vid}&order=ordem")[1]
    st, pub = rest(f"pops_versoes?select=id&pop_id=eq.{POP}&estado=eq.publicado"); VPUB = pub[0]['id']
    antes = snap(VPUB)
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'duplicar', 'area_id': AREA, 'titulo': 'TESTE-API cópia'}, TC)
    check('403 duplicar sem ser dono da área destino', st == 403, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'duplicar', 'area_id': AREA, 'titulo': 'TESTE-API cópia'}, TD)
    check('duplica (POP novo, rascunho v1)', st == 201, (st, j)); COP, COPV = j['pop_id'], j['versao_id']; limpar['pops'].append(COP)
    st, c = rest(f"pops?select=origem_pop_id,origem_template_id&id=eq.{COP}")
    check('cópia guarda origem_pop_id', c[0]['origem_pop_id'] == POP and c[0]['origem_template_id'] is None, c)
    st, j = api(f'/api/pops/{COP}?versao={COPV}', 'GET', None, TD)
    mud = j['passos'][:2]; mud[0] = {**mud[0], 'titulo': 'MUDADO na cópia'}
    st, j = api(f'/api/pops/{COP}/acoes', 'POST', {'acao': 'salvar_rascunho', 'versao_id': COPV, 'passos': mud}, TD)
    check('edita a cópia', st == 200, (st, j))
    check('origem idêntica depois de editar a cópia', snap(VPUB) == antes, 'origem mudou')
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'promover_template', 'template': True}, TC)
    check('403 comum não promove a modelo', st == 403, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'promover_template', 'template': True}, TD)
    check('admin promove a modelo (empresa)', st == 200, (st, j))
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'duplicar', 'area_id': AREA}, TD)
    check('duplica o modelo', st == 201, (st, j)); MOD = j['pop_id']; limpar['pops'].append(MOD)
    st, c = rest(f"pops?select=origem_template_id,origem_template_versao&id=eq.{MOD}")
    check('cópia do modelo guarda origem_template_id + versão 2', c[0]['origem_template_id'] == POP and c[0]['origem_template_versao'] == 2, c)
    check('origem continua idêntica depois de duplicar o modelo', snap(VPUB) == antes, 'origem mudou')
    st, j = api(f'/api/pops/{MOD}', 'GET', None, TD)
    check('cópia ainda não avisa (modelo sem versão nova)', st == 200 and j['modelo_atualizado'] is False, (st, j.get('modelo_atualizado')))
    # modelo ganha v3 publicada → a cópia passa a avisar (e NÃO muda)
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'nova_versao'}, TD); V3 = j['versao_id']
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'submeter', 'versao_id': V3, 'changelog': 'v3 do modelo'}, TD)
    st, j = api(f"/api/pops/revisao/{j['ticket_id']}", 'POST', {'acao': 'aprovar'}, TC)
    check('modelo publica v3', st == 200, (st, j))
    st, j = api(f'/api/pops/{MOD}', 'GET', None, TD)
    check('cópia avisa "modelo atualizado" e continua na própria v1', j['modelo_atualizado'] is True and j['versao']['numero'] == 1, (j.get('modelo_atualizado'), j.get('versao', {}).get('numero')))
    VPUB = rest(f"pops_versoes?select=id&pop_id=eq.{POP}&estado=eq.publicado")[1][0]['id']
    # modelo do SISTEMA
    st, j = api('/api/pops', 'POST', {'area_id': AREA, 'titulo': 'TESTE-API modelo sistema', 'template': True}, TC)
    check('403 comum não cria modelo do sistema', st == 403, (st, j))
    st, j = api('/api/pops', 'POST', {'area_id': AREA, 'titulo': 'TESTE-API modelo sistema', 'template': True}, TD)
    check('admin cria modelo do sistema (MOD-TST-nnn)', st == 201 and j['codigo'].startswith('MOD-TST-'), (st, j))
    SIS = j['pop_id']; limpar['pops'].append(SIS)
    st, j = api('/api/pops/execucoes', 'POST', {'pop_id': SIS}, TD)
    check('modelo do sistema não é executado', st in (400, 403), (st, j))
    st, j = api(f'/api/pops/{SIS}/agendamentos', 'POST', {'recorrencia': 'diario', 'responsavel_padrao_id': DEV}, TD)
    check('modelo do sistema não é agendado', st == 400, (st, j))
    st, j = api('/api/pops?templates=1', 'GET', None, TD)
    cods = [x['codigo'] for x in j.get('pops', [])]
    check('biblioteca (?templates=1) lista o modelo da empresa', any(x['id'] == POP for x in j.get('pops', [])), cods)
    st, j = api(f'/api/pops?area={AREA}', 'GET', None, TD)
    check('lista normal NÃO mostra modelo do sistema', not any(x['id'] == SIS for x in j.get('pops', [])), (st,))
    st, j = api(f'/api/pops/{MOD}/acoes', 'POST', {'acao': 'excluir'}, TD)
    check('cópia nunca publicada pode ser excluída', st == 200, (st, j))
    if st == 200: limpar['pops'].remove(MOD)

    # ------------------------------------------------------------------ ciência
    print('\n[ciência]')
    st, j = api(f'/api/pops/{POP}/acoes', 'POST', {'acao': 'exigir_ciencia', 'versao_id': VPUB, 'usuarios': [COMUM]}, TD)
    check('exige ciência do comum', st == 200 and j['exigidos'] == 1, (st, j))
    st, j = api('/api/pops/ciencia', 'GET', None, TC)
    check('comum vê 1 pendente', st == 200 and any(p['versao_id'] == VPUB for p in j['pendentes']), (st, j))
    st, j = api(f'/api/pops/ciencia?versao_id={VPUB}', 'GET', None, TC)
    check('403 comum não vê a lista de quem deu ciência', st == 403, (st, j))
    st, j = api('/api/pops/ciencia', 'POST', {'versao_id': V1}, TC)
    check('409 ciência em versão obsoleta', st == 409, (st, j))
    st, j = api('/api/pops/ciencia', 'POST', {'versao_id': VPUB}, TC)
    check('comum dá ciência', st == 200 and j['nova'], (st, j))
    st, j = api('/api/pops/ciencia', 'POST', {'versao_id': VPUB}, TC)
    check('ciência repetida é idempotente', st == 200 and not j['nova'], (st, j))
    st, j = api(f'/api/pops/ciencia?versao_id={VPUB}', 'GET', None, TD)
    check('dono vê 0 pendentes', st == 200 and j['pendentes'] == 0 and j['total'] == 1, (st, j))

    # ------------------------------------------------------------------ recorrência + cron idempotente
    print('\n[recorrência: cron 2x no mesmo dia]')
    st, j = api(f'/api/pops/{POP}/agendamentos', 'POST', {'recorrencia': 'diario', 'responsavel_padrao_id': DEV, 'inicio_em': '2026-01-01'}, TC)
    check('403 aprovador não agenda', st == 403, (st, j))
    st, j = api(f'/api/pops/{POP}/agendamentos', 'POST', {'recorrencia': 'diario', 'responsavel_padrao_id': DEV, 'inicio_em': '2026-01-01'}, TD)
    check('agenda diário', st == 201, (st, j)); AG = j['agendamento']['id']; limpar['agend'].append(AG)
    DIA = '2026-01-20'
    cr = lambda: http(f'{BASE}/api/pops/cron/recorrencias?data={DIA}', 'POST', {}, {'x-cron-secret': CRON, 'Content-Type': 'application/json'})
    st1, r1 = cr(); st2, r2 = cr()
    check('cron 1ª rodada cria', st1 == 200 and r1.get('resultado', {}).get('criadas', 0) >= 1, (st1, r1))
    check('cron 2ª rodada não duplica', st2 == 200 and r2.get('resultado', {}).get('criadas') == 0 and r2['resultado']['ja_existiam'] >= 1, (st2, r2))
    st, j = rest(f"pops_execucoes?select=ticket_id&agendamento_id=eq.{AG}&data_referencia=eq.{DIA}")
    check('exatamente 1 execução no banco para o dia', len(j) == 1, j)
    limpar['tickets'] += [x['ticket_id'] for x in j]
    st, t = rest(f"tickets?select=solicitante_id,responsavel_id,prazo,aceite&id=eq.{j[0]['ticket_id']}")
    check('recorrente: solicitante = dono, prazo = dia, aceite ok', t[0]['solicitante_id'] == DEV and t[0]['prazo'] == DIA and t[0]['aceite'] == 'ok', t)

    # ------------------------------------------------------------------ regressão: genérico e compras
    print('\n[regressão da engine: genérico e compras]')
    st, q = rest('tickets_quadros', 'POST', {'nome': 'TESTE-POPS regressão', 'criado_por': DEV}); QD = q[0]['id']; limpar['quadro'] = QD
    rest('tickets_quadro_membros', 'POST', {'quadro_id': QD, 'user_id': DEV})
    rest('tickets_quadro_colunas', 'POST', [{'quadro_id': QD, 'nome': 'A fazer', 'posicao': 0}, {'quadro_id': QD, 'nome': 'Feito', 'posicao': 1}])
    d = datetime.date.today() + datetime.timedelta(days=2)
    while d.weekday() >= 5: d += datetime.timedelta(days=1)   # prazo nunca no fim de semana
    amanha = d.isoformat()
    st, j = api('/api/tickets', 'POST', {'titulo': 'TESTE-POPS genérico', 'descricao': 'regressão', 'responsavel_id': DEV, 'quadro_id': QD, 'prazo': amanha}, TD)
    check('genérico: cria', st == 200 and j.get('ticket'), (st, j)); TG = j['ticket']['id']; limpar['tickets'].append(TG)
    for para in ('em_andamento', 'resolvido', 'fechado'):
        st, j = api(f'/api/tickets/{TG}/acoes', 'POST', {'acao': 'status', 'para': para}, TD)
        check(f'genérico: → {para}', st == 200, (st, j))
    st, j = api(f'/api/trabalho/central', 'GET', None, TD)
    check('central responde', st == 200, (st, j))
    st, sc = rest('tickets', 'POST', {'tipo': 'compras', 'sc_etapa': 'diretoria', 'status': 'aguardando_interno', 'titulo': 'TESTE-POPS SC',
                                     'descricao': 'regressão', 'categoria': 'Compras', 'solicitante_id': DEV, 'responsavel_id': DEV,
                                     'payload': {'produto': 'teste', 'quantidade_solicitada': 1}})
    SC = sc[0]['id']; limpar['tickets'].append(SC)
    st, j = api(f'/api/tickets/{SC}/acoes', 'POST', {'acao': 'status', 'para': 'resolvido'}, TD)
    check('compras: status genérico continua recusado', st == 400 and 'Compras' in str(j), (st, j))
    st, j = api(f'/api/tickets/{SC}/acoes', 'POST', {'acao': 'comentar', 'texto': 'regressão'}, TD)
    check('compras: comentar continua', st == 200, (st, j))
    st, j = api(f'/api/tickets/{SC}/compras', 'POST', {'acao': 'cancelar'}, TD)
    check('compras: cancelar pelo trilho continua', st == 200, (st, j))
    st, j = rest(f"tickets?select=sc_etapa,status&id=eq.{SC}")
    check('compras: etapa cancelada / status cancelado', j[0]['sc_etapa'] == 'cancelada' and j[0]['status'] == 'cancelado', j)

finally:
    print('\n[limpeza]')
    for t in limpar['tickets']:
        rest(f'tickets?id=eq.{t}', 'DELETE')
    for a in limpar['agend']:
        rest(f'pops_agendamentos?id=eq.{a}', 'DELETE')
    if limpar['quadro']:
        rest(f"tickets_quadros?id=eq.{limpar['quadro']}", 'DELETE')
    for p in limpar['pops']:
        st, _ = rest(f'pops?id=eq.{p}', 'DELETE')           # nunca publicado sai
        if st >= 400: rest(f'pops?id=eq.{p}', 'PATCH', {'arquivado': True})  # publicado fica arquivado
    rest(f"pops_area_papeis?area_id=eq.{AREA}&user_id=eq.{COMUM}", 'DELETE')
    rest(f"pops_areas?id=eq.{AREA}", 'PATCH', {'ativo': False})

print(f'\n{ok} ok · {len(falhas)} falha(s)')
for f in falhas: print('  -', f)
sys.exit(1 if falhas else 0)
