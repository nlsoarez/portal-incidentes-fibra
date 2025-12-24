class IncidentMonitorApp {
    constructor() {
        this.api = new IncidentAPI();
        this.chartManager = new ChartManager();
        
        // Estado da aplicação
        this.state = {
            currentData: [],
            filteredData: [],
            previousData: [],
            filters: {
                status: 'all',
                regional: 'all',
                period: '24h'
            },
            settings: {
                // URL original da API (o proxy.php usará esta URL internamente)
                apiUrl: 'http://10.29.5.216/scr/sgo_incidentes_abertos.php',
                refreshInterval: 5,
                excludedRegions: {
                    states: ['SP', 'PR', 'SC', 'RS'],
                    cities: ['SÃO PAULO', 'CURITIBA', 'PORTO ALEGRE', 'FLORIANÓPOLIS']
                }
            },
            autoRefresh: true,
            pageSize: 20,
            currentPage: 1,
            lastError: null
        };
        
        // Elementos DOM
        this.elements = {};
        
        // Intervalos
        this.refreshInterval = null;
    }

    async init() {
        this.cacheDomElements();
        this.bindEvents();
        this.loadSettings();
        
        // Carregar dados iniciais
        await this.refreshData();
        
        // Iniciar auto-refresh
        this.startAutoRefresh();
    }

    cacheDomElements() {
        this.elements = {
            // KPI
            kpiPendentes: document.getElementById('kpi-pendentes'),
            kpiProgresso: document.getElementById('kpi-progresso'),
            kpiCidades: document.getElementById('kpi-cidades'),
            kpiTempo: document.getElementById('kpi-tempo'),
            
            // Contadores
            countPendentes: document.getElementById('count-pendentes'),
            countProgresso: document.getElementById('count-progresso'),
            countTotal: document.getElementById('count-total'),
            
            // Filtros
            filterStatus: document.getElementById('filter-status'),
            filterRegional: document.getElementById('filter-regional'),
            filterPeriod: document.getElementById('filter-period'),
            applyFilters: document.getElementById('apply-filters'),
            
            // Tabela
            incidentesBody: document.getElementById('incidentes-body'),
            incidentCount: document.getElementById('incident-count'),
            showingCount: document.getElementById('showing-count'),
            totalCount: document.getElementById('total-count'),
            pagination: document.getElementById('pagination'),
            
            // Monitoramento
            autoRefresh: document.getElementById('auto-refresh'),
            manualRefresh: document.getElementById('manual-refresh'),
            newIncidentsBody: document.getElementById('new-incidents-body'),
            alertTimeline: document.getElementById('alert-timeline'),
            
            // Configurações
            excludeSP: document.getElementById('exclude-sp'),
            excludeSul: document.getElementById('exclude-sul'),
            excludeParana: document.getElementById('exclude-parana'),
            apiUrl: document.getElementById('api-url'),
            proxyUrl: document.getElementById('proxy-url'),
            refreshInterval: document.getElementById('refresh-interval'),
            saveSettings: document.getElementById('save-settings'),
            
            // Status
            lastUpdateTime: document.getElementById('last-update-time'),
            connectionStatus: document.getElementById('connection-status')
        };
    }

    bindEvents() {
        // Filtros
        this.elements.applyFilters.addEventListener('click', () => this.applyFilters());
        
        // Monitoramento
        this.elements.manualRefresh.addEventListener('click', () => this.refreshData());
        this.elements.autoRefresh.addEventListener('change', (e) => {
            this.state.autoRefresh = e.target.checked;
            if (this.state.autoRefresh) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });
        
        // Configurações
        this.elements.saveSettings.addEventListener('click', () => this.saveSettings());
        
        // Exportar
        document.getElementById('export-data').addEventListener('click', () => this.exportData());
    }

    async refreshData() {
        try {
            this.showLoading(true);
            this.state.lastError = null;

            // Atualizar timestamp
            this.updateLastUpdateTime();

            // Buscar dados
            console.log('Iniciando busca de dados...');
            const allData = await this.api.fetchData();

            // Verificar se recebemos dados válidos
            if (!allData || !Array.isArray(allData)) {
                throw new Error('Dados inválidos recebidos da API');
            }

            console.log(`Recebidos ${allData.length} registros da API`);

            // Filtrar apenas FIBRA
            const fiberData = this.api.filterFiberIncidents(allData);
            console.log(`${fiberData.length} incidentes de FIBRA após filtro`);

            // Verificar novos incidentes
            const newIncidents = this.api.findNewIncidents(fiberData, this.state.previousData);

            // Atualizar estado
            this.state.previousData = [...this.state.currentData];
            this.state.currentData = fiberData;
            this.state.filteredData = this.applyCurrentFilters(fiberData);

            // Atualizar interface
            this.updateKPIs();
            this.updateCharts();
            this.updateTable();
            this.updateNewIncidents(newIncidents);
            this.updateAlertTimeline(newIncidents);

            // Atualizar conexão
            this.updateConnectionStatus(true);

            // Mostrar sucesso se houver dados
            if (fiberData.length > 0) {
                console.log('Dados carregados com sucesso!');
            } else {
                this.showWarning('Nenhum incidente de FIBRA encontrado com os filtros atuais.');
            }

        } catch (error) {
            console.error('Erro ao atualizar dados:', error);
            this.state.lastError = error.message;
            this.updateConnectionStatus(false);

            // Mensagem de erro mais informativa
            let errorMessage = 'Erro ao carregar dados. ';

            if (error.message.includes('STATIC_HOSTING')) {
                // Erro específico de GitHub Pages / hospedagem estática
                this.showStaticHostingError();
                return;
            } else if (error.message.includes('VPN')) {
                errorMessage += 'Verifique se a VPN está conectada.';
            } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                errorMessage += 'A API demorou muito para responder.';
            } else if (error.message.includes('PHP')) {
                errorMessage += 'O servidor não está executando PHP. Verifique a configuração do servidor.';
            } else if (error.message.includes('proxy')) {
                errorMessage += 'O proxy não está acessível. Verifique se o servidor PHP está rodando.';
            } else {
                errorMessage += error.message || 'Verifique a conexão com a API.';
            }

            this.showError(errorMessage);
        } finally {
            this.showLoading(false);
        }
    }

    showStaticHostingError() {
        const alertHtml = `
            <div class="alert alert-warning alert-dismissible fade show m-3" role="alert" id="static-hosting-alert">
                <h5><i class="fas fa-exclamation-triangle me-2"></i>Hospedagem Estática Detectada</h5>
                <p>Este site está hospedado no <strong>GitHub Pages</strong>, que não suporta PHP.</p>
                <p>Para conectar à API, você precisa de uma das seguintes opções:</p>
                <ol>
                    <li><strong>Hospedar o proxy.php em um servidor com PHP</strong> (ex: servidor interno da empresa, VPS, etc.)</li>
                    <li><strong>Rodar localmente</strong> usando <code>php -S localhost:8000</code></li>
                </ol>
                <hr>
                <div class="mb-3">
                    <label class="form-label"><strong>URL do Proxy Externo:</strong></label>
                    <div class="input-group">
                        <input type="text" class="form-control" id="external-proxy-url"
                               placeholder="http://seu-servidor.com/proxy.php"
                               value="${this.api.externalProxyUrl || ''}">
                        <button class="btn btn-primary" type="button" id="save-external-proxy">
                            <i class="fas fa-save me-1"></i>Salvar e Testar
                        </button>
                    </div>
                    <small class="text-muted">Configure a URL de um proxy que tenha acesso à rede interna (VPN)</small>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;

        // Remover alerta anterior se existir
        const existingAlert = document.getElementById('static-hosting-alert');
        if (existingAlert) existingAlert.remove();

        // Inserir no topo do container principal
        const mainContainer = document.querySelector('.container-fluid.mt-4');
        if (mainContainer) {
            mainContainer.insertAdjacentHTML('afterbegin', alertHtml);

            // Adicionar evento ao botão
            document.getElementById('save-external-proxy').addEventListener('click', () => {
                const proxyUrl = document.getElementById('external-proxy-url').value;
                this.api.setExternalProxy(proxyUrl);
                this.refreshData();
            });
        }
    }

    applyCurrentFilters(data) {
        let filtered = [...data];
        
        // Filtrar por status
        if (this.state.filters.status !== 'all') {
            filtered = filtered.filter(item => 
                item.nm_status === this.state.filters.status
            );
        }
        
        // Filtrar por regional
        if (this.state.filters.regional !== 'all') {
            filtered = filtered.filter(item => 
                item.regional === this.state.filters.regional
            );
        }
        
        // Filtrar por período
        if (this.state.filters.period !== 'all') {
            const now = new Date();
            let cutoffDate = new Date();
            
            switch(this.state.filters.period) {
                case '24h':
                    cutoffDate.setDate(now.getDate() - 1);
                    break;
                case '7d':
                    cutoffDate.setDate(now.getDate() - 7);
                    break;
                case '30d':
                    cutoffDate.setDate(now.getDate() - 30);
                    break;
            }
            
            filtered = filtered.filter(item => {
                const incidentDate = new Date(item.dh_inicio || item.data_entrada);
                return incidentDate >= cutoffDate;
            });
        }
        
        return filtered;
    }

    applyFilters() {
        this.state.filters = {
            status: this.elements.filterStatus.value,
            regional: this.elements.filterRegional.value,
            period: this.elements.filterPeriod.value
        };
        
        this.state.filteredData = this.applyCurrentFilters(this.state.currentData);
        this.state.currentPage = 1;
        
        this.updateTable();
        this.updateCharts();
    }

    updateKPIs() {
        const data = this.state.filteredData;
        
        // Contar por status
        const pendentes = data.filter(item => item.nm_status === 'PENDENTE').length;
        const progresso = data.filter(item => item.nm_status === 'EM PROGRESSO').length;
        
        // Cidades únicas
        const cidadesUnicas = new Set(data.map(item => item.nm_cidade)).size;
        
        // Tempo médio (simplificado)
        const tempos = data.map(item => {
            const inicio = new Date(item.dh_inicio);
            const agora = new Date();
            return (agora - inicio) / (1000 * 60 * 60); // horas
        });
        const tempoMedio = tempos.length > 0 
            ? Math.round(tempos.reduce((a, b) => a + b) / tempos.length)
            : 0;
        
        // Atualizar elementos
        this.elements.kpiPendentes.textContent = pendentes;
        this.elements.kpiProgresso.textContent = progresso;
        this.elements.kpiCidades.textContent = cidadesUnicas;
        this.elements.kpiTempo.textContent = `${tempoMedio}h`;
        
        this.elements.countPendentes.textContent = pendentes;
        this.elements.countProgresso.textContent = progresso;
        this.elements.countTotal.textContent = data.length;
    }

    updateCharts() {
        const data = this.state.filteredData;
        
        // Dados para gráficos
        const regionalData = this.api.groupByRegional(data);
        const statusData = this.api.groupByStatus(data);
        
        // Atualizar gráficos
        this.chartManager.initRegionalChart('chart-regional', regionalData);
        this.chartManager.initStatusChart('chart-status', statusData);
        this.chartManager.initTrendChart('chart-trend', data);
    }

    updateTable() {
        const data = this.state.filteredData;
        const page = this.state.currentPage;
        const pageSize = this.state.pageSize;
        
        // Calcular paginação
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, data.length);
        const pageData = data.slice(startIndex, endIndex);
        
        // Limpar tabela
        this.elements.incidentesBody.innerHTML = '';
        
        // Adicionar linhas
        pageData.forEach(incident => {
            const row = this.createTableRow(incident);
            this.elements.incidentesBody.appendChild(row);
        });
        
        // Atualizar contadores
        this.elements.incidentCount.textContent = data.length;
        this.elements.showingCount.textContent = `${startIndex + 1}-${endIndex}`;
        this.elements.totalCount.textContent = data.length;
        
        // Atualizar paginação
        this.updatePagination(data.length);
    }

    createTableRow(incident) {
        const row = document.createElement('tr');
        
        // Calcular tempo decorrido
        const duration = this.api.calculateDuration(incident.dh_inicio);
        
        // Formatar data
        const inicioDate = incident.dh_inicio ? 
            new Date(incident.dh_inicio).toLocaleString('pt-BR') : 'N/A';
        
        const previsaoDate = incident.dh_previsao ?
            new Date(incident.dh_previsao).toLocaleString('pt-BR') : 'N/A';
        
        // Criar badge de status
        const statusBadge = incident.nm_status === 'PENDENTE' ? 
            '<span class="badge badge-pendente">PENDENTE</span>' :
            '<span class="badge badge-progresso">EM PROGRESSO</span>';
        
        row.innerHTML = `
            <td><small class="text-muted">${incident.id}</small></td>
            <td>${incident.nm_cidade || 'N/A'}</td>
            <td>${incident.regional || 'N/A'}</td>
            <td><code>${incident.topologia || 'N/A'}</code></td>
            <td>${statusBadge}</td>
            <td><small>${inicioDate}</small></td>
            <td><small>${previsaoDate}</small></td>
            <td><strong>${duration}</strong></td>
            <td>
                <button class="btn btn-sm btn-outline-info" onclick="app.showDetails('${incident.id}')">
                    <i class="fas fa-info-circle"></i>
                </button>
            </td>
        `;
        
        return row;
    }

    updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.state.pageSize);
        const paginationEl = this.elements.pagination;
        
        paginationEl.innerHTML = '';
        
        // Botão anterior
        const prevButton = this.createPaginationButton('Anterior', page => page - 1, 
            this.state.currentPage === 1);
        paginationEl.appendChild(prevButton);
        
        // Números de página
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = this.createPaginationButton(i.toString(), () => i, 
                this.state.currentPage === i, true);
            paginationEl.appendChild(pageButton);
        }
        
        // Botão próximo
        const nextButton = this.createPaginationButton('Próximo', page => page + 1,
            this.state.currentPage === totalPages);
        paginationEl.appendChild(nextButton);
    }

    createPaginationButton(text, pageFn, disabled = false, isNumber = false) {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${isNumber && this.state.currentPage === parseInt(text) ? 'active' : ''}`;
        
        const button = document.createElement('button');
        button.className = 'page-link';
        button.textContent = text;
        button.disabled = disabled;
        
        if (!disabled) {
            button.addEventListener('click', () => {
                this.state.currentPage = pageFn(this.state.currentPage);
                this.updateTable();
            });
        }
        
        li.appendChild(button);
        return li;
    }

    updateNewIncidents(newIncidents) {
        const tbody = this.elements.newIncidentsBody;
        tbody.innerHTML = '';
        
        // Ordenar por data (mais recentes primeiro)
        const sortedIncidents = [...newIncidents].sort((a, b) => 
            new Date(b.dh_inicio) - new Date(a.dh_inicio)
        ).slice(0, 10); // Mostrar apenas os 10 mais recentes
        
        sortedIncidents.forEach(incident => {
            const row = document.createElement('tr');
            
            const time = incident.dh_inicio ? 
                new Date(incident.dh_inicio).toLocaleTimeString('pt-BR') : 'N/A';
            
            row.innerHTML = `
                <td><small>${time}</small></td>
                <td><small>${incident.id}</small></td>
                <td>${incident.nm_cidade}</td>
                <td><code>${incident.topologia}</code></td>
                <td>${incident.nm_status}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    updateAlertTimeline(newIncidents) {
        if (newIncidents.length === 0) return;
        
        const timelineEl = this.elements.alertTimeline;
        
        // Adicionar novo alerta no topo
        newIncidents.forEach(incident => {
            const alertItem = document.createElement('div');
            alertItem.className = 'timeline-item new';
            
            const time = new Date().toLocaleTimeString('pt-BR');
            const cidade = incident.nm_cidade || 'N/A';
            
            alertItem.innerHTML = `
                <div class="timeline-time">${time}</div>
                <div class="timeline-text">
                    <strong>Novo incidente em ${cidade}</strong><br>
                    ${incident.topologia || ''} - ${incident.nm_status || ''}
                </div>
            `;
            
            timelineEl.insertBefore(alertItem, timelineEl.firstChild);
        });
        
        // Manter apenas os últimos 10 alertas
        while (timelineEl.children.length > 10) {
            timelineEl.removeChild(timelineEl.lastChild);
        }
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR');
        const dateString = now.toLocaleDateString('pt-BR');
        
        this.elements.lastUpdateTime.textContent = `${dateString} ${timeString}`;
    }

    updateConnectionStatus(connected) {
        const statusEl = this.elements.connectionStatus;
        
        if (connected) {
            statusEl.innerHTML = '<i class="fas fa-circle text-success me-1"></i> Conectado';
            statusEl.classList.remove('connection-error');
        } else {
            statusEl.innerHTML = '<i class="fas fa-circle text-danger me-1"></i> Desconectado';
            statusEl.classList.add('connection-error');
        }
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        
        if (this.state.autoRefresh) {
            const interval = this.state.settings.refreshInterval * 60000; // minutos para ms
            this.refreshInterval = setInterval(() => this.refreshData(), interval);
            console.log(`Auto-refresh iniciado: ${this.state.settings.refreshInterval} minutos`);
        }
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('incidentMonitorSettings');
        if (saved) {
            this.state.settings = JSON.parse(saved);
            
            // Aplicar configurações carregadas
            this.applyLoadedSettings();
        }
    }

    saveSettings() {
        // Atualizar configurações do estado
        this.state.settings = {
            apiUrl: this.elements.apiUrl.value,
            proxyUrl: this.elements.proxyUrl.value,
            refreshInterval: parseInt(this.elements.refreshInterval.value),
            excludedRegions: {
                states: [],
                cities: []
            }
        };

        // Configurar exclusões
        if (this.elements.excludeSP.checked) {
            this.state.settings.excludedRegions.states.push('SP');
            this.state.settings.excludedRegions.cities.push('SÃO PAULO');
        }

        if (this.elements.excludeSul.checked) {
            this.state.settings.excludedRegions.states.push('PR', 'SC', 'RS');
            this.state.settings.excludedRegions.cities.push('CURITIBA', 'PORTO ALEGRE', 'FLORIANÓPOLIS');
        }

        if (this.elements.excludeParana.checked) {
            if (!this.state.settings.excludedRegions.states.includes('PR')) {
                this.state.settings.excludedRegions.states.push('PR');
            }
            if (!this.state.settings.excludedRegions.cities.includes('CURITIBA')) {
                this.state.settings.excludedRegions.cities.push('CURITIBA');
            }
        }

        // Salvar no localStorage
        localStorage.setItem('incidentMonitorSettings', JSON.stringify(this.state.settings));

        // Aplicar configurações
        this.api.updateSettings(this.state.settings);

        // Configurar proxy externo se fornecido
        this.api.setExternalProxy(this.state.settings.proxyUrl);

        // Reiniciar auto-refresh com novo intervalo
        this.startAutoRefresh();

        // Mostrar mensagem de sucesso
        this.showSuccess('Configurações salvas com sucesso!');

        // Recarregar dados
        this.refreshData();
    }

    applyLoadedSettings() {
        // Aplicar configurações carregadas aos elementos
        this.elements.apiUrl.value = this.state.settings.apiUrl || '';
        this.elements.proxyUrl.value = this.state.settings.proxyUrl || '';
        this.elements.refreshInterval.value = this.state.settings.refreshInterval || 5;

        // Configurar checkboxes
        const excludedStates = this.state.settings.excludedRegions?.states || [];
        this.elements.excludeSP.checked = excludedStates.includes('SP');
        this.elements.excludeSul.checked = excludedStates.includes('PR') ||
                                           excludedStates.includes('SC') ||
                                           excludedStates.includes('RS');
        this.elements.excludeParana.checked = excludedStates.includes('PR');

        // Atualizar API
        this.api.updateSettings(this.state.settings);

        // Configurar proxy externo se fornecido
        if (this.state.settings.proxyUrl) {
            this.api.setExternalProxy(this.state.settings.proxyUrl);
        }
    }

    exportData() {
        const data = this.state.filteredData;
        
        if (data.length === 0) {
            this.showWarning('Não há dados para exportar.');
            return;
        }
        
        // Converter para CSV
        const headers = ['ID', 'Cidade', 'Regional', 'Topologia', 'Status', 'Início', 'Previsão', 'Tempo'];
        const csvRows = [];
        
        // Cabeçalho
        csvRows.push(headers.join(';'));
        
        // Dados
        data.forEach(incident => {
            const duration = this.api.calculateDuration(incident.dh_inicio);
            const row = [
                incident.id,
                incident.nm_cidade,
                incident.regional,
                incident.topologia,
                incident.nm_status,
                incident.dh_inicio,
                incident.dh_previsao,
                duration
            ].map(field => `"${field}"`);
            
            csvRows.push(row.join(';'));
        });
        
        const csvString = csvRows.join('\n');
        
        // Criar blob e link para download
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `incidentes_fibra_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    showDetails(incidentId) {
        const incident = this.state.currentData.find(item => item.id === incidentId);
        if (!incident) return;
        
        // Criar modal com detalhes
        const modalHtml = `
            <div class="modal fade" id="detailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-info-circle me-2"></i>Detalhes do Incidente
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Informações Básicas</h6>
                                    <table class="table table-sm">
                                        <tr><td><strong>ID:</strong></td><td>${incident.id}</td></tr>
                                        <tr><td><strong>Cidade:</strong></td><td>${incident.nm_cidade}</td></tr>
                                        <tr><td><strong>Regional:</strong></td><td>${incident.regional}</td></tr>
                                        <tr><td><strong>Topologia:</strong></td><td><code>${incident.topologia}</code></td></tr>
                                        <tr><td><strong>Status:</strong></td><td>${incident.nm_status}</td></tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <h6>Datas</h6>
                                    <table class="table table-sm">
                                        <tr><td><strong>Início:</strong></td><td>${new Date(incident.dh_inicio).toLocaleString('pt-BR')}</td></tr>
                                        <tr><td><strong>Previsão:</strong></td><td>${new Date(incident.dh_previsao).toLocaleString('pt-BR')}</td></tr>
                                        <tr><td><strong>Entrada:</strong></td><td>${new Date(incident.data_entrada).toLocaleString('pt-BR')}</td></tr>
                                        <tr><td><strong>Atualização:</strong></td><td>${new Date(incident.data_atualizacao).toLocaleString('pt-BR')}</td></tr>
                                    </table>
                                </div>
                            </div>
                            
                            <div class="row mt-3">
                                <div class="col-12">
                                    <h6>Descrição</h6>
                                    <div class="alert alert-info">
                                        ${incident.ds_sumario || 'Sem descrição detalhada.'}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row mt-3">
                                <div class="col-md-6">
                                    <h6>Classificação</h6>
                                    <table class="table table-sm">
                                        <tr><td><strong>Tipo:</strong></td><td>${incident.nm_tipo}</td></tr>
                                        <tr><td><strong>Categoria:</strong></td><td>${incident.nm_cat_prod2}</td></tr>
                                        <tr><td><strong>Equipe:</strong></td><td>${incident.equipe}</td></tr>
                                        <tr><td><strong>Grupo:</strong></td><td>${incident.nm_grupo_tratamento}</td></tr>
                                    </table>
                                </div>
                                <div class="col-md-6">
                                    <h6>Localização</h6>
                                    <table class="table table-sm">
                                        <tr><td><strong>Cluster:</strong></td><td>${incident.cluster}</td></tr>
                                        <tr><td><strong>Subcluster:</strong></td><td>${incident.subcluster}</td></tr>
                                        <tr><td><strong>Cidade SGO:</strong></td><td>${incident.cidade_sgo}</td></tr>
                                        <tr><td><strong>Operadora:</strong></td><td>${incident.cd_operadora}</td></tr>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Adicionar modal ao DOM
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer.firstChild);
        
        // Mostrar modal
        const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
        modal.show();
        
        // Remover modal do DOM após fechar
        document.getElementById('detailsModal').addEventListener('hidden.bs.modal', function () {
            this.remove();
        });
    }

    showLoading(show) {
        // Implementar indicador de carregamento se necessário
        if (show) {
            document.body.style.cursor = 'wait';
        } else {
            document.body.style.cursor = 'default';
        }
    }

    showError(message) {
        this.showAlert(message, 'danger');
    }

    showWarning(message) {
        this.showAlert(message, 'warning');
    }

    showSuccess(message) {
        this.showAlert(message, 'success');
    }

    showAlert(message, type = 'info') {
        // Remover alertas anteriores
        const existingAlerts = document.querySelectorAll('.alert-toast');
        existingAlerts.forEach(alert => alert.remove());
        
        // Criar novo alerta
        const alertHtml = `
            <div class="alert alert-${type} alert-dismissible fade show alert-toast position-fixed top-0 end-0 m-3" style="z-index: 9999;">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', alertHtml);
        
        // Remover automaticamente após 5 segundos
        setTimeout(() => {
            const alert = document.querySelector('.alert-toast');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
}

// Instância global da aplicação
const app = new IncidentMonitorApp();

// Função de inicialização global
function initApp() {
    app.init();
}
