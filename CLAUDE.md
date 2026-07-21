# Portal Nova Tratores — Contexto para o Claude

> Lido automaticamente pelo Claude Code. Resume o estado do projeto e o trabalho em curso,
> para qualquer sessão (em qualquer computador) continuar de onde parámos.
> NÃO colocar segredos aqui (só nomes de variáveis). As chaves vivem no `.env.local` (local) e no Railway (produção).

## Visão geral
- Portal interno da **Nova Tratores** (concessionária Mahindra). **Next.js 16** (App Router, TypeScript), **Supabase** (BD + auth), deploy no **Railway** (e Vercel). Realtime via Supabase.
- Assistente **"Tratorilson"**: chat com IA (OpenAI ou Groq) em `src/app/api/assistente/chat/route.ts`.
  - Persona/conhecimento: `src/lib/assistente/conhecimento.ts`
  - Provider de IA: `src/lib/assistente/ia.ts` (escolhe OpenAI/Groq por env var)

## Trabalho feito recentemente (junho/2026)

### Requisições (`src/app/(portal)/requisicoes`, `src/components/requisicoes`)
- Tratorilson escondido na impressão; PDF (`TemplatePDF.tsx`) sem Hodómetro no Trator-Cliente e sem Chassis no Oficina.
- Trator-Loja: campo Hodómetro + seletor de O.S. no `FormReq.tsx`.
- Kanban: **filtros unificados** numa só busca (com tooltip) + filtro de **data exata** (em vez de período).
- Botão "Alertas" removido; lixeira **sem exclusão permanente**; gestor de tags sem emojis + sem duplicadas; **legendas (tooltips)** nos ícones dos cards.
- Notificação só em **alteração real** (corrigida a falsa por reformatação do valor).

### Papel "Dev" + bloqueio de valor alto + histórico
- Coluna `is_dev` em `portal_permissoes`. SQL: `sql/dev-bloqueio-historico.sql` (**JÁ APLICADO** no Supabase). **Dev = Admin + extras**. 1º dev: `antonio.novatratores@gmail.com`.
- Administração (`src/app/(portal)/admin/page.tsx`): **dropdown Usuário/Admin/Dev** (só um Dev pode dar/tirar Dev). `usePermissoes` expõe `isDev`; `isAdmin = is_admin || is_dev`.
- Requisição com `valor_despeza > R$ 500` fica **bloqueada para edição** (exceto Dev). Pedido de permissão guardado em `requisicao_autorizacoes`; aprovado/recusado no **"Painel do Dev"** (botão preto flutuante nas Requisições). Aprovação vale para **UMA** alteração (depois volta a bloquear).
- **Histórico por card** (`HistoricoModal.tsx`) lê `audit_log` + `requisicao_autorizacoes`.
- Lógica: `src/lib/requisicoes/autorizacao.ts` (`LIMITE_BLOQUEIO = 500`).

### Chat Tratorilson (portal)
- Persona reescrita para tom **natural/humano** (mantém regras de segurança).
- Saudação mais calorosa + **sugestões rápidas** (chips) + opção de **"fixar"** a janela no canto (`TratorinoChat.tsx`).

### Tickets internos (v1 — julho/2026)
- Módulo `/tickets` (motor genérico do doc "conceito-sistema-tickets", ADRs 001–007): fila/pedidos/acompanhando/gerencial, timeline imutável, transferência sem aceite, participantes permanentes, resolvido→fechado (auto-fecha em 7 dias via GitHub Actions `tickets-auto-fechar.yml`).
- Tabelas em `public` (`tickets`, `tickets_participantes`, `tickets_eventos`); leitura via RLS (`tickets_pode_ver`), escrita SÓ via `/api/tickets/*` (service role). Migration `sql/create-tickets.sql` **JÁ APLICADA** no Supabase (10/07/2026, verificada via REST).
- Permissão: módulo `tickets` no Admin; visão gerencial = admins. Notificações in-app (tipo `tickets`). v2 (Solicitação de Compras) desenhada, aba "Em breve" na navegação.

