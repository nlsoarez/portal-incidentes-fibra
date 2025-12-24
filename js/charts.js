class ChartManager {
    constructor() {
        this.charts = {};
        this.colors = {
            primary: '#3498db',
            secondary: '#2ecc71',
            warning: '#f39c12',
            danger: '#e74c3c',
            info: '#9b59b6'
        };
    }

    initRegionalChart(canvasId, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        // Destruir gráfico anterior se existir
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }
        
        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Incidentes por Regional',
                    data: values,
                    backgroundColor: this.generateColors(values.length, 0.7),
                    borderColor: this.generateColors(values.length, 1),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    initStatusChart(canvasId, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        const labels = Object.keys(data);
        const values = Object.values(data);
        
        const backgroundColors = labels.map(label => {
            switch(label) {
                case 'PENDENTE': return this.colors.danger;
                case 'EM PROGRESSO': return this.colors.warning;
                default: return this.colors.secondary;
            }
        });
        
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }
        
        this.charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: backgroundColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    initTrendChart(canvasId, data) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        // Exemplo de dados de tendência
        const labels = Array.from({length: 30}, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            return date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
        });
        
        // Gerar dados aleatórios para exemplo
        const values = labels.map(() => Math.floor(Math.random() * 10) + 1);
        
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }
        
        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Incidentes por Dia',
                    data: values,
                    borderColor: this.colors.primary,
                    backgroundColor: this.hexToRgba(this.colors.primary, 0.1),
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 2
                        }
                    }
                }
            }
        });
    }

    generateColors(count, alpha = 1) {
        const colors = [];
        const hueStep = 360 / count;
        
        for (let i = 0; i < count; i++) {
            const hue = i * hueStep;
            colors.push(`hsla(${hue}, 70%, 60%, ${alpha})`);
        }
        
        return colors;
    }

    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    destroyAll() {
        Object.values(this.charts).forEach(chart => chart.destroy());
        this.charts = {};
    }
}
