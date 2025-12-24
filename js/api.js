class IncidentAPI {
    constructor() {
        // URL original da API
        this.originalApiUrl = 'http://10.29.5.216/scr/sgo_incidentes_abertos.php';

        // Configuração do ambiente
        this.environment = this.detectEnvironment();

        // URL do proxy (pode ser configurado externamente)
        this.externalProxyUrl = localStorage.getItem('externalProxyUrl') || null;

        this.lastFetch = null;
        this.cacheDuration = 300000; // 5 minutos
        this.cachedData = null;

        // Regiões para excluir
        this.excludedRegions = {
            states: ['SP', 'PR', 'SC', 'RS'],
            cities: ['SÃO PAULO', 'CURITIBA', 'PORTO ALEGRE', 'FLORIANÓPOLIS']
        };

        // Log do ambiente detectado
        console.log('Ambiente detectado:', this.environment);
    }

    // Detecta o ambiente de execução
    detectEnvironment() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;

        if (protocol === 'file:') {
            return { type: 'file', supportsProxy: false };
        }

        if (hostname.includes('github.io') || hostname.includes('netlify') || hostname.includes('vercel')) {
            return { type: 'static-hosting', supportsProxy: false, host: hostname };
        }

        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.match(/^10\./) || hostname.match(/^192\.168\./)) {
            return { type: 'local-server', supportsProxy: true };
        }

        return { type: 'unknown', supportsProxy: true };
    }

    // Determina a melhor URL para buscar dados
    getApiUrl() {
        // Se tem proxy externo configurado, usar ele
        if (this.externalProxyUrl) {
            console.log('Usando proxy externo configurado:', this.externalProxyUrl);
            return this.externalProxyUrl;
        }

        // Se o ambiente suporta proxy PHP local
        if (this.environment.supportsProxy) {
            const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
            return `${baseUrl}/proxy.php`;
        }

        // Ambiente estático (GitHub Pages, etc) - tentar API direta
        console.warn('Ambiente de hospedagem estática detectado. O proxy PHP não funciona aqui.');
        return this.originalApiUrl;
    }

    async fetchData() {
        try {
            console.log('Buscando dados da API...');

            // Verificar cache
            if (this.cachedData && this.lastFetch &&
                (Date.now() - this.lastFetch) < this.cacheDuration) {
                console.log('Usando dados em cache');
                return this.cachedData;
            }

            const apiUrl = this.getApiUrl();
            console.log('Fazendo requisição para:', apiUrl);

            // Tentar buscar dados
            let data = null;
            let lastError = null;

            // Tentativa 1: URL configurada (proxy ou direta)
            try {
                data = await this.tryFetch(apiUrl);
            } catch (error) {
                console.warn('Falha na tentativa principal:', error.message);
                lastError = error;
            }

            // Se falhou e estamos em hospedagem estática, mostrar erro específico
            if (!data && !this.environment.supportsProxy && !this.externalProxyUrl) {
                throw new Error(
                    'STATIC_HOSTING: Este site está hospedado no GitHub Pages que não suporta PHP. ' +
                    'Configure um proxy externo nas configurações ou hospede em um servidor com PHP.'
                );
            }

            // Se ainda não temos dados, usar dados de exemplo
            if (!data) {
                console.warn('Usando dados de exemplo devido a falha na API');
                return await this.getSampleData();
            }

            // Cache dos dados
            this.cachedData = data;
            this.lastFetch = Date.now();

            console.log(`Dados processados: ${data.length} incidentes`);
            return data;

        } catch (error) {
            console.error('Erro ao buscar dados:', error);

            // Propagar erro específico de hospedagem estática
            if (error.message.includes('STATIC_HOSTING')) {
                throw error;
            }

            // Tentar usar dados de exemplo se a API falhar
            return await this.getSampleData();
        }
    }

    async tryFetch(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
        }

        // Verificar se a resposta é JSON ou PHP (texto)
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        // Se começa com <?php, o servidor não está executando PHP
        if (text.trim().startsWith('<?php') || text.trim().startsWith('<?')) {
            throw new Error('O servidor retornou código PHP ao invés de JSON. O PHP não está sendo executado.');
        }

        // Tentar parsear como JSON
        let responseData;
        try {
            responseData = JSON.parse(text);
        } catch (e) {
            throw new Error('Resposta inválida: não é JSON válido');
        }

        // Processar resposta do proxy ou direta
        let data;
        if (responseData.success && responseData.data) {
            // Resposta do proxy com estrutura wrapper
            data = Array.isArray(responseData.data) ? responseData.data : [responseData.data];
            console.log('Dados recebidos via proxy:', data.length, 'incidentes');
        } else if (responseData.error) {
            // Erro retornado pelo proxy
            throw new Error(responseData.message || 'Erro desconhecido do proxy');
        } else if (Array.isArray(responseData)) {
            // Resposta direta da API
            data = responseData;
        } else {
            // Tentar usar a resposta diretamente
            data = responseData.data || responseData;
            if (!Array.isArray(data)) {
                data = [data];
            }
        }

        return data;
    }

    // Configurar proxy externo
    setExternalProxy(url) {
        if (url && url.trim()) {
            this.externalProxyUrl = url.trim();
            localStorage.setItem('externalProxyUrl', this.externalProxyUrl);
            console.log('Proxy externo configurado:', this.externalProxyUrl);
        } else {
            this.externalProxyUrl = null;
            localStorage.removeItem('externalProxyUrl');
            console.log('Proxy externo removido');
        }
        // Limpar cache para forçar nova requisição
        this.cachedData = null;
        this.lastFetch = null;
    }

    // Filtra apenas incidentes de FIBRA e exclui regiões
    filterFiberIncidents(incidents) {
        if (!incidents || !Array.isArray(incidents)) return [];
        
        return incidents.filter(incident => {
            // 1. Verificar se é FIBRA
            const isFiber = (
                incident.nm_cat_prod2 === 'REDE OPTICA' ||
                incident.equipe === 'FIBRA' ||
                incident.tp_topologia === 'GPON' ||
                incident.nm_grupo_tratamento === 'COP REDE FO'
            );
            
            if (!isFiber) return false;
            
            // 2. Excluir regiões baseado na cidade
            const cidade = incident.nm_cidade?.toUpperCase() || '';
            const estado = this.getStateFromCity(cidade);
            
            // Excluir estados não desejados
            if (this.excludedRegions.states.includes(estado)) {
                return false;
            }
            
            // Excluir cidades específicas
            if (this.excludedRegions.cities.some(city => cidade.includes(city))) {
                return false;
            }
            
            return true;
        });
    }

    // Método auxiliar para obter estado da cidade (simplificado)
    getStateFromCity(cidade) {
        // Mapeamento simplificado - pode ser expandido
        const cityStateMap = {
            'RIO DE JANEIRO': 'RJ',
            'NITEROI': 'RJ',
            'SAO GONCALO': 'RJ',
            'BELFORD ROXO': 'RJ',
            'SAO JOAO DE MERITI': 'RJ',
            'NOVA IGUACU': 'RJ',
            'MESQUITA': 'RJ',
            'RIO DAS OSTRAS': 'RJ',
            // Adicionar mais cidades conforme necessário
        };
        
        return cityStateMap[cidade] || 'RJ'; // Default para RJ
    }

    // Agrupar dados para gráficos
    groupByRegional(incidents) {
        const groups = {};
        
        incidents.forEach(incident => {
            const regional = incident.regional || 'Não Informado';
            if (!groups[regional]) {
                groups[regional] = 0;
            }
            groups[regional]++;
        });
        
        return groups;
    }

    groupByStatus(incidents) {
        const groups = {
            'PENDENTE': 0,
            'EM PROGRESSO': 0,
            'RESOLVIDO': 0
        };
        
        incidents.forEach(incident => {
            const status = incident.nm_status || 'PENDENTE';
            if (groups[status] !== undefined) {
                groups[status]++;
            } else {
                groups[status] = 1;
            }
        });
        
        return groups;
    }

    // Calcular tempo desde o início
    calculateDuration(startTime) {
        if (!startTime) return 'N/A';
        
        const start = new Date(startTime);
        const now = new Date();
        const diffMs = now - start;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 24) {
            return `${diffHours}h`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}d ${diffHours % 24}h`;
        }
    }

    // Obter dados de exemplo para desenvolvimento
    async getSampleData() {
        // Dados de exemplo para quando a API não está disponível
        return [
            {
                id: 'INM00000192333',
                nm_cidade: 'RIO DE JANEIRO',
                regional: 'LESTE',
                topologia: 'PLUA',
                nm_status: 'PENDENTE',
                dh_inicio: '2023-03-14 11:57:00',
                dh_previsao: '2026-02-27 20:00:00',
                nm_cat_prod2: 'REDE OPTICA',
                equipe: 'FIBRA',
                data_entrada: '2025-12-23 22:19:26'
            },
            // Adicionar mais dados de exemplo conforme necessário
        ];
    }

    // Atualizar configurações
    updateSettings(settings) {
        if (settings.apiUrl) {
            this.originalApiUrl = settings.apiUrl;
        }

        if (settings.excludedRegions) {
            this.excludedRegions = settings.excludedRegions;
        }

        // Limpar cache ao atualizar configurações
        this.cachedData = null;
        this.lastFetch = null;
    }

    // Verificar novos incidentes
    findNewIncidents(currentData, previousData) {
        if (!previousData || previousData.length === 0) return currentData;
        
        const previousIds = previousData.map(item => item.id);
        return currentData.filter(item => !previousIds.includes(item.id));
    }
}
