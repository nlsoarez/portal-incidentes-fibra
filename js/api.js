class IncidentAPI {
    constructor() {
        // URL original da API (para referência)
        this.originalApiUrl = 'http://10.29.5.216/scr/sgo_incidentes_abertos.php';

        // Usar proxy local para evitar problemas de CORS
        // O proxy.php deve estar no mesmo servidor que serve esta página
        this.proxyUrl = this.getProxyUrl();

        this.lastFetch = null;
        this.cacheDuration = 300000; // 5 minutos
        this.cachedData = null;

        // Regiões para excluir
        this.excludedRegions = {
            states: ['SP', 'PR', 'SC', 'RS'],
            cities: ['SÃO PAULO', 'CURITIBA', 'PORTO ALEGRE', 'FLORIANÓPOLIS']
        };
    }

    // Determina a URL do proxy baseado no ambiente
    getProxyUrl() {
        // Se estiver rodando localmente (file://), usar URL absoluta
        if (window.location.protocol === 'file:') {
            console.warn('Executando via file:// - o proxy PHP não funcionará. Use um servidor web.');
            return null;
        }

        // Construir URL do proxy relativa ao documento atual
        const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '');
        return `${baseUrl}/proxy.php`;
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

            // Verificar se o proxy está disponível
            if (!this.proxyUrl) {
                console.warn('Proxy não disponível, usando dados de exemplo');
                return await this.getSampleData();
            }

            console.log('Fazendo requisição para:', this.proxyUrl);

            // Fazer requisição para o proxy local (evita problemas de CORS)
            const response = await fetch(this.proxyUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
            }

            const responseData = await response.json();

            // O proxy retorna { success, data, proxy_info }
            // Precisamos extrair o array de dados
            let data;
            if (responseData.success && responseData.data) {
                // Resposta do proxy com estrutura wrapper
                data = Array.isArray(responseData.data) ? responseData.data : [responseData.data];
                console.log('Dados recebidos via proxy:', data.length, 'incidentes');
            } else if (responseData.error) {
                // Erro retornado pelo proxy
                throw new Error(responseData.message || 'Erro desconhecido do proxy');
            } else if (Array.isArray(responseData)) {
                // Resposta direta (caso a API seja acessada diretamente)
                data = responseData;
            } else {
                // Tentar usar a resposta diretamente se for um objeto com dados
                data = responseData.data || responseData;
                if (!Array.isArray(data)) {
                    data = [data];
                }
            }

            // Cache dos dados
            this.cachedData = data;
            this.lastFetch = Date.now();

            console.log(`Dados processados: ${data.length} incidentes`);
            return data;

        } catch (error) {
            console.error('Erro ao buscar dados:', error);

            // Tentar usar dados de exemplo se a API falhar
            return await this.getSampleData();
        }
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