## WhatsApp (EM CONSTRUÇÃO)
Objetivo: Tratorilson **atende clientes no WhatsApp** (revisão / manutenção / peças / vendedor / outros), recolhe dados e (futuro) cria OS/PPV no portal.
- **Spec detalhada do "modo cliente": `docs/tratorilson-whatsapp.md`** (ler isto!).
- ✅ **ENVIO testado e a funcionar** (Meta Cloud API, com o número de **TESTE** da Meta).
- ✅ **Webhook construído** (1ª versão): `src/app/api/whatsapp/webhook/route.ts` (GET verifica, POST recebe) + `src/lib/whatsapp.ts` (enviar + responderCliente, ligado à IA). Persona do modo cliente: `PERSONA_CLIENTE_WHATSAPP` em `src/lib/assistente/conhecimento.ts`.
  - Memória de conversa é **em memória do processo** (reinicia no redeploy) — TODO: persistir no Supabase.
  - Esta 1ª versão **conversa e recolhe dados / dá contactos**; ainda NÃO cria OS/PPV nem agenda (próximo passo).
- ⏳ **Falta para testar:** configurar o **webhook na Meta** (URL pública do Railway + verify token) e ter um **token válido** (o de teste expira ~24h).
- Credenciais usadas no teste (TEMPORÁRIAS): número de teste da Meta, Phone number ID e token temporário (~24h).
- **Para produção:** ligar o **NÚMERO REAL** da empresa ao mesmo app Meta + gerar **TOKEN PERMANENTE** (System User) e atualizar as variáveis no Railway. **O código não muda** — só as credenciais.

## Variáveis de ambiente (Railway) — só NOMES
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **IA (Tratorilson):** `AI_PROVIDER` (openai|groq), `OPENAI_API_KEY`, `OPENAI_MODEL` (gpt-4o-mini), `GROQ_API_KEY` (reserva)
  - ⚠️ A chave **OpenAI está no `.env.local` local mas FALTA no Railway** (em produção usa Groq por enquanto). Pôr `AI_PROVIDER=openai` + `OPENAI_API_KEY` no Railway para usar a OpenAI em produção.
- **Outras (já no Railway):** Omie (`OMIE_APP_KEY/SECRET...`), Gmail (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), `ORS_API_KEY`, Rotaexata, etc.
- **WhatsApp (a adicionar ao publicar):** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (inventar um), e opcional `WHATSAPP_APP_SECRET`.
- **Auditoria ajustes:** `CMC_HMAC_SECRET` (inventar um segredo forte) — assina (HMAC-SHA256) cada correção de estoque negativo gravada em `cmc_correcoes`, para tamper-evidence. Se faltar, a correção ainda funciona mas fica **sem assinatura**. Pôr no `.env.local` e no Railway. Migration `sql/cmc-correcoes-assinatura.sql` (colunas `assinatura` + `assinatura_payload`) **JÁ APLICADA** no Supabase (03/07/2026).

## Próximos passos
1. Construir o **webhook do WhatsApp** (`/api/whatsapp/webhook`: GET verifica, POST recebe) + função de **enviar** + ligação ao assistente (modo cliente — ver `docs/tratorilson-whatsapp.md`).
2. **Publicar no Railway** e configurar as variáveis do WhatsApp + a chave OpenAI.
3. Configurar o webhook no painel da Meta (URL pública + verify token).
4. Ligar o **número real** da empresa (token permanente).
5. Construir as **"ações"** do modo cliente (criar OS/PPV, importar kit por horas, agendar técnico por dia, calcular distância à loja, ler fotos/vídeos na manutenção).

## Ambiente de desenvolvimento
- Windows + PowerShell. Git/Node instalados via winget. `.env.local` tem as credenciais (está no `.gitignore`).
- `npm run dev` para local. **Validar sempre `npm run build` antes de fazer push** (o deploy é automático a partir do `main`).
