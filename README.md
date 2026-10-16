# Diretório de Contatos — demo para portfólio

> Projeto genérico criado do zero para demonstração. Inspirado em experiência
> prévia com diretório institucional (consulta pública + área administrativa
> com login, permissões por local, solicitações de acesso, registro de
> alterações e navegação em camadas com mapa).
> **Nenhum dado real ou interno é usado aqui** — todos os contatos são
> fictícios (Empresa Exemplo).

## O que faz
- **Consulta pública** (`/`): busca global + navegação em camadas
  Localidade → Unidade → Setor → contatos (com breadcrumb) + **mapa clicável**
  (Leaflet + GeoJSON público do IBGE) que filtra por município, lado a lado
  com a consulta; botão **Solicitar acesso** abre modal com formulário
  (nome, e-mail, usuário, local, motivo)
- **Área administrativa** (`/admin`): mesma consulta com mapa; sem cadastro, a
  visão é igual à pública; botões de estado na base da sidebar:
  sem cadastro → "Solicitar acesso"; com cadastro → "Acesso administrativo"
  (entra direto pelo token salvo ou modal de login); logado →
  "Sair do acesso administrativo" (volta à visão pública)
- **Gestão dentro da consulta, com escopo por local**: o usuário cria/remove
  contatos só nos locais liberados para ele (fora deles, só consulta);
  pode pedir acesso a mais locais; admin aprova e o escopo amplia
- **Solicitações de acesso** (só interno): lista pedidos com local pedido;
  aprovar cria o usuário (senha inicial) já com o escopo concedido
- **Registro de alterações**: criar / remover / pedidos / aprovações

## Stack
- Backend: Python 3, somente biblioteca padrão (`http.server` + `sqlite3`) — zero dependências
- Frontend: HTML + CSS + JS puro (sem framework); mapa com Leaflet via CDN
- Banco: SQLite local (`contatos.db`, criado na primeira execução, 12 registros fictícios)

## Como rodar
```bash
python3 app.py
# pública: http://localhost:8000
# admin:   http://localhost:8000/admin   (demo: admin / admin123)
bash teste_rapido.sh   # verifica o fluxo completo, incl. escopo por local
```

## Endpoints
| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/localidades` | não | localidades + total de contatos |
| GET | `/api/unidades?localidade_id=` | não | unidades da localidade |
| GET | `/api/setores?unidade_id=` | não | setores da unidade |
| GET | `/api/contatos?q=&setor_id=&unidade_id=&localidade_id=` | não | lista/busca com escopo |
| GET | `/api/me` | `X-Admin-Token` | usuário + flag admin + escopo |
| GET | `/api/historico` | `X-Admin-Token` | últimas 50 alterações |
| POST | `/api/login` | não | `{usuario, senha}` → `{token}` |
| POST | `/api/contatos` | `X-Admin-Token` | cria (só no seu escopo) |
| DELETE | `/api/contatos/<id>` | `X-Admin-Token` | remove (só no seu escopo) |
| POST | `/api/pedidos` | não | solicita acesso (com local) |
| GET | `/api/pedidos` | `X-Admin-Token` | pendentes (com local pedido) |
| POST | `/api/pedidos/<id>/aprovar` | `X-Admin-Token` | aprova, cria usuário e concede escopo |

## Versão completa (Google Apps Script)
Mesmo domínio, implementação corporativa completa (auth, papéis, hierarquia,
auditoria): [EnzoMoulin/diretorio-contatos](https://github.com/EnzoMoulin/diretorio-contatos).

## Screenshots
_Vídeo/screenshots entram aqui após primeira execução (só tela + legendas, sem voz/webcam)._
- `screenshots/` — reservado

## Estrutura
```
app.py                 backend + API (stdlib, com escopo por local)
frontend/public.html   consulta pública (busca + camadas + mapa + modal)
frontend/public.js     lógica da consulta pública
frontend/admin.html    área administrativa (consulta + modais)
frontend/admin.js      estados de acesso + gestão por escopo + solicitações + registro
frontend/mapa.js       mapa Leaflet compartilhado (densidade + clique filtra)
frontend/style.css     tema (identidade do app original)
```

## Licença
MIT — Enzo Moulin.
