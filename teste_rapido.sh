#!/bin/bash
# Verificação rápida da demo v2 (1 comando, sem dependências).
# Sobe o servidor, testa o fluxo completo e desliga.
set -u
cd "$(dirname "$0")"
rm -f contatos.db
python3 app.py &>/tmp/demo_test.log &
PID=$!
sleep 2
echo "== home publica ==";  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/
echo "== home admin ==";    curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/admin
echo "== localidades ==";  curl -s "http://127.0.0.1:8000/api/localidades"; echo
echo "== drill Vitória =="; curl -s "http://127.0.0.1:8000/api/contatos?localidade_id=1" | head -c 150; echo
echo "== login ==";         TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/login -H 'Content-Type: application/json' -d '{"usuario":"admin","senha":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"); echo "token:${TOKEN:0:8}..."
echo "== me ==";            curl -s "http://127.0.0.1:8000/api/me" -H "X-Admin-Token: $TOKEN"; echo
echo "== criar ==";         CID=$(curl -s -X POST http://127.0.0.1:8000/api/contatos -H 'Content-Type: application/json' -H "X-Admin-Token: $TOKEN" -d '{"setor_id":1,"nome":"Teste QA","telefone":"(27) 3333-0099"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"); echo "id:$CID"
echo "== pedido ==";        curl -s -X POST http://127.0.0.1:8000/api/pedidos -H 'Content-Type: application/json' -d '{"nome":"Novo User","usuario":"novouser"}'; echo
echo "== aprovar ==";       curl -s -X POST http://127.0.0.1:8000/api/pedidos/1/aprovar -H "X-Admin-Token: $TOKEN"; echo
echo "== historico ==";     curl -s "http://127.0.0.1:8000/api/historico" -H "X-Admin-Token: $TOKEN" | head -c 150; echo
echo "== remover ==";       curl -s -X DELETE http://127.0.0.1:8000/api/contatos/$CID -H "X-Admin-Token: $TOKEN"; echo
kill $PID 2>/dev/null
rm -f contatos.db /tmp/demo_test.log
echo "OK"
