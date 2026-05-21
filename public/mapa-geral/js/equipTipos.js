// =========================================================
// EQUIP TIPOS - Gerenciamento de tipos de equipamento
// (padroes built-in + customizados que o usuario pode criar)
// =========================================================
const EquipTipos = {
    _data: { builtin: [], custom: [] },

    async open() {
        document.getElementById('equip-tipos-modal').style.display = 'flex';
        await this._fetch();
        this._render();
    },

    close() {
        document.getElementById('equip-tipos-modal').style.display = 'none';
    },

    async _fetch() {
        try {
            const r = await fetch('/api/equipamento-tipos');
            this._data = await r.json();
        } catch (e) {
            this._data = { builtin: [], custom: [] };
        }
    },

    _render() {
        const body = document.getElementById('equip-tipos-body');
        const footer = document.getElementById('equip-tipos-footer');

        const tiposDropdown = this._data.builtin
            .map(t => `<option value="${t.tipo}">${t.label}</option>`)
            .join('');

        const customList = this._data.custom.length === 0
            ? '<div style="font-size:12px;color:var(--text-muted);padding:8px">Nenhum padrao customizado ainda.</div>'
            : this._data.custom.map(c => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px">
                    <div style="flex:1;font-size:12px">
                        <b>${c.label}</b> <span style="color:var(--text-muted)">(${c.tipo})</span>
                        <div style="color:var(--text-muted);font-size:11px;margin-top:2px">Casa: ${(c.match_strings || []).map(s => '<code style="background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px">' + s + '</code>').join(' &middot; ')}</div>
                    </div>
                    <button class="region-popup-btn danger" onclick="EquipTipos.remove('${c.id}')" style="padding:4px 8px;font-size:11px">Excluir</button>
                </div>
            `).join('');

        body.innerHTML = `
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
                Quando um equipamento for cadastrado, o nome dele e comparado com os padroes abaixo. Se nao casar com nenhum, vira "Peca" (fallback).
            </div>

            <div class="crud-form-group">
                <label style="font-weight:600;font-size:13px">Padroes customizados (${this._data.custom.length})</label>
                <div style="max-height:200px;overflow-y:auto">${customList}</div>
            </div>

            <hr style="margin:14px 0;border-color:rgba(255,255,255,0.08)">

            <div style="font-weight:600;font-size:13px;margin-bottom:8px">Adicionar novo padrao</div>
            <div class="crud-form-row" style="display:flex;gap:10px">
                <div class="crud-form-group" style="flex:1">
                    <label>Tipo</label>
                    <select id="et-tipo" class="crud-input">${tiposDropdown}</select>
                </div>
                <div class="crud-form-group" style="flex:1">
                    <label>Rotulo (display)</label>
                    <input type="text" id="et-label" class="crud-input" placeholder="ex: Pulverizador KUHN">
                </div>
            </div>
            <div class="crud-form-group">
                <label>Palavras-chave (separe com virgula)</label>
                <input type="text" id="et-match" class="crud-input" placeholder="ex: ACCURA, ARBO 260, KUHN PUL">
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                    Cada palavra-chave casa case-insensitive. Aceita regex (ex: \\bACCURA\\b para casar palavra exata).
                </div>
            </div>
        `;

        footer.innerHTML = `
            <button class="crud-btn-cancel" onclick="EquipTipos.close()">Fechar</button>
            <button class="crud-btn-save" onclick="EquipTipos.add()">Adicionar padrao</button>
        `;
    },

    async add() {
        const tipo = document.getElementById('et-tipo').value;
        const label = document.getElementById('et-label').value.trim();
        const matchRaw = document.getElementById('et-match').value.trim();
        if (!matchRaw) return Utils.toast('Informe ao menos 1 palavra-chave', 'error');

        const match_strings = matchRaw.split(',').map(s => s.trim()).filter(Boolean);
        try {
            const resp = await fetch('/api/equipamento-tipos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, label: label || tipo, match_strings })
            });
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'falha');

            // Reclassificar automaticamente
            await fetch('/api/equipamento-tipos/reclassificar', { method: 'POST' });

            Utils.toast('Padrao adicionado e equipamentos reclassificados', 'success');
            await this._fetch();
            this._render();
            // Recarrega contadores nas regioes se RegionEditor existe
            if (typeof RegionEditor !== 'undefined' && RegionEditor._refreshContadores) {
                RegionEditor._refreshContadores();
            }
            // Recarrega clientes para refletir novos tipos
            if (typeof App !== 'undefined' && App.refresh) App.refresh();
        } catch (e) {
            Utils.toast('Erro: ' + e.message, 'error');
        }
    },

    async remove(id) {
        if (!confirm('Excluir este padrao customizado?')) return;
        try {
            const resp = await fetch('/api/equipamento-tipos/' + id, { method: 'DELETE' });
            if (!resp.ok) throw new Error('Falha ao excluir');
            await fetch('/api/equipamento-tipos/reclassificar', { method: 'POST' });
            Utils.toast('Padrao removido', 'success');
            await this._fetch();
            this._render();
            if (typeof RegionEditor !== 'undefined' && RegionEditor._refreshContadores) {
                RegionEditor._refreshContadores();
            }
        } catch (e) {
            Utils.toast('Erro: ' + e.message, 'error');
        }
    }
};
