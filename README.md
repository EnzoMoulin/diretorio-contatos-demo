# Diretório de Contatos — demo para portfólio

> Projeto genérico criado do zero para demonstração. Inspirado em experiência
> prévia com diretório institucional (consulta pública + área administrativa
> com login + histórico + solicitação de acesso + navegação em camadas).
> **Nenhum dado real ou interno é usado aqui** — todos os contatos são
> fictícios (Empresa Exemplo).

## O que faz
- **Consulta pública** (`/`): busca global + navegação em camadas
  Localidade → Unidade → Setor → contatos (com breadcrumb) + **mapa clicável**
  (Leaflet + GeoJSON público do IBGE) que filtra por município
- **Área administrativa** (`/admin`): mesma consulta + login demo
  (`admin` / `admin123`, com auto-login via token salvo); sem login, só consulta
- Gestão: criar e remover contatos (com token), selects encadeados
- **Solicitação de acesso**: formulário público → pedido pendente → admin aprova
  e o novo usuário entra com senha inicial
- Histórico de alterações (criar / remover / pedidos / aprovações)

## Stack
- Backend: Python 3, somente biblioteca padrão (`http.server` + `sqlite3`) — zero dependências
- Frontend: HTML + CSS + JS puro (sem framework); mapa com Leaflet via CDN
- Banco: SQLite local (`contatos.db`, criado na primeira execução, 12 registros fictícios)

## Como rodar
```bash
python3 app.py
# pública: http://localhost:8000
# admin:   http://localhost:8000/admin
bash teste_rapido.sh   # verifica o fluxo completo
```

## Endpoints
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/localidades` | não | localidades + total de contatos |
| GET | `/api/unidades?localidade_id=` | não | unidades da localidade |
| GET | `/api/setores?unidade_id=` | não | setores da unidade |
| GET | `/api/contatos?q=&setor_id=&unidade_id=&localidade_id=` | não | lista/busca com escopo |
| GET | `/api/me` | `X-Admin-Token` | usuário do token |
| GET | `/api/historico` | `X-Admin-Token` | últimas 50 alterações |
| POST | `/api/login` | não | `{usuario, senha}` → `{token}` |
| POST | `/api/contatos` | `X-Admin-Token` | cria |
| DELETE | `/api/contatos/<id>` | `X-Admin-Token` | remove |
| POST | `/api/pedidos` | não | solicita acesso |
| GET | `/api/pedidos` | `X-Admin-Token` | pendentes |
| POST | `/api/pedidos/<id>/aprovar` | `X-Admin-Token` | aprova e cria usuário |

## Versão completa (Google Apps Script)
Mesmo domínio, implementação corporativa completa (auth, papéis, hierarquia,
auditoria): [EnzoMoulin/diretorio-contatos](https://github.com/EnzoMoulin/diretorio-contatos).

## Screenshots
_Vídeo/screenshots entram aqui após primeira execução (só tela + legendas, sem voz/webcam)._
- `screenshots/` — reservado

## Estrutura
```
app.py                 backend + API (stdlib)
frontend/public.html   consulta pública (busca + camadas + mapa + pedido)
frontend/public.js     lógica da consulta
frontend/admin.html    área administrativa
frontend/admin.js      login + gestão + pedidos + histórico
frontend/style.css     tema (identidade do app original)
```

## Licença
MIT — Enzo Moulin.
