// =========================================================
// RELATORIO - Monthly technician report (Omie + GPS)
// =========================================================

const _supabase = window.supabase.createClient(
    'https://citrhumdkfivdzbmayde.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdHJodW1ka2ZpdmR6Ym1heWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDgyNzUsImV4cCI6MjA4NDY4NDI3NX0.83x3-NrKoJgtIuSE7Jjsaj0zH-b-XJ3Z8i3XkBkwVoU'
);

const Relatorio = {
    _mes: null,
    _ordens: [],
    _gpsData: [],      // GPS_Viagens do mes
    _resumoData: [],   // resumo_diario_tecnico do mes
    _gpsMap: {},        // tecnico_nome_norm -> { kmTotal, horasDirigindo, tempoParado, horasServico, dias }
    _gpsByTecData: {},  // normNome|data -> { km, horasFora, horasDirigindo, horasParado, placa }
    _gpsByPlacaData: {}, // PLACA|data -> { km, horasFora, horasDirigindo, horasParado, placa }
    _placaPorPOS: {},   // cod_int (POS) -> placa extraida do relatorio do tecnico
    _clienteMap: {},    // cod_int (POS) -> Os_Cliente
    _tecnicos: [],
    _tecnicoSel: null,
    _ordemAberta: null,
    _loaded: false,
    _syncing: false,
    _filtro: 'todas',
    _kmView: false,
    _kmData: [],        // dados da tabela km_mensal_veiculos para o mes
    _kmVeiculos: [],    // lista de veiculos do tecnico_veiculos

    // Coordenadas da Nova Tratores (base/loja)
    _BASE_LAT: -23.208410,
    _BASE_LNG: -49.370770,
    _BASE_RAIO: 0.008, // ~800m

    async load() {
        if (!this._mes) {
            const now = new Date();
            this._mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        this._tecnicoSel = null;
        this._ordemAberta = null;
        await this._carregar();
        this._syncBackground();
    },

    _toNum(v) {
        if (v == null || v === '') return 0;
        const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
        return isNaN(n) ? 0 : n;
    },

    _normNome(s) {
        return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    },

    // "MONTANA - FHY8D25" -> "FHY8D25"
    _extractPlaca(numPlaca) {
        if (!numPlaca) return '';
        const parts = numPlaca.split(' - ');
        return (parts[parts.length - 1] || '').trim().toUpperCase();
    },

    _mesLabel() {
        const [y, m] = this._mes.split('-').map(Number);
        const meses = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        return `${meses[m - 1]} ${y}`;
    },

    _mudarMes(dir) {
        const [y, m] = this._mes.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        this._mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        this._tecnicoSel = null;
        this._ordemAberta = null;
        this._carregar();
    },

    _setFiltro(f) {
        this._filtro = f;
        this._tecnicoSel = null;
        this._ordemAberta = null;
        this._extrairTecnicos();
        const container = document.getElementById('relatorio-content');
        if (this._tecnicoSel) this._renderDetalhe();
        else this._renderCards(container);
    },

    _ordensFiltradas() {
        if (this._filtro === 'internas') return this._ordens.filter(o => o.interno);
        if (this._filtro === 'cobradas') return this._ordens.filter(o => !o.interno);
        return this._ordens;
    },

    _extrairTecnicos() {
        const nomes = new Set();
        this._ordensFiltradas().forEach(o => {
            (o.tecnicos || []).forEach(t => { if (t) nomes.add(t); });
        });
        this._tecnicos = [...nomes].sort();
    },

    // Verifica se ponto esta perto da base
    _isNearBase(lat, lng) {
        return Math.abs(lat - this._BASE_LAT) < this._BASE_RAIO && Math.abs(lng - this._BASE_LNG) < this._BASE_RAIO;
    },

    // Calcula horas de servico GPS de um dia
    // Regra: se saiu da loja e ficou >30min fora, conta como servico
    _calcHorasServicoDia(eventos) {
        if (!eventos || eventos.length === 0) return 0;

        let horasServico = 0;
        let ultimaSaida = null;

        for (const ev of eventos) {
            if (ev.tipo === 'saida_loja') {
                ultimaSaida = new Date(ev.horario);
            } else if (ev.tipo === 'retorno_loja' && ultimaSaida) {
                const retorno = new Date(ev.horario);
                const diffMin = (retorno - ultimaSaida) / 60000;
                if (diffMin > 30) {
                    horasServico += diffMin / 60;
                }
                ultimaSaida = null;
            }
        }

        // Se saiu mas nao retornou (dia ainda em andamento ou sem retorno registrado)
        // Pega o ultimo evento como referencia
        if (ultimaSaida) {
            const ultimoEv = eventos[eventos.length - 1];
            const fim = new Date(ultimoEv.horario);
            const diffMin = (fim - ultimaSaida) / 60000;
            if (diffMin > 30) {
                horasServico += diffMin / 60;
            }
        }

        return horasServico;
    },

    // Processa dados GPS e constroi mapa por tecnico + mapa por tecnico|data
    _processarGPS() {
        this._gpsMap = {};
        this._gpsByTecData = {}; // normNome|data -> { km, horasFora, horasDirigindo, horasParado, placa }
        this._gpsByPlacaData = {}; // PLACA|data -> mesmo formato

        // Montar mapa de horas_dirigindo do resumo_diario_tecnico por tecnico+data
        const resumoMap = {};
        for (const r of this._resumoData) {
            const key = `${this._normNome(r.tecnico_nome)}|${r.data}`;
            resumoMap[key] = this._toNum(r.horas_dirigindo);
        }

        for (const g of this._gpsData) {
            const nk = this._normNome(g.tecnico_nome);
            if (!this._gpsMap[nk]) {
                this._gpsMap[nk] = { kmTotal: 0, horasDirigindo: 0, tempoParado: 0, horasServico: 0, dias: 0, nome: g.tecnico_nome };
            }
            this._gpsMap[nk].kmTotal += this._toNum(g.km_total);

            const horasForaDia = this._calcHorasServicoDia(g.eventos);
            this._gpsMap[nk].horasServico += horasForaDia;

            // horas_dirigindo do resumo diario
            const rKey = `${nk}|${g.data}`;
            const dirigindoDia = resumoMap[rKey] || 0;
            this._gpsMap[nk].horasDirigindo += dirigindoDia;

            // tempo parado fora = tempo fora da loja - tempo dirigindo
            const paradoDia = Math.max(0, horasForaDia - dirigindoDia);
            this._gpsMap[nk].tempoParado += paradoDia;

            this._gpsMap[nk].dias++;

            // Indexar por tecnico+data para lookup per-OS
            const tdKey = `${nk}|${g.data}`;
            const gpsDayData = {
                km: this._toNum(g.km_total),
                horasFora: horasForaDia,
                horasDirigindo: dirigindoDia,
                horasParado: paradoDia,
                placa: g.placa || ''
            };
            this._gpsByTecData[tdKey] = gpsDayData;

            // Indexar por placa+data (para cruzar com placa do relatorio do tecnico)
            if (g.placa) {
                this._gpsByPlacaData[`${g.placa.toUpperCase()}|${g.data}`] = gpsDayData;
            }
        }
    },

    // Busca GPS de um dia especifico - prioriza placa do relatorio do tecnico
    _getGPSDia(nomeTecnico, data, codInt) {
        if (!data) return null;
        // Prioridade 1: placa informada no relatorio do tecnico (Ordem_Servico_Tecnicos.NumPlaca)
        if (codInt && this._placaPorPOS[codInt]) {
            const placa = this._placaPorPOS[codInt];
            const key = `${placa}|${data}`;
            if (this._gpsByPlacaData[key]) return this._gpsByPlacaData[key];
        }
        // Prioridade 2: match por nome do tecnico
        if (!nomeTecnico) return null;
        const n = this._normNome(nomeTecnico);
        if (this._gpsByTecData[`${n}|${data}`]) return this._gpsByTecData[`${n}|${data}`];
        const primeiro = n.split(/\s+/)[0];
        for (const [k, v] of Object.entries(this._gpsByTecData)) {
            if (k.endsWith(`|${data}`) && k.split('|')[0].split(/\s+/)[0] === primeiro) return v;
        }
        return null;
    },

    // Encontra dados GPS para um tecnico (match fuzzy pelo primeiro nome)
    _getGPSTecnico(nome) {
        const n = this._normNome(nome);
        // Match exato
        if (this._gpsMap[n]) return this._gpsMap[n];
        // Match pelo primeiro nome
        const primeiro = n.split(/\s+/)[0];
        for (const [k, v] of Object.entries(this._gpsMap)) {
            if (k.split(/\s+/)[0] === primeiro) return v;
        }
        return null;
    },

    async _carregar() {
        const container = document.getElementById('relatorio-content');
        container.innerHTML = `<div style="text-align:center;padding:60px;color:#94A3B8;font-size:13px">Carregando...</div>`;

        try {
            const [y, m] = this._mes.split('-').map(Number);
            const primeiro = `${this._mes}-01`;
            const ultimo = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;

            // Carregar ordens, GPS, resumo diario e clientes em paralelo
            const [ordensRes, gpsRes, resumoRes, clientesRes, placaRes] = await Promise.all([
                _supabase
                    .from('Ordens_Omie')
                    .select('*')
                    .eq('faturada', true)
                    .gte('data', primeiro)
                    .lte('data', ultimo)
                    .order('data', { ascending: false }),
                _supabase
                    .from('GPS_Viagens')
                    .select('tecnico_nome, data, km_total, eventos, placa')
                    .gte('data', primeiro)
                    .lte('data', ultimo),
                _supabase
                    .from('resumo_diario_tecnico')
                    .select('tecnico_nome, data, horas_dirigindo, km_percorrido')
                    .gte('data', primeiro)
                    .lte('data', ultimo),
                _supabase
                    .from('Ordem_Servico')
                    .select('Id_Ordem, Os_Cliente'),
                _supabase
                    .from('Ordem_Servico_Tecnicos')
                    .select('Ordem_Servico, NumPlaca')
            ]);

            if (ordensRes.error) throw ordensRes.error;
            this._ordens = ordensRes.data || [];

            // Mapear cod_int (POS) -> cliente
            this._clienteMap = {};
            if (clientesRes.data) {
                for (const c of clientesRes.data) {
                    if (c.Id_Ordem) this._clienteMap[c.Id_Ordem] = c.Os_Cliente || '';
                }
            }

            // Mapear POS -> placa do relatorio do tecnico
            this._placaPorPOS = {};
            if (placaRes.data) {
                for (const p of placaRes.data) {
                    if (p.Ordem_Servico && p.NumPlaca) {
                        this._placaPorPOS[p.Ordem_Servico] = this._extractPlaca(p.NumPlaca);
                    }
                }
            }

            this._gpsData = gpsRes.data || [];
            this._resumoData = resumoRes.data || [];
            this._processarGPS();

            this._extrairTecnicos();
            this._loaded = true;
        } catch (e) {
            console.error('Erro ao carregar:', e);
            Utils.toast('Erro ao carregar: ' + e.message, 'error');
            this._ordens = [];
            this._gpsData = [];
            this._gpsMap = {};
            this._tecnicos = [];
            this._loaded = true;
        }

        this._renderCards(container);
    },

    async _syncBackground() {
        if (this._syncing) return;
        this._syncing = true;
        this._showSyncBar(true);
        try {
            const ano = this._mes.split('-')[0];
            const res = await _originalFetch(`/api/pos/ordens/omie-sync?ano=${ano}`, { method: 'POST' });
            if (res.ok) await this._carregar();
        } catch (e) {
            console.error('Erro sync background:', e);
        }
        this._syncing = false;
        this._showSyncBar(false);
    },

    _showSyncBar(show) {
        let bar = document.getElementById('relatorio-sync-bar');
        if (show) {
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'relatorio-sync-bar';
                bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;height:3px;background:linear-gradient(90deg,#3b82f6 0%,#8b5cf6 50%,#3b82f6 100%);background-size:200% 100%;animation:syncSlide 1.5s ease-in-out infinite';
                if (!document.getElementById('sync-slide-style')) {
                    const style = document.createElement('style');
                    style.id = 'sync-slide-style';
                    style.textContent = '@keyframes syncSlide{0%{background-position:200% 0}100%{background-position:-200% 0}}';
                    document.head.appendChild(style);
                }
                document.body.appendChild(bar);
            }
        } else {
            if (bar) bar.remove();
        }
    },

    _getOrdensTecnico(nome) {
        const nNome = this._normNome(nome);
        return this._ordensFiltradas().filter(o =>
            (o.tecnicos || []).some(t => this._normNome(t) === nNome)
        );
    },

    _getStatsTecnico(nome) {
        const ords = this._getOrdensTecnico(nome);
        return {
            total: ords.length,
            horas: ords.reduce((s, o) => s + this._toNum(o.horas), 0),
            km: ords.reduce((s, o) => s + this._toNum(o.km), 0),
            valor: ords.reduce((s, o) => s + this._toNum(o.valor), 0),
            internos: ords.filter(o => o.interno).length,
            cobradas: ords.filter(o => !o.interno).length,
        };
    },

    _renderFiltro() {
        const opts = [
            { key: 'todas', label: 'Todas' },
            { key: 'cobradas', label: 'Cobradas' },
            { key: 'internas', label: 'Internas' },
        ];
        return opts.map(o => {
            const active = this._filtro === o.key;
            return `<button onclick="Relatorio._setFiltro('${o.key}')" style="padding:5px 14px;border-radius:6px;border:1px solid ${active ? '#3b82f6' : '#E2E8F0'};background:${active ? '#EFF6FF' : '#fff'};color:${active ? '#3b82f6' : '#64748B'};font-size:12px;font-weight:${active ? '700' : '500'};cursor:pointer">${o.label}</button>`;
        }).join('');
    },


    _renderCards(container) {
        const filtradas = this._ordensFiltradas();
        const totalHoras = filtradas.reduce((s, o) => s + this._toNum(o.horas), 0);
        const totalKm = filtradas.reduce((s, o) => s + this._toNum(o.km), 0);
        const totalValor = filtradas.reduce((s, o) => s + this._toNum(o.valor), 0);

        let html = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
                <button onclick="Relatorio._mudarMes(-1)" style="width:32px;height:32px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748B">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span style="font-size:15px;font-weight:700;color:#1E293B;min-width:160px;text-align:center">${this._mesLabel()}</span>
                <button onclick="Relatorio._mudarMes(1)" style="width:32px;height:32px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748B">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button onclick="Relatorio._toggleKmView()" style="padding:6px 14px;border-radius:8px;border:1px solid #f59e0b;background:#FFFBEB;color:#B45309;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px" title="Registrar KM do odometro dos veiculos">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    KM Veiculos
                </button>
                <div style="margin-left:auto;display:flex;gap:6px">
                    ${this._renderFiltro()}
                </div>
            </div>
        `;

        if (this._loaded && filtradas.length > 0) {
            html += `
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
                    <div style="background:#fff;border-radius:8px;padding:10px;text-align:center;border:1px solid #E2E8F0">
                        <div style="font-size:9px;font-weight:600;color:#94A3B8">OS FATURADAS</div>
                        <div style="font-size:22px;font-weight:800;color:#3b82f6">${filtradas.length}</div>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px;text-align:center;border:1px solid #E2E8F0">
                        <div style="font-size:9px;font-weight:600;color:#94A3B8">HORAS</div>
                        <div style="font-size:22px;font-weight:800;color:#10b981">${totalHoras.toFixed(0)}</div>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px;text-align:center;border:1px solid #E2E8F0">
                        <div style="font-size:9px;font-weight:600;color:#94A3B8">KM</div>
                        <div style="font-size:22px;font-weight:800;color:#f59e0b">${totalKm.toFixed(0)}</div>
                    </div>
                    <div style="background:#fff;border-radius:8px;padding:10px;text-align:center;border:1px solid #E2E8F0">
                        <div style="font-size:9px;font-weight:600;color:#94A3B8">VALOR</div>
                        <div style="font-size:22px;font-weight:800;color:#8b5cf6">R$${totalValor >= 1000 ? (totalValor / 1000).toFixed(1) + 'k' : totalValor.toFixed(0)}</div>
                    </div>
                </div>
            `;
        }

        if (!this._loaded) { container.innerHTML = html; return; }

        if (this._tecnicos.length === 0) {
            html += `<div style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">Nenhuma OS faturada neste mes${this._filtro !== 'todas' ? ` (filtro: ${this._filtro})` : ''}</div>`;
            container.innerHTML = html;
            return;
        }

        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">`;
        for (const nome of this._tecnicos) {
            const stats = this._getStatsTecnico(nome);
            html += `
                <div onclick="Relatorio._abrirTecnico('${nome.replace(/'/g, "\\'")}')" style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:12px" onmouseenter="this.style.borderColor='#3b82f6';this.style.boxShadow='0 2px 8px rgba(59,130,246,0.1)'" onmouseleave="this.style.borderColor='#E2E8F0';this.style.boxShadow='none'">
                    <div style="width:38px;height:38px;border-radius:10px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:14px;font-weight:700;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
                        <div style="font-size:12px;color:#94A3B8;margin-top:2px">${stats.total} OS</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }
        html += `</div>`;
        container.innerHTML = html;
    },

    _abrirTecnico(nome) {
        this._tecnicoSel = nome;
        this._ordemAberta = null;
        this._renderDetalhe();
    },

    _renderDetalhe() {
        const container = document.getElementById('relatorio-content');
        const nome = this._tecnicoSel;
        const ords = this._getOrdensTecnico(nome);
        const stats = this._getStatsTecnico(nome);
        const gps = this._getGPSTecnico(nome);

        // Calcular GPS por OS (cruzando tecnico+data, de-duplicando por dia)
        const gpsDiasUsados = new Set();
        let gpsSomaKm = 0, gpsSomaDirigindo = 0, gpsSomaParado = 0, gpsSomaFora = 0;
        const ordsComGPS = ords.map(o => {
            const tecOS = (o.tecnicos || [])[0] || '';
            const gpsDia = this._getGPSDia(tecOS, o.data, o.cod_int);
            const dayKey = tecOS && o.data ? `${this._normNome(tecOS)}|${o.data}` : null;
            if (gpsDia && dayKey && !gpsDiasUsados.has(dayKey)) {
                gpsDiasUsados.add(dayKey);
                gpsSomaKm += gpsDia.km;
                gpsSomaDirigindo += gpsDia.horasDirigindo;
                gpsSomaParado += gpsDia.horasParado;
                gpsSomaFora += gpsDia.horasFora;
            }
            return { ...o, gpsDia };
        });

        // Divergencia (usa dados GPS corrigidos por placa do relatorio)
        const hasGPSData = gpsDiasUsados.size > 0;
        const divKm = hasGPSData ? (stats.km - gpsSomaKm) : 0;
        const divHoras = hasGPSData ? (stats.horas - gpsSomaFora) : 0;

        let html = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
                <button onclick="Relatorio._voltarCards()" style="width:32px;height:32px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748B">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div style="flex:1">
                    <div style="font-size:18px;font-weight:700;color:#1E293B">${nome}</div>
                    <div style="font-size:12px;color:#94A3B8">${this._mesLabel()} - ${stats.total} OS</div>
                </div>
                <div style="display:flex;gap:6px">
                    ${this._renderFiltro()}
                </div>
            </div>
        `;

        // Tabela de ordens
        if (ords.length === 0) {
            html += `<div style="text-align:center;padding:40px;color:#64748B;font-size:15px">Nenhuma OS neste mes</div>`;
        } else {
            html += `
                <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:20px">
                    <table style="width:100%;border-collapse:collapse">
                        <thead>
                            <tr style="background:#F1F5F9">
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Numero da Ordem de Servico">OS</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Numero da Pre-Ordem do Portal">POS</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Nome do cliente">Cliente</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Data do servico">Data</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Cidade do cliente">Cidade</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:right;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Horas registradas pelo tecnico na OS">Horas</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:right;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="KM registrado pelo tecnico na OS">KM</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:right;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Valor cobrado na OS">Valor</th>
                                <th style="font-size:14px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0" title="Placa do carro usado (GPS)">Carro</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            for (const o of ordsComGPS) {
                const isOpen = this._ordemAberta === o.os_num;
                const tipoColor = o.interno ? '#6366f1' : '#059669';
                const tipoLabel = o.interno ? 'Int' : 'Cob';
                const gd = o.gpsDia;
                const posNum = o.cod_int || '-';
                const clienteNome = o.cod_int ? (this._clienteMap[o.cod_int] || this._clienteMap[o.cod_int.split('-')[0] + '-' + o.cod_int.split('-')[1]] || '-') : '-';
                html += `
                    <tr onclick="Relatorio._toggleOrdem('${o.os_num}')" style="cursor:pointer;background:${isOpen ? '#EFF6FF' : 'transparent'};transition:background .1s" onmouseenter="this.style.background='${isOpen ? '#EFF6FF' : '#F8FAFC'}'" onmouseleave="this.style.background='${isOpen ? '#EFF6FF' : 'transparent'}'">
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid #F1F5F9;font-weight:700;color:#2563EB;white-space:nowrap">${o.os_num} <span style="font-size:11px;background:${tipoColor}20;color:${tipoColor};padding:2px 8px;border-radius:4px;font-weight:600">${tipoLabel}</span></td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid #F1F5F9;color:#6366f1;font-weight:600;white-space:nowrap" title="Pre-Ordem do Portal">${posNum}</td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid #F1F5F9;color:#1E293B;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${clienteNome}">${clienteNome}</td>
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid #F1F5F9;color:#334155;white-space:nowrap">${o.data ? o.data.split('-').reverse().join('/') : '-'}</td>
                        <td style="font-size:15px;padding:12px 14px;border-bottom:1px solid #F1F5F9;color:#1E293B;font-weight:500">${o.cidade || '-'}</td>
                        <td style="font-size:16px;padding:12px 14px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:700;font-family:monospace;color:#047857" title="Horas que o tecnico registrou na OS">${this._toNum(o.horas).toFixed(1)}</td>
                        <td style="font-size:16px;padding:12px 14px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:700;font-family:monospace;color:#B45309" title="KM que o tecnico registrou na OS">${this._toNum(o.km).toFixed(0)}</td>
                        <td style="font-size:16px;padding:12px 14px;border-bottom:1px solid #F1F5F9;text-align:right;font-weight:700;font-family:monospace;color:#7C3AED" title="Valor cobrado">${this._toNum(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style="font-size:14px;padding:12px 14px;border-bottom:1px solid #F1F5F9;color:#475569;font-weight:600" title="Placa do veiculo">${(o.cod_int && this._placaPorPOS[o.cod_int]) || (gd && gd.placa ? gd.placa : '-')}</td>
                    </tr>
                `;

                // Expandido: dados OS + GPS + divergencia
                if (isOpen) {
                    // Calcular divergencias desta OS
                    const divKmOS = gd ? (this._toNum(o.km) - gd.km) : 0;
                    const divHorasOS = gd ? (this._toNum(o.horas) - gd.horasFora) : 0;
                    const temDivergencia = gd && (Math.abs(divKmOS) > 20 || Math.abs(divHorasOS) > 2);

                    // Texto descritivo da divergencia
                    let txtDiv = '';
                    if (gd) {
                        const partes = [];
                        if (Math.abs(divKmOS) > 20) {
                            partes.push(divKmOS > 0
                                ? `Tecnico registrou ${Math.abs(divKmOS).toFixed(0)} km A MAIS que o GPS`
                                : `Tecnico registrou ${Math.abs(divKmOS).toFixed(0)} km A MENOS que o GPS`);
                        }
                        if (Math.abs(divHorasOS) > 2) {
                            partes.push(divHorasOS > 0
                                ? `Tecnico registrou ${Math.abs(divHorasOS).toFixed(1)}h A MAIS que o tempo fora da loja`
                                : `Tecnico registrou ${Math.abs(divHorasOS).toFixed(1)}h A MENOS que o tempo fora da loja`);
                        }
                        if (partes.length === 0) {
                            txtDiv = 'Sem divergencias significativas. Valores da OS compativeis com o GPS.';
                        } else {
                            txtDiv = partes.join('. ') + '.';
                        }
                    }

                    html += `<tr><td colspan="9" style="padding:0;border-bottom:1px solid #E2E8F0">
                        <div style="padding:18px 22px;background:#F8FAFC">
                            <!-- Dados da OS -->
                            <div style="margin-bottom:14px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase">Dados da OS (preenchido pelo tecnico)</div>
                            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:18px">
                                <div title="Horas que o tecnico informou na OS"><div style="font-size:12px;color:#64748B;font-weight:600">HORAS</div><div style="font-size:18px;font-weight:700;color:#047857">${this._toNum(o.horas).toFixed(1)}h</div></div>
                                <div title="KM que o tecnico informou na OS"><div style="font-size:12px;color:#64748B;font-weight:600">KM</div><div style="font-size:18px;font-weight:700;color:#B45309">${this._toNum(o.km).toFixed(0)} km</div></div>
                                <div title="Valor cobrado na OS"><div style="font-size:12px;color:#64748B;font-weight:600">VALOR</div><div style="font-size:18px;font-weight:700;color:#7C3AED">R$ ${this._toNum(o.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
                                <div><div style="font-size:12px;color:#64748B;font-weight:600">TIPO</div><div style="font-size:15px;color:#1E293B;font-weight:600">${o.interno ? 'Interna' : 'Cobrada'}</div></div>
                                <div><div style="font-size:12px;color:#64748B;font-weight:600">EMPRESA</div><div style="font-size:15px;color:#1E293B">${o.empresa || '-'}</div></div>
                                ${o.contrato ? `<div><div style="font-size:12px;color:#64748B;font-weight:600">CONTRATO</div><div style="font-size:15px;color:#1E293B">${o.contrato}</div></div>` : ''}
                                <div><div style="font-size:12px;color:#64748B;font-weight:600">TECNICOS</div><div style="font-size:15px;color:#1E293B">${(o.tecnicos || []).join(', ') || '-'}</div></div>
                            </div>
                            ${o.descricao ? `<div style="margin-bottom:14px"><div style="font-size:12px;color:#64748B;font-weight:600;margin-bottom:4px">DESCRICAO</div><div style="font-size:14px;color:#334155;white-space:pre-wrap;background:#fff;padding:12px;border-radius:6px;border:1px solid #E2E8F0;line-height:1.6">${o.descricao.replace(/\|/g, '\n')}</div></div>` : ''}

                            <!-- GPS do dia -->
                            <div style="margin-bottom:14px;font-size:13px;font-weight:700;color:#0E7490;text-transform:uppercase">GPS do dia ${o.data ? o.data.split('-').reverse().join('/') : ''}</div>
                            ${gd ? `
                                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-bottom:18px;padding:14px;background:#ECFEFF;border-radius:8px;border:1px solid #A5F3FC">
                                    <div title="Tempo com o veiculo em movimento"><div style="font-size:12px;color:#0E7490;font-weight:600">DIRIGINDO</div><div style="font-size:18px;font-weight:700;color:#0891B2">${gd.horasDirigindo.toFixed(1)}h</div></div>
                                    <div title="Tempo parado fora da Nova Tratores (no cliente)"><div style="font-size:12px;color:#7E22CE;font-weight:600">PARADO CLIENTE</div><div style="font-size:18px;font-weight:700;color:#9333EA">${gd.horasParado.toFixed(1)}h</div></div>
                                    <div title="KM total percorrido pelo veiculo segundo o GPS"><div style="font-size:12px;color:#C2410C;font-weight:600">KM GPS</div><div style="font-size:18px;font-weight:700;color:#EA580C">${gd.km.toFixed(0)} km</div></div>
                                    <div title="Tempo total fora da loja (dirigindo + parado)"><div style="font-size:12px;color:#64748B;font-weight:600">FORA DA LOJA</div><div style="font-size:18px;font-weight:700;color:#334155">${gd.horasFora.toFixed(1)}h</div></div>
                                    ${gd.placa ? `<div title="Placa do veiculo rastreado"><div style="font-size:12px;color:#64748B;font-weight:600">CARRO</div><div style="font-size:18px;font-weight:700;color:#1E293B">${gd.placa}</div></div>` : ''}
                                </div>

                                <!-- Divergencia -->
                                <div style="margin-bottom:10px;font-size:13px;font-weight:700;color:${temDivergencia ? '#B91C1C' : '#15803D'};text-transform:uppercase">${temDivergencia ? 'DIVERGENCIA ENCONTRADA' : 'SEM DIVERGENCIA'}</div>
                                <div style="padding:14px;background:${temDivergencia ? '#FEF2F2' : '#F0FDF4'};border-radius:8px;border:1px solid ${temDivergencia ? '#FECACA' : '#BBF7D0'}">
                                    <div style="font-size:15px;color:${temDivergencia ? '#991B1B' : '#166534'};font-weight:500;line-height:1.6;margin-bottom:10px">${txtDiv}</div>
                                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                                        <div title="Comparacao do KM: o que o tecnico registrou vs o que o GPS marcou">
                                            <div style="font-size:12px;color:#64748B;font-weight:600">KM: OS vs GPS</div>
                                            <div style="font-size:16px;font-weight:700;color:${Math.abs(divKmOS) > 20 ? '#B91C1C' : '#166534'}">${this._toNum(o.km).toFixed(0)} vs ${gd.km.toFixed(0)} <span style="font-size:13px;font-weight:700">(${divKmOS >= 0 ? '+' : ''}${divKmOS.toFixed(0)} km)</span></div>
                                        </div>
                                        <div title="Comparacao das horas: o que o tecnico registrou vs tempo fora da loja pelo GPS">
                                            <div style="font-size:12px;color:#64748B;font-weight:600">HORAS: OS vs GPS (fora loja)</div>
                                            <div style="font-size:16px;font-weight:700;color:${Math.abs(divHorasOS) > 2 ? '#B91C1C' : '#166534'}">${this._toNum(o.horas).toFixed(1)}h vs ${gd.horasFora.toFixed(1)}h <span style="font-size:13px;font-weight:700">(${divHorasOS >= 0 ? '+' : ''}${divHorasOS.toFixed(1)}h)</span></div>
                                        </div>
                                    </div>
                                </div>
                            ` : `<div style="padding:14px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;color:#64748B;font-size:15px">Sem dados GPS para este dia</div>`}
                        </div>
                    </td></tr>`;
                }
            }

            // Total tecnico
            html += `
                        <tr style="background:#F1F5F9">
                            <td style="font-size:16px;padding:14px;font-weight:700;color:#1E293B" colspan="5">Total Tecnico (${ords.length} OS)</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#047857" title="Total de horas registradas nas OS">${stats.horas.toFixed(1)}</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#B45309" title="Total de KM registrado nas OS">${stats.km.toFixed(0)}</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#7C3AED" title="Valor total das OS">${stats.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td style="padding:14px"></td>
                        </tr>
            `;

            // Total GPS (usando dados corrigidos por placa do relatorio)
            if (hasGPSData) {
                html += `
                        <tr style="background:#ECFEFF">
                            <td style="font-size:16px;padding:14px;font-weight:700;color:#0E7490" colspan="5" title="Dados reais do GPS do veiculo no mes">Total GPS (${gpsDiasUsados.size} dias)</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#0891B2" title="Total de horas dirigindo (veiculo em movimento)">${gpsSomaDirigindo.toFixed(1)}h</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#EA580C" title="Total de KM percorrido pelo GPS">${gpsSomaKm.toFixed(0)}</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:#9333EA" title="Total de horas parado no cliente">${gpsSomaParado.toFixed(1)}h par</td>
                            <td style="padding:14px"></td>
                        </tr>
                `;
            }

            // Divergencia total do mes
            if (hasGPSData) {
                const corDivKm = Math.abs(divKm) > 50 ? '#B91C1C' : '#166534';
                const corDivH = Math.abs(divHoras) > 5 ? '#B91C1C' : '#166534';
                const temDivMes = Math.abs(divKm) > 50 || Math.abs(divHoras) > 5;

                // Texto descritivo mensal
                const partesMes = [];
                if (Math.abs(divKm) > 50) {
                    partesMes.push(divKm > 0
                        ? `${nome} registrou ${Math.abs(divKm).toFixed(0)} km a mais que o GPS no mes`
                        : `${nome} registrou ${Math.abs(divKm).toFixed(0)} km a menos que o GPS no mes`);
                }
                if (Math.abs(divHoras) > 5) {
                    partesMes.push(divHoras > 0
                        ? `${nome} registrou ${Math.abs(divHoras).toFixed(1)}h a mais que o tempo real fora da loja`
                        : `${nome} registrou ${Math.abs(divHoras).toFixed(1)}h a menos que o tempo real fora da loja`);
                }

                html += `
                        <tr style="background:${temDivMes ? '#FEF2F2' : '#F0FDF4'}">
                            <td style="font-size:16px;padding:14px;font-weight:700;color:${temDivMes ? '#B91C1C' : '#166534'}" colspan="5" title="${partesMes.length > 0 ? partesMes.join('. ') : 'Valores compativeis'}">${temDivMes ? 'DIVERGENCIA MENSAL' : 'OK - Sem divergencia'}</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:${corDivH}" title="Diferenca de horas: OS menos GPS">${divHoras >= 0 ? '+' : ''}${divHoras.toFixed(1)}h</td>
                            <td style="font-size:16px;padding:14px;text-align:right;font-weight:800;font-family:monospace;color:${corDivKm}" title="Diferenca de KM: OS menos GPS">${divKm >= 0 ? '+' : ''}${divKm.toFixed(0)} km</td>
                            <td style="padding:14px" colspan="2"></td>
                        </tr>
                `;
            }

            html += `</tbody></table></div>`;
        }

        container.innerHTML = html;
    },

    _voltarCards() {
        this._tecnicoSel = null;
        this._ordemAberta = null;
        const container = document.getElementById('relatorio-content');
        this._renderCards(container);
    },

    _toggleOrdem(id) {
        this._ordemAberta = this._ordemAberta === id ? null : id;
        this._renderDetalhe();
    },

    // ===== KM VEICULOS =====

    async _toggleKmView() {
        this._kmView = !this._kmView;
        if (this._kmView) {
            await this._carregarKm();
            this._renderKmVeiculos();
        } else {
            const container = document.getElementById('relatorio-content');
            if (this._tecnicoSel) this._renderDetalhe();
            else this._renderCards(container);
        }
    },

    async _carregarKm() {
        // Carregar veiculos e km do mes em paralelo
        const [veicRes, kmRes] = await Promise.all([
            _supabase.from('tecnico_veiculos').select('placa, veiculo, tecnico_nome').order('placa'),
            _supabase.from('km_mensal_veiculos').select('*').eq('mes', this._mes)
        ]);
        // Deduplica veiculos por placa
        const placaMap = {};
        for (const v of (veicRes.data || [])) {
            if (v.placa && !placaMap[v.placa]) {
                placaMap[v.placa] = { placa: v.placa, descricao: v.veiculo || '', tecnico: v.tecnico_nome || '' };
            }
        }
        this._kmVeiculos = Object.values(placaMap);
        // Indexar km existente por placa
        this._kmData = {};
        for (const k of (kmRes.data || [])) {
            this._kmData[k.placa] = k;
        }
    },

    async _salvarKm() {
        const rows = [];
        for (const v of this._kmVeiculos) {
            const elInicio = document.getElementById(`km-inicio-${v.placa}`);
            const elFim = document.getElementById(`km-fim-${v.placa}`);
            if (!elInicio || !elFim) continue;
            const kmInicio = parseFloat(elInicio.value) || 0;
            const kmFim = parseFloat(elFim.value) || 0;
            rows.push({
                mes: this._mes,
                placa: v.placa,
                descricao: v.descricao,
                km_inicio: kmInicio,
                km_fim: kmFim,
                atualizado_por: 'portal',
                updated_at: new Date().toISOString()
            });
        }
        if (rows.length === 0) return;

        const { error } = await _supabase
            .from('km_mensal_veiculos')
            .upsert(rows, { onConflict: 'mes,placa' });

        if (error) {
            Utils.toast('Erro ao salvar KM: ' + error.message, 'error');
            console.error('Erro salvar KM:', error);
        } else {
            Utils.toast('KM salvo com sucesso!', 'success');
            await this._carregarKm();
            this._renderKmVeiculos();
        }
    },

    _renderKmVeiculos() {
        const container = document.getElementById('relatorio-content');
        let html = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
                <button onclick="Relatorio._toggleKmView()" style="width:32px;height:32px;border-radius:8px;border:1px solid #E2E8F0;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#64748B">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                </button>
                <div style="flex:1">
                    <div style="font-size:18px;font-weight:700;color:#1E293B">KM Veiculos - Odometro</div>
                    <div style="font-size:12px;color:#94A3B8">${this._mesLabel()} - Registre o KM no 1o e ultimo dia do mes</div>
                </div>
                <button onclick="Relatorio._salvarKm()" style="padding:8px 20px;border-radius:8px;border:none;background:#3b82f6;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>
            </div>
        `;

        if (this._kmVeiculos.length === 0) {
            html += `<div style="text-align:center;padding:40px;color:#94A3B8;font-size:13px">Nenhum veiculo cadastrado em tecnico_veiculos</div>`;
            container.innerHTML = html;
            return;
        }

        html += `
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
                <table style="width:100%;border-collapse:collapse">
                    <thead>
                        <tr style="background:#F1F5F9">
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0">Placa</th>
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0">Veiculo</th>
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:left;padding:12px 14px;border-bottom:1px solid #E2E8F0">Tecnico</th>
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:center;padding:12px 14px;border-bottom:1px solid #E2E8F0">KM Inicio</th>
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:center;padding:12px 14px;border-bottom:1px solid #E2E8F0">KM Fim</th>
                            <th style="font-size:13px;font-weight:600;color:#475569;text-align:center;padding:12px 14px;border-bottom:1px solid #E2E8F0">KM Percorrido</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const v of this._kmVeiculos) {
            const saved = this._kmData[v.placa];
            const kmInicio = saved ? saved.km_inicio : '';
            const kmFim = saved ? saved.km_fim : '';
            const percorrido = (kmInicio && kmFim && parseFloat(kmFim) > parseFloat(kmInicio))
                ? (parseFloat(kmFim) - parseFloat(kmInicio)).toFixed(0)
                : '-';

            html += `
                <tr>
                    <td style="font-size:14px;padding:10px 14px;border-bottom:1px solid #F1F5F9;font-weight:700;color:#1E293B">${v.placa}</td>
                    <td style="font-size:14px;padding:10px 14px;border-bottom:1px solid #F1F5F9;color:#475569">${v.descricao}</td>
                    <td style="font-size:14px;padding:10px 14px;border-bottom:1px solid #F1F5F9;color:#475569">${v.tecnico}</td>
                    <td style="padding:10px 14px;border-bottom:1px solid #F1F5F9;text-align:center">
                        <input id="km-inicio-${v.placa}" type="number" value="${kmInicio}" placeholder="0"
                            onchange="Relatorio._calcKmPerc('${v.placa}')"
                            style="width:100px;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:14px;font-weight:600;text-align:right;color:#047857" />
                    </td>
                    <td style="padding:10px 14px;border-bottom:1px solid #F1F5F9;text-align:center">
                        <input id="km-fim-${v.placa}" type="number" value="${kmFim}" placeholder="0"
                            onchange="Relatorio._calcKmPerc('${v.placa}')"
                            style="width:100px;padding:6px 10px;border:1px solid #E2E8F0;border-radius:6px;font-size:14px;font-weight:600;text-align:right;color:#B45309" />
                    </td>
                    <td id="km-perc-${v.placa}" style="font-size:16px;padding:10px 14px;border-bottom:1px solid #F1F5F9;text-align:center;font-weight:800;color:#3b82f6">${percorrido}</td>
                </tr>
            `;
        }

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    },

    _calcKmPerc(placa) {
        const elInicio = document.getElementById(`km-inicio-${placa}`);
        const elFim = document.getElementById(`km-fim-${placa}`);
        const elPerc = document.getElementById(`km-perc-${placa}`);
        if (!elInicio || !elFim || !elPerc) return;
        const ini = parseFloat(elInicio.value) || 0;
        const fim = parseFloat(elFim.value) || 0;
        elPerc.textContent = (fim > ini && ini > 0) ? (fim - ini).toFixed(0) : '-';
    }
};
