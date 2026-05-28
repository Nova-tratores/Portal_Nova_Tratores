import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

/**
 * GET /api/mecanicos
 * Lista mecânicos do portal (financeiro_usu + portal_permissoes com mecanico_role)
 * ?nome=X → filtra por nome (busca perfil individual)
 */
export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome");

  try {
    // Buscar usuarios com role de mecanico
    const { data: perms, error: permErr } = await supabase
      .from("portal_permissoes")
      .select("user_id, mecanico_role, mecanico_tecnico_nome, is_admin, modulos_permitidos")
      .not("mecanico_role", "is", null);

    if (permErr) throw permErr;
    if (!perms || perms.length === 0) {
      return NextResponse.json([]);
    }

    const userIds = perms.map((p) => p.user_id);

    // Buscar perfis
    const { data: users, error: usrErr } = await supabase
      .from("financeiro_usu")
      .select("id, nome, email, funcao, avatar_url")
      .in("id", userIds);

    if (usrErr) throw usrErr;

    // Montar lista
    const mecanicos = (users || []).map((u) => {
      const perm = perms.find((p) => p.user_id === u.id);
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        funcao: u.funcao,
        avatar_url: u.avatar_url,
        mecanico_role: perm?.mecanico_role || "tecnico",
        tecnico_nome: perm?.mecanico_tecnico_nome || u.nome,
      };
    });

    // Se pediu por nome especifico
    if (nome) {
      const normNome = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const found = mecanicos.find((m) => {
        const n = (m.tecnico_nome || m.nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        return n === normNome || n.split(/\s+/)[0] === normNome.split(/\s+/)[0];
      });
      if (!found) return NextResponse.json(null);

      // Buscar dados extras para perfil individual
      const tecNome = found.tecnico_nome || found.nome;
      const now = new Date();
      const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const primeiro = `${mesAtual}-01`;
      const ultimo = `${mesAtual}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

      // Ordens do tecnico no mes, ocorrencias, GPS
      const normTecNome = tecNome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const [allOrdensRes, ocorrenciasRes, gpsRes, reqRes] = await Promise.all([
        supabase
          .from("Ordens_Omie")
          .select("os_num, cod_int, data, horas, km, valor, status, faturada, interno, cidade, empresa, descricao, obs, tecnicos")
          .neq("status", "Cancelada")
          .gte("data", primeiro)
          .lte("data", ultimo)
          .order("data", { ascending: false }),
        supabase
          .from("mecanico_ocorrencias")
          .select("*")
          .eq("tecnico_nome", tecNome)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("GPS_Viagens")
          .select("data, km_total, placa")
          .eq("tecnico_nome", tecNome)
          .gte("data", primeiro)
          .lte("data", ultimo),
        supabase
          .from("pedidos")
          .select("id_pedido, Id_Os, status, data, pedido_omie, valor_total, Tipo_Pedido")
          .ilike("tecnico", tecNome)
          .order("data", { ascending: false }),
      ]);

      // Filtrar ordens do tecnico no JS (mais confiavel que filtro Supabase em array)
      const ordens = (allOrdensRes.data || []).filter((o: Record<string, unknown>) => {
        const tecs = (o.tecnicos as string[]) || [];
        return tecs.some(t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normTecNome);
      }).map((o: Record<string, unknown>) => {
        // Extrair servico_solicitado e relatorio do campo descricao
        const desc = String(o.descricao || "");
        let servico_solicitado = "";
        let relatorio = "";
        const solMatch = desc.match(/Solicit[aã][çc][aã]o\s+(?:d[oe]\s+)?cliente:\s*([\s\S]*?)(?=\|*Diagn|\|*Servi|$)/i);
        if (solMatch) servico_solicitado = solMatch[1].replace(/\|/g, " ").trim();
        const servMatch = desc.match(/Servi[çc]o\s+[Rr]ealizado:\s*([\s\S]*?)$/i);
        if (servMatch) relatorio = servMatch[1].replace(/\|/g, " ").trim();
        if (!relatorio && !servico_solicitado && desc) relatorio = desc.replace(/\|/g, " ").trim();
        return { ...o, relatorio, servico_solicitado };
      });

      // Buscar dados complementares: PPVs, cliente (Ordem_Servico), relatorio tecnico (Ordem_Servico_Tecnicos)
      const osCodInts = ordens.map((o: Record<string, unknown>) => String(o.cod_int)).filter(Boolean);
      let ppvsPorOs: Record<string, { id: string; pedido_omie: string; status: string; produtos: { codigo: string; descricao: string; qtd: number; preco: number; devolvido: number }[] }[]> = {};
      let clientePorOs: Record<string, { cliente: string; cidade_cliente: string }> = {};
      let relatorioTecPorOs: Record<string, { motivo: string; servico_realizado: string; status: string }> = {};

      if (osCodInts.length > 0) {
        // Buscar em paralelo: pedidos, cliente, relatorio tecnico
        const [pedidosRes, osRes, tecRes] = await Promise.all([
          supabase
            .from("pedidos")
            .select("id_pedido, Id_Os, status, valor_total, pedido_omie")
            .in("Id_Os", osCodInts),
          supabase
            .from("Ordem_Servico")
            .select("Id_Ordem, Os_Cliente, Cidade_Cliente")
            .in("Id_Ordem", osCodInts),
          supabase
            .from("Ordem_Servico_Tecnicos")
            .select("Ordem_Servico, Motivo, ServicoRealizado, Status")
            .in("Ordem_Servico", osCodInts),
        ]);

        // Mapear cliente por OS
        for (const os of osRes.data || []) {
          clientePorOs[String(os.Id_Ordem)] = {
            cliente: String(os.Os_Cliente || ""),
            cidade_cliente: String(os.Cidade_Cliente || ""),
          };
        }

        // Mapear relatorio tecnico por OS (pegar o mais recente/enviado)
        for (const rt of tecRes.data || []) {
          const osId = String(rt.Ordem_Servico);
          // Preferir status 'enviado' sobre 'rascunho'
          if (!relatorioTecPorOs[osId] || rt.Status === "enviado") {
            relatorioTecPorOs[osId] = {
              motivo: String(rt.Motivo || ""),
              servico_realizado: String(rt.ServicoRealizado || ""),
              status: String(rt.Status || ""),
            };
          }
        }

        // PPVs
        const pedidos = pedidosRes.data;
        if (pedidos && pedidos.length > 0) {
          const ppvIds = pedidos.map((p: Record<string, unknown>) => String(p.id_pedido));

          const { data: movs } = await supabase
            .from("movimentacoes")
            .select("Id_PPV, CodProduto, Descricao, Qtde, Preco, TipoMovimento")
            .in("Id_PPV", ppvIds);

          for (const ped of pedidos) {
            const osId = String(ped.Id_Os);
            const ppvId = String(ped.id_pedido);
            const pedasMovs = (movs || []).filter((m: Record<string, unknown>) => String(m.Id_PPV) === ppvId);

            const prodMap: Record<string, { codigo: string; descricao: string; qtd: number; preco: number; devolvido: number }> = {};
            for (const m of pedasMovs) {
              const tipo = String(m.TipoMovimento || "").toLowerCase();
              const cod = String(m.CodProduto || "");
              const qtd = Math.abs(parseFloat(String(m.Qtde || 0)));
              const preco = parseFloat(String(m.Preco || 0));
              const desc = String(m.Descricao || "");

              if (tipo.includes("saida") || tipo.includes("saída")) {
                if (prodMap[cod]) prodMap[cod].qtd += qtd;
                else prodMap[cod] = { codigo: cod, descricao: desc, qtd, preco, devolvido: 0 };
              } else if (tipo.includes("devolu")) {
                if (prodMap[cod]) prodMap[cod].devolvido += qtd;
                else prodMap[cod] = { codigo: cod, descricao: desc, qtd: 0, preco, devolvido: qtd };
              }
            }

            if (!ppvsPorOs[osId]) ppvsPorOs[osId] = [];
            ppvsPorOs[osId].push({
              id: ppvId,
              pedido_omie: String(ped.pedido_omie || ""),
              status: String(ped.status || ""),
              produtos: Object.values(prodMap),
            });
          }
        }
      }

      // Resumo GPS
      let gpsKmMes = 0;
      let gpsDias = 0;
      for (const g of gpsRes.data || []) {
        gpsKmMes += parseFloat(g.km_total) || 0;
        gpsDias++;
      }

      // Montar ordens com dados complementares
      const ordensComPpv = ordens.map((o: Record<string, unknown>) => {
        const codInt = String(o.cod_int);
        const cli = clientePorOs[codInt];
        const relTec = relatorioTecPorOs[codInt];
        return {
          ...o,
          cliente: cli?.cliente || "",
          cidade_cliente: cli?.cidade_cliente || "",
          relatorio_tecnico: relTec?.servico_realizado || "",
          diagnostico_tecnico: relTec?.motivo || "",
          ppvs: ppvsPorOs[codInt] || [],
        };
      });

      // Montar alertas e sincronizar com tabela mecanico_alertas
      const alertasDetectados: { tipo: string; descricao: string; id_ordem: string; data_referencia: string; detalhes: string }[] = [];

      // 1. OS sem relatorio do tecnico (atraso)
      for (const o of ordensComPpv as Array<Record<string, unknown>>) {
        const codInt = String(o.cod_int);
        if (!relatorioTecPorOs[codInt] || !relatorioTecPorOs[codInt].servico_realizado) {
          alertasDetectados.push({
            tipo: "atraso_relatorio",
            descricao: `OS ${o.os_num} sem relatorio do tecnico`,
            id_ordem: codInt,
            data_referencia: String(o.data || primeiro),
            detalhes: `${o.cliente || o.cidade || "Sem cliente"}`,
          });
        }
      }

      // 2. Divergencia de KM: GPS vs relatado na OS
      const gpsKmPorData: Record<string, number> = {};
      for (const g of gpsRes.data || []) {
        gpsKmPorData[String(g.data)] = (gpsKmPorData[String(g.data)] || 0) + (parseFloat(g.km_total) || 0);
      }
      for (const o of ordensComPpv as Array<Record<string, unknown>>) {
        const kmOs = parseFloat(String(o.km)) || 0;
        const dataOs = String(o.data || "");
        const kmGps = gpsKmPorData[dataOs] || 0;
        if (kmOs > 0 && kmGps > 0) {
          const diff = Math.abs(kmOs - kmGps);
          const pct = diff / Math.max(kmOs, kmGps) * 100;
          if (pct > 30 && diff > 20) {
            alertasDetectados.push({
              tipo: "divergencia_km",
              descricao: `OS ${o.os_num} - KM divergente (OS: ${kmOs.toFixed(0)} km | GPS: ${kmGps.toFixed(0)} km)`,
              id_ordem: String(o.cod_int),
              data_referencia: dataOs || primeiro,
              detalhes: `Diferenca: ${diff.toFixed(0)} km (${pct.toFixed(0)}%)`,
            });
          }
        }
      }

      // Buscar alertas existentes do tecnico no mes
      const { data: alertasExistentes } = await supabase
        .from("mecanico_alertas")
        .select("*")
        .eq("tecnico_nome", tecNome)
        .gte("data_referencia", primeiro)
        .lte("data_referencia", ultimo);

      const alertasMap = new Map((alertasExistentes || []).map((a: Record<string, unknown>) => [`${a.tipo}_${a.id_ordem}`, a]));

      // Inserir novos alertas que nao existem ainda
      const novos = alertasDetectados.filter(a => !alertasMap.has(`${a.tipo}_${a.id_ordem}`));
      if (novos.length > 0) {
        await supabase.from("mecanico_alertas").insert(
          novos.map(a => ({
            tecnico_nome: tecNome,
            tipo: a.tipo,
            descricao: a.descricao,
            detalhes: a.detalhes,
            id_ordem: a.id_ordem,
            data_referencia: a.data_referencia,
            status: "pendente",
          }))
        );
      }

      // Rebuscar todos alertas do mes (inclui novos + existentes com status)
      const { data: alertasFinal } = await supabase
        .from("mecanico_alertas")
        .select("*")
        .eq("tecnico_nome", tecNome)
        .gte("data_referencia", primeiro)
        .lte("data_referencia", ultimo)
        .order("data_referencia", { ascending: false });

      return NextResponse.json({
        ...found,
        mes: mesAtual,
        ordens: ordensComPpv,
        ocorrencias: ocorrenciasRes.data || [],
        requisicoes: reqRes.data || [],
        alertas: alertasFinal || [],
        gps: { kmMes: Math.round(gpsKmMes), dias: gpsDias },
      });
    }

    // Retornar lista completa (para a tela principal)
    // Buscar contagem de ordens do mes para cada tecnico
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const primeiro = `${mesAtual}-01`;
    const ultimo = `${mesAtual}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

    const { data: ordens } = await supabase
      .from("Ordens_Omie")
      .select("os_num, tecnicos, horas, km, valor, interno")
      .neq("status", "Cancelada")
      .gte("data", primeiro)
      .lte("data", ultimo);

    // Contar ordens por tecnico
    const statsPorTec: Record<string, { total: number; horas: number; km: number; valor: number }> = {};
    for (const o of ordens || []) {
      for (const t of o.tecnicos || []) {
        const n = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        if (!statsPorTec[n]) statsPorTec[n] = { total: 0, horas: 0, km: 0, valor: 0 };
        statsPorTec[n].total++;
        statsPorTec[n].horas += parseFloat(o.horas) || 0;
        statsPorTec[n].km += parseFloat(o.km) || 0;
        statsPorTec[n].valor += parseFloat(o.valor) || 0;
      }
    }

    // Buscar ocorrencias e alertas pendentes
    const [ocPendentesRes, alertasPendentesRes] = await Promise.all([
      supabase.from("mecanico_ocorrencias").select("tecnico_nome, id").eq("status", "pendente"),
      supabase.from("mecanico_alertas").select("tecnico_nome, id").eq("status", "pendente"),
    ]);

    const ocPorTec: Record<string, number> = {};
    for (const oc of ocPendentesRes.data || []) {
      const n = (oc.tecnico_nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      ocPorTec[n] = (ocPorTec[n] || 0) + 1;
    }
    const alertasPorTec: Record<string, number> = {};
    for (const al of alertasPendentesRes.data || []) {
      const n = (al.tecnico_nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      alertasPorTec[n] = (alertasPorTec[n] || 0) + 1;
    }

    const resultado = mecanicos.map((m) => {
      const n = (m.tecnico_nome || m.nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      return {
        ...m,
        stats: statsPorTec[n] || { total: 0, horas: 0, km: 0, valor: 0 },
        ocorrencias_pendentes: ocPorTec[n] || 0,
        alertas_pendentes: alertasPorTec[n] || 0,
      };
    });

    return NextResponse.json(resultado);
  } catch (e: any) {
    console.error("[mecanicos]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/mecanicos
 * Cria ocorrencia para um mecanico
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { acao } = body;

    if (acao === "criar_ocorrencia") {
      const { tecnico_nome, tipo, titulo, descricao, criado_por } = body;
      if (!tecnico_nome || !tipo || !titulo) {
        return NextResponse.json({ error: "tecnico_nome, tipo e titulo obrigatorios" }, { status: 400 });
      }

      const { data, error } = await supabase.from("mecanico_ocorrencias").insert({
        tecnico_nome,
        tipo,
        titulo,
        descricao: descricao || "",
        status: "pendente",
        criado_por: criado_por || "portal",
        created_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (acao === "atualizar_ocorrencia") {
      const { id, status, resposta } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status) update.status = status;
      if (resposta !== undefined) update.resposta = resposta;

      const { error } = await supabase.from("mecanico_ocorrencias").update(update).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (acao === "justificar_alerta") {
      const { id, admin_comentario, admin_nome } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      const { error } = await supabase.from("mecanico_alertas").update({
        status: "justificada",
        admin_comentario: admin_comentario || "",
        admin_nome: admin_nome || "portal",
        resolvido_em: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (acao === "alerta_para_ocorrencia") {
      const { id, admin_nome } = body;
      if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

      // Buscar alerta
      const { data: alerta, error: aErr } = await supabase
        .from("mecanico_alertas")
        .select("*")
        .eq("id", id)
        .single();
      if (aErr || !alerta) return NextResponse.json({ error: "alerta nao encontrado" }, { status: 404 });

      // Criar ocorrencia a partir do alerta
      const tipoOc = alerta.tipo === "atraso_relatorio" ? "atraso" : "observacao";
      await supabase.from("mecanico_ocorrencias").insert({
        tecnico_nome: alerta.tecnico_nome,
        tipo: tipoOc,
        titulo: alerta.descricao,
        descricao: alerta.detalhes || "",
        status: "pendente",
        criado_por: admin_nome || "portal",
        created_at: new Date().toISOString(),
      });

      // Atualizar alerta como virou ocorrencia
      await supabase.from("mecanico_alertas").update({
        status: "ocorrencia",
        admin_nome: admin_nome || "portal",
        resolvido_em: new Date().toISOString(),
      }).eq("id", id);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "acao desconhecida" }, { status: 400 });
  } catch (e: any) {
    console.error("[mecanicos POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
