# Proxy CORS para Railway

Este proxy permite que o Portal de Incidentes hospedado no GitHub Pages acesse a API interna.

## Passo a Passo para Deploy no Railway

### 1. Criar conta no Railway
- Acesse [railway.app](https://railway.app)
- Faça login com GitHub

### 2. Criar novo projeto
- Clique em **"New Project"**
- Selecione **"Deploy from GitHub repo"**
- Autorize o acesso ao seu repositório

### 3. Configurar o projeto
- Selecione o repositório `portal-incidentes-fibra`
- **IMPORTANTE**: Configure o Root Directory para `railway-proxy`
  - Vá em **Settings** > **Root Directory**
  - Digite: `railway-proxy`

### 4. Variáveis de ambiente (opcional)
Se precisar alterar a URL da API:
- Vá em **Variables**
- Adicione: `API_URL` = `http://10.29.5.216/scr/sgo_incidentes_abertos.php`

### 5. Obter a URL do deploy
Após o deploy, o Railway fornecerá uma URL como:
```
https://seu-projeto.up.railway.app
```

### 6. Configurar no Portal
1. Acesse seu portal no GitHub Pages
2. Vá em **Configurações**
3. No campo **"URL do Proxy Externo"**, coloque:
   ```
   https://seu-projeto.up.railway.app
   ```
4. Clique em **Salvar Configurações**

## Importante: Acesso à Rede Interna

⚠️ **O Railway é um servidor na nuvem e NÃO tem acesso à rede interna da empresa (10.29.5.216).**

Para funcionar, você precisará de UMA das seguintes opções:

### Opção A: Expor a API internamente
Pedir para o time de infraestrutura expor a API para acesso externo (com autenticação).

### Opção B: Usar um servidor interno
Hospedar este proxy em um servidor dentro da rede da empresa que tenha:
- PHP instalado
- Acesso à rede interna
- Acesso à internet (para receber requisições do GitHub Pages)

### Opção C: VPN no servidor
Configurar uma VPN no servidor que hospeda o proxy (mais complexo).

## Testar localmente

```bash
cd railway-proxy
php -S localhost:8000
# Acesse http://localhost:8000
```

## Estrutura de arquivos

```
railway-proxy/
├── index.php        # Proxy principal
├── nixpacks.toml    # Configuração do Railway
├── Procfile         # Alternativa de configuração
└── README.md        # Este arquivo
```
