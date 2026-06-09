// =========================================================
// VEICULOS-TECNICOS - Vincular tecnicos a veiculos (GPS)
// Sincroniza com Rota Exata E Supabase (tecnico_veiculos)
// =========================================================

const VeiculosTecnicos = {
    _veiculosRota: [],     // veiculos do Rota Exata (adesoes)
    _motoristasRota: [],   // vinculos motorista<>veiculo atuais no Rota Exata
    _usuariosRota: [],     // usuarios com flag motorista=1
    _vinculos: [],         // tecnico_veiculos do Supabase

    async open() {
        document.getElementById('veiculos-tec-modal').style.display = 'flex';
        this._setLoading(true);
        await this._carregar();
        this._render();
    },

    close() {
        document.getElementById('veiculos-tec-modal').style.display = 'none';
    },

    _setLoading(show) {
        const body = document.getElementById('veiculos-tec-body');
        if (show) {
            body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:40px;gap:10px;color:var(--text-muted);font-size:13px"><div class="spinner"></div> Carregando veiculos e motoristas...</div>';
            document.getElementById('veiculos-tec-footer').innerHTML = '';
        }
    },

    // Chama API local (portal Next.js) - nao usa fetch overridden que vai pro Railway
    async _fetchLocal(path) {
        const res = await fetch(path);
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            // Se retornou HTML (endpoint nao existe), erro claro
            if (txt.startsWith('<!') || txt.includes('Cannot GET')) {
                throw new Error(`Endpoint ${path} nao encontrado no servidor. Verifique se o Next.js esta rodando.`);
            }
            throw new Error(`HTTP ${res.status}: ${txt.substring(0, 100)}`);
        }
        return res.json();
    },

    async _carregar() {
        try {
            const [veicRes, motRes, usrRes, vincRes] = await Promise.all([
                this._fetchLocal('/api/pos/rastreamento?acao=veiculos'),
                this._fetchLocal('/api/pos/rastreamento?acao=motoristas'),
                this._fetchLocal('/api/pos/rastreamento?acao=usuarios_motoristas'),
                _supabase.from('tecnico_veiculos').select('*').order('tecnico_nome')
            ]);
            this._veiculosRota = Array.isArray(veicRes) ? veicRes : [];
            this._motoristasRota = Array.isArray(motRes) ? motRes : [];
            this._usuariosRota = Array.isArray(usrRes) ? usrRes : [];
            this._vinculos = vincRes.data || [];
            console.log('[VeiculosTecnicos] Carregado:', this._veiculosRota.length, 'veiculos,', this._motoristasRota.length, 'motoristas,', this._usuariosRota.length, 'usuarios');
        } catch (e) {
            console.error('Erro ao carregar veiculos/tecnicos:', e);
            Utils.toast('Erro ao carregar: ' + (e.message || e), 'error');
            this._veiculosRota = [];
            this._motoristasRota = [];
            this._usuariosRota = [];
            this._vinculos = [];
        }
    },

    // Encontra o motorista atualmente vinculado a um veiculo no Rota Exata
    _motoristaAtualRota(adesaoId) {
        // Pega o mais recente (sem final) para esse adesao_id
        const vincs = this._motoristasRota
            .filter(m => m.adesao_id === adesaoId && m.final !== 1)
            .sort((a, b) => (b.dt_inicio || '').localeCompare(a.dt_inicio || ''));
        return vincs[0] || null;
    },

    _render() {
        const body = document.getElementById('veiculos-tec-body');
        const footer = document.getElementById('veiculos-tec-footer');

        if (this._veiculosRota.length === 0) {
            body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">Nenhum veiculo encontrado no Rota Exata</div>';
            footer.innerHTML = '<button class="crud-btn-cancel" onclick="VeiculosTecnicos.close()">Fechar</button>';
            return;
        }

        // Indexar vinculos supabase por adesao_id
        const vinculoPorAdesao = {};
        for (const v of this._vinculos) vinculoPorAdesao[v.adesao_id] = v;

        // Opções do select de motoristas
        const optMotoristas = `<option value="__NONE__" style="color:#ef4444">Sem motorista (desvincular)</option>` +
            this._usuariosRota.map(u =>
                `<option value="${u.id}">${this._esc(u.nome)}${u.cargo ? ' (' + this._esc(u.cargo) + ')' : ''}</option>`
            ).join('');

        let html = `
            <div style="padding:14px 18px 8px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--glass-border)">
                Vincule cada motorista ao veiculo. As alteracoes sao salvas no <b>Rota Exata</b> e no portal simultaneamente.
            </div>
            <div style="max-height:55vh;overflow-y:auto;padding:8px 18px">
        `;

        // Header
        html += `
            <div style="display:grid;grid-template-columns:110px 1fr 160px 40px;gap:8px;padding:8px 0;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--glass-border)">
                <div>Veiculo</div>
                <div>Motorista Atual (Rota Exata)</div>
                <div>Novo Motorista</div>
                <div></div>
            </div>
        `;

        // Separar: com vinculo primeiro
        const comVinculo = this._veiculosRota.filter(v => this._motoristaAtualRota(v.id));
        const semVinculo = this._veiculosRota.filter(v => !this._motoristaAtualRota(v.id));
        const ordenado = [...comVinculo, ...semVinculo];

        for (const veiculo of ordenado) {
            const motAtual = this._motoristaAtualRota(veiculo.id);
            const vincSupa = vinculoPorAdesao[veiculo.id];
            const statusColor = motAtual ? 'var(--accent-green)' : 'var(--text-muted)';

            html += `
                <div style="display:grid;grid-template-columns:110px 1fr 160px 40px;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)" data-adesao="${veiculo.id}">
                    <div>
                        <div style="display:flex;align-items:center;gap:6px">
                            <div style="width:7px;height:7px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
                            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${veiculo.placa || '---'}</div>
                        </div>
                        <div style="font-size:10px;color:var(--text-muted);margin-left:13px">${veiculo.descricao || ''}</div>
                    </div>
                    <div>
                        ${motAtual
                            ? `<div style="font-size:13px;font-weight:600;color:var(--accent-green)">${this._esc(motAtual.nome)}</div>
                               <div style="font-size:10px;color:var(--text-muted)">ID: ${motAtual.motorista_id} | vinculo: ${motAtual._id ? motAtual._id.substring(0, 8) + '...' : '-'}</div>`
                            : `<div style="font-size:12px;color:var(--text-muted);font-style:italic">Sem motorista</div>`
                        }
                    </div>
                    <div>
                        <select id="vt-sel-${veiculo.id}" style="width:100%;padding:6px 8px;border:1px solid var(--glass-border);border-radius:6px;background:var(--bg-sidebar);color:var(--text-primary);font-size:12px;font-family:'Inter',sans-serif">
                            <option value="">-- manter --</option>
                            ${optMotoristas}
                        </select>
                    </div>
                    <div style="text-align:center">
                        ${motAtual ? `<button onclick="VeiculosTecnicos._desvincularRota('${motAtual._id}', ${veiculo.id})" title="Desvincular do Rota Exata" style="background:none;border:none;color:var(--accent-red);cursor:pointer;font-size:14px;padding:4px">&#10005;</button>` : ''}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        body.innerHTML = html;

        footer.innerHTML = `
            <button class="crud-btn-cancel" onclick="VeiculosTecnicos.close()">Cancelar</button>
            <button class="crud-btn-save" onclick="VeiculosTecnicos._salvar()">Salvar Alteracoes</button>
        `;
    },

    async _salvar() {
        const footer = document.getElementById('veiculos-tec-footer');
        const btnSave = footer.querySelector('.crud-btn-save');
        if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Salvando...'; }

        try {
            let countRota = 0, countSupa = 0;

            // 1) Processar alteracoes no Rota Exata (novos vinculos de motorista)
            for (const veiculo of this._veiculosRota) {
                const sel = document.getElementById(`vt-sel-${veiculo.id}`);
                if (!sel || !sel.value) continue;

                const motAtual = this._motoristaAtualRota(veiculo.id);

                // Opcao "Sem motorista" -> apenas desvincular
                if (sel.value === '__NONE__') {
                    if (motAtual && motAtual._id) {
                        await this._apiPost({ acao: 'desvincular_motorista', vinculo_id: motAtual._id });
                        await _supabase.from('tecnico_veiculos').delete().eq('adesao_id', veiculo.id);
                        countRota++;
                    }
                    continue;
                }

                const motoristaId = parseInt(sel.value);
                if (!motoristaId) continue;

                // Desvincular motorista atual primeiro (se houver)
                if (motAtual && motAtual._id) {
                    await this._apiPost({ acao: 'desvincular_motorista', vinculo_id: motAtual._id });
                }

                // Vincular novo motorista no Rota Exata
                await this._apiPost({ acao: 'vincular_motorista', adesao_id: veiculo.id, motorista_id: motoristaId });
                countRota++;

                // Encontrar nome do motorista selecionado
                const usr = this._usuariosRota.find(u => u.id === motoristaId);
                if (usr) {
                    // Atualizar tecnico_veiculos no Supabase tambem
                    await _supabase.from('tecnico_veiculos').upsert({
                        tecnico_nome: usr.nome,
                        adesao_id: veiculo.id,
                        placa: veiculo.placa || '',
                        descricao: veiculo.descricao || ''
                    }, { onConflict: 'tecnico_nome' });
                    countSupa++;
                }
            }

            if (countRota === 0) {
                Utils.toast('Nenhuma alteracao selecionada', 'info');
            } else {
                Utils.toast(`${countRota} vinculo(s) atualizado(s) no Rota Exata e Portal!`, 'success');
            }

            // Recarregar pra mostrar estado atualizado
            this._setLoading(true);
            await this._carregar();
            this._render();
        } catch (e) {
            console.error('Erro ao salvar:', e);
            Utils.toast('Erro ao salvar: ' + (e.message || e), 'error');
            if (btnSave) { btnSave.disabled = false; btnSave.textContent = 'Salvar Alteracoes'; }
        }
    },

    async _desvincularRota(vinculoId, adesaoId) {
        if (!confirm('Desvincular este motorista do veiculo no Rota Exata?')) return;
        try {
            await this._apiPost({ acao: 'desvincular_motorista', vinculo_id: vinculoId });

            // Remover do Supabase tambem
            await _supabase.from('tecnico_veiculos').delete().eq('adesao_id', adesaoId);

            Utils.toast('Motorista desvinculado!', 'success');

            // Recarregar
            this._setLoading(true);
            await this._carregar();
            this._render();
        } catch (e) {
            Utils.toast('Erro ao desvincular: ' + (e.message || e), 'error');
        }
    },

    async _apiPost(body) {
        const res = await fetch('/api/pos/rastreamento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
    },

    _esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
};
