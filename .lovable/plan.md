

## Plano: Script de instalacao VPS com preview de links limpos

### Problema atual
- A aplicacao roda no Lovable Cloud com Edge Functions do Supabase
- Preview de links so funciona via URL dedicada da edge function (URL "estranha")
- Nao existe script de deploy para VPS propria

### Arquitetura proposta para VPS

```text
Internet
   |
   v
Nginx (SSL via Certbot)
   |
   ├── /f/:slug (crawler) → API Node.js → HTML com OG tags
   ├── /f/:slug (humano)  → SPA React (arquivos estaticos)
   ├── /api/*              → API Node.js (substitui edge functions)
   └── /*                  → SPA React
```

### Componentes do install.sh

O script interativo pedira:
- **Email admin** + **senha admin** (cria usuario no banco)
- **Dominio** (ex: meusite.com.br) — usado como URL do dashboard, API e compartilhamento
- **Email SSL** (para Let's Encrypt/Certbot)

Tudo mais e automatico.

### O que o script faz

1. **Instala dependencias**: Node.js 20, PostgreSQL 16, Nginx, Certbot, PM2
2. **Configura PostgreSQL**: cria banco, usuario, executa todas as migrations SQL
3. **Cria API server** (Express/Node): substitui as 5 edge functions (share, preview-image, openai-proxy, typebot-proxy, rotate-preview-images) + auth via JWT proprio
4. **Builda o frontend** React com variaveis de ambiente apontando para o dominio
5. **Configura Nginx**:
   - SSL automatico com Certbot
   - Detecta crawler por User-Agent em `/f/:slug` e faz proxy para a API (retorna HTML com OG tags)
   - Para humanos, serve o SPA normalmente
   - Resultado: `dominio.com/f/meu-funil` mostra preview correto no WhatsApp E funciona como SPA
6. **Cria servico PM2** para a API rodar permanentemente
7. **Cria cron job** para rotacao de imagens de preview

### Preview limpo por slug

A grande mudanca: Nginx resolve o problema de preview social de forma nativa. Quando WhatsApp/Facebook acessa `dominio.com/f/slug`, o Nginx detecta o User-Agent do crawler e redireciona para a API que retorna HTML com OG tags. Para usuarios normais, serve o SPA. Sem URLs estranhas.

### Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `self-host/install.sh` | Script principal de instalacao |
| `self-host/api-server.js` | API Express que substitui edge functions |
| `self-host/nginx.conf.template` | Template do Nginx com deteccao de crawler |
| `self-host/ecosystem.config.js` | Config PM2 |
| `self-host/.env.template` | Template de variaveis de ambiente |
| `self-host/README.md` | Documentacao de uso |

### Limitacoes e decisoes

- PostgreSQL puro (sem Supabase self-hosted — muito pesado). Auth implementado com bcrypt + JWT direto
- O frontend precisara de um adapter simples para trocar chamadas `supabase.from(...)` por fetch para a API local, OU manter compatibilidade usando PostgREST (leve, so 1 binario)
- Opcao recomendada: usar **PostgREST** + **GoTrue** (componentes individuais do Supabase) para manter compatibilidade total com o codigo frontend existente sem precisar reescrever nada

### Abordagem final recomendada

Usar **PostgREST** + **GoTrue** (auth) como binarios standalone. Isso mantem o frontend identico (mesmo SDK Supabase funciona) e so precisamos:
- PostgreSQL + PostgREST + GoTrue + Nginx + API customizada para preview
- O `install.sh` instala e configura tudo automaticamente

