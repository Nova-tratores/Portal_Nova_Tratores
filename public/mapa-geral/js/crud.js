// =========================================================
// CRUD MODAL - Client & Vehicle management
// =========================================================

const CrudModal = {
    type: null,       // 'client' or 'vehicle'
    editId: null,     // client id or vehicle placa (null = create)
    editData: null,

    _prefillCoords: null, // { lat, lng } when opening from map right-click

    openClient(id = null, coords = null) {
        this.type = 'client';
        this.editId = id;
        this.editData = null;
        this._prefillCoords = coords;

        if (id) {
            // Editar: buscar dados do cliente via endpoint local
            fetch(`/api/mapa/clientes?id=${id}`).then(r => r.json()).then(c => {
                this.editData = c;
                this._render();
            }).catch(() => Utils.toast('Erro ao carregar cliente', 'error'));
        } else {
            this._render();
        }
    },

    openVehicle(placa = null) {
        this.type = 'vehicle';
        this.editId = placa;
        this.editData = null;

        if (placa) {
            // Buscar dados do veiculo do state
            const v = (App.state.veiculos || []).find(v => v.placa === placa);
            if (v) this.editData = v;
        }
        this._render();
    },

    _render() {
        const modal = document.getElementById('crud-modal');
        const title = document.getElementById('crud-modal-title');
        const body = document.getElementById('crud-modal-body');
        const footer = document.getElementById('crud-modal-footer');

        if (this.type === 'client') {
            const c = this.editData || {};
            title.textContent = this.editId ? 'Editar Cliente' : 'Novo Cliente';
            body.innerHTML = `
                <div class="crud-form-group">
                    <label>Nome fantasia *</label>
                    <input type="text" id="crud-nome" value="${c.nome || c.nome_fantasia || ''}" placeholder="Nome do cliente">
                </div>
                <div class="crud-form-group">
                    <label>Razao social</label>
                    <input type="text" id="crud-razao" value="${c.razao_social || ''}" placeholder="Razao social">
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>CNPJ / CPF</label>
                        <input type="text" id="crud-cnpj" value="${c.cnpj_cpf || ''}" placeholder="00.000.000/0000-00">
                    </div>
                    <div class="crud-form-group">
                        <label>Telefone</label>
                        <input type="text" id="crud-telefone" value="${c.telefone || ''}" placeholder="(00) 00000-0000">
                    </div>
                </div>
                <div class="crud-form-group">
                    <label>Email</label>
                    <input type="email" id="crud-email" value="${c.email || ''}" placeholder="email@exemplo.com">
                </div>
                <div class="crud-form-group">
                    <label>Endereco</label>
                    <input type="text" id="crud-endereco" value="${c.endereco || ''}" placeholder="Rua, numero">
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>Bairro</label>
                        <input type="text" id="crud-bairro" value="${c.bairro || ''}" placeholder="Bairro">
                    </div>
                    <div class="crud-form-group">
                        <label>CEP</label>
                        <input type="text" id="crud-cep" value="${c.cep || ''}" placeholder="00000-000">
                    </div>
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>Cidade *</label>
                        <input type="text" id="crud-cidade" value="${c.cidade || ''}" placeholder="Cidade">
                    </div>
                    <div class="crud-form-group">
                        <label>Estado</label>
                        <input type="text" id="crud-estado" value="${c.estado || ''}" placeholder="SP" maxlength="2">
                    </div>
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>Latitude</label>
                        <input type="text" id="crud-lat" value="${c.lat || (this._prefillCoords ? this._prefillCoords.lat : '')}" placeholder="-23.1234">
                    </div>
                    <div class="crud-form-group">
                        <label>Longitude</label>
                        <input type="text" id="crud-lng" value="${c.lng || (this._prefillCoords ? this._prefillCoords.lng : '')}" placeholder="-49.1234">
                    </div>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                    * Campos obrigatorios. Coordenadas: preencha para posicionar no mapa.
                </div>
            `;
        } else {
            const v = this.editData || {};
            title.textContent = this.editId ? 'Editar Veiculo' : 'Novo Veiculo';
            body.innerHTML = `
                <div class="crud-form-group">
                    <label>Placa *</label>
                    <input type="text" id="crud-placa" value="${v.placa || ''}" placeholder="ABC-1234" maxlength="8" ${this.editId ? 'readonly style="opacity:0.6"' : ''}>
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>Modelo</label>
                        <input type="text" id="crud-modelo" value="${v.modelo || ''}" placeholder="Ex: Fox, HB20...">
                    </div>
                    <div class="crud-form-group">
                        <label>Cor</label>
                        <input type="text" id="crud-cor" value="${v.cor || ''}" placeholder="Branca, Preta...">
                    </div>
                </div>
                <div class="crud-form-row">
                    <div class="crud-form-group">
                        <label>Ano</label>
                        <input type="text" id="crud-ano" value="${v.ano || ''}" placeholder="2024" maxlength="4">
                    </div>
                    <div class="crud-form-group">
                        <label>Motorista</label>
                        <input type="text" id="crud-motorista" value="${v.motorista || ''}" placeholder="Nome do motorista">
                    </div>
                </div>
            `;
        }

        // Footer buttons
        let footerHTML = `<button class="crud-btn-cancel" onclick="CrudModal.close()">Cancelar</button>`;
        if (this.editId) {
            footerHTML += `<button class="crud-btn-danger" onclick="CrudModal.delete()">Excluir</button>`;
        }
        footerHTML += `<button class="crud-btn-save" onclick="CrudModal.save()">Salvar</button>`;
        footer.innerHTML = footerHTML;

        modal.classList.add('open');
    },

    close() {
        document.getElementById('crud-modal').classList.remove('open');
        this.type = null;
        this.editId = null;
        this.editData = null;
    },

    async save() {
        try {
            if (this.type === 'client') {
                const data = {
                    nome: document.getElementById('crud-nome').value.trim(),
                    razao_social: document.getElementById('crud-razao').value.trim(),
                    cnpj_cpf: document.getElementById('crud-cnpj').value.trim(),
                    telefone: document.getElementById('crud-telefone').value.trim(),
                    email: document.getElementById('crud-email').value.trim(),
                    endereco: document.getElementById('crud-endereco').value.trim(),
                    bairro: document.getElementById('crud-bairro').value.trim(),
                    cep: document.getElementById('crud-cep').value.trim(),
                    cidade: document.getElementById('crud-cidade').value.trim(),
                    estado: document.getElementById('crud-estado').value.trim().toUpperCase()
                };

                if (!data.nome || !data.cidade) {
                    Utils.toast('Nome e cidade sao obrigatorios', 'error');
                    return;
                }

                // Coordenadas do formulario
                const latVal = document.getElementById('crud-lat').value.trim();
                const lngVal = document.getElementById('crud-lng').value.trim();
                if (latVal && lngVal) {
                    data.lat = parseFloat(latVal);
                    data.lng = parseFloat(lngVal);
                }

                // Salvar no Supabase via endpoint local
                const supaData = {
                    nome_fantasia: data.nome,
                    razao_social: data.razao_social || data.nome,
                    cnpj_cpf: data.cnpj_cpf,
                    telefone: data.telefone,
                    email: data.email,
                    endereco: data.endereco,
                    bairro: data.bairro,
                    cep: data.cep,
                    cidade: data.cidade,
                    estado: data.estado,
                    lat: data.lat || null,
                    lng: data.lng || null,
                };

                let resp;
                if (this.editId) {
                    supaData.id = this.editId;
                    resp = await fetch('/api/mapa/clientes', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(supaData)
                    });
                } else {
                    resp = await fetch('/api/mapa/clientes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(supaData)
                    });
                }
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.error || 'Erro ao salvar');

                Utils.toast(this.editId ? 'Cliente atualizado!' : 'Cliente criado!', 'success');
                this.close();
                App.loadAllData(); // Recarregar dados
            } else {
                const data = {
                    placa: document.getElementById('crud-placa').value.trim().toUpperCase(),
                    modelo: document.getElementById('crud-modelo').value.trim(),
                    cor: document.getElementById('crud-cor').value.trim(),
                    ano: document.getElementById('crud-ano').value.trim(),
                    motorista: document.getElementById('crud-motorista').value.trim()
                };

                if (!data.placa) {
                    Utils.toast('Placa e obrigatoria', 'error');
                    return;
                }

                let url, method;
                if (this.editId) {
                    url = `/api/veiculos/${this.editId}`;
                    method = 'PUT';
                } else {
                    url = '/api/veiculos';
                    method = 'POST';
                }

                const resp = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await resp.json();
                if (!resp.ok) throw new Error(result.error || 'Erro ao salvar');

                Utils.toast(this.editId ? 'Veiculo atualizado!' : 'Veiculo cadastrado!', 'success');
                this.close();
                App.refreshVehicles();
            }
        } catch (e) {
            Utils.toast(e.message || 'Erro ao salvar', 'error');
        }
    },

    async delete() {
        const confirmMsg = this.type === 'client' ? 'Excluir este cliente?' : 'Excluir este veiculo?';
        if (!confirm(confirmMsg)) return;

        try {
            let resp;
            if (this.type === 'client') {
                resp = await fetch(`/api/mapa/clientes?id=${this.editId}`, { method: 'DELETE' });
            } else {
                resp = await fetch(`/api/veiculos/${this.editId}`, { method: 'DELETE' });
            }
            if (!resp.ok) throw new Error('Erro ao excluir');

            Utils.toast('Excluido com sucesso!', 'success');
            this.close();

            if (this.type === 'client') {
                Panels.close();
                App.loadAllData();
            } else {
                VehiclePanel.close();
                App.refreshVehicles();
            }
        } catch (e) {
            Utils.toast(e.message || 'Erro ao excluir', 'error');
        }
    }
};
