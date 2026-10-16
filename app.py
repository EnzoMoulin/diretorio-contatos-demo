"""Diretório de contatos — demo para portfólio (stdlib Python, sem dependências).

Inspirado em experiência prévia com diretório institucional de contatos:
consulta pública + área administrativa com login + histórico de alterações
+ solicitação de acesso + navegação em camadas (localidade > unidade > setor).
Todo o código e os dados aqui são fictícios e genéricos, criados do zero
para demonstração. Nenhum dado real ou interno é utilizado.

Como rodar:
    python3 app.py
    -> pública: http://localhost:8000
    -> admin:   http://localhost:8000/admin  (demo: admin / admin123)

Endpoints (JSON):
    GET  /api/localidades                 localidades + total de contatos
    GET  /api/unidades?localidade_id=N
    GET  /api/setores?unidade_id=N
    GET  /api/contatos?q=&setor_id=&unidade_id=&localidade_id=
    GET  /api/historico                   requer token
    GET  /api/me                          requer token -> {usuario}
    POST /api/login                       {usuario, senha} -> {token}
    POST /api/contatos                    cria (token)
    DELETE /api/contatos/<id>             remove (token)
    POST /api/pedidos                     {nome,email,usuario,motivo} (público)
    GET  /api/pedidos                     pendentes (token)
    POST /api/pedidos/<id>/aprovar        cria usuário (token)
"""

import hashlib
import json
import secrets
import sqlite3
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(__file__).parent
DB = BASE / "contatos.db"
FRONT = BASE / "frontend"

SESSIONS = {}  # token -> usuario_id (memória; demo)

SCHEMA = """
CREATE TABLE IF NOT EXISTS localidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS unidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    localidade_id INTEGER NOT NULL REFERENCES localidades(id),
    nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS setores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unidade_id INTEGER NOT NULL REFERENCES unidades(id),
    nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setor_id INTEGER NOT NULL REFERENCES setores(id),
    nome TEXT NOT NULL, cargo TEXT NOT NULL DEFAULT '',
    telefone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, acao TEXT NOT NULL,
    contato_id INTEGER, detalhe TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL UNIQUE,
    senha_sha256 TEXT NOT NULL, aprovado INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL,
    email TEXT NOT NULL, usuario_desejado TEXT NOT NULL,
    motivo TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL DEFAULT (datetime('now')));
"""

# (localidade, unidade, setor, nome, cargo, telefone, email) — tudo fictício
SEED = [
    ("Vitória", "Unidade Centro", "Atendimento", "Ana Souza", "Atendente",
     "(27) 3333-0001", "atendimento@empresa-exemplo.com.br"),
    ("Vitória", "Unidade Centro", "Atendimento", "Paulo Reis", "Atendente",
     "(27) 3333-0007", "paulo.reis@empresa-exemplo.com.br"),
    ("Vitória", "Unidade Centro", "Suporte", "Bruno Lima", "Técnico de suporte",
     "(27) 3333-0002", "suporte@empresa-exemplo.com.br"),
    ("Vitória", "Unidade Jardim", "Financeiro", "Carla Dias", "Analista financeira",
     "(27) 3333-0003", "financeiro@empresa-exemplo.com.br"),
    ("Vitória", "Unidade Jardim", "RH", "Diego Rocha", "Analista de RH",
     "(27) 3333-0004", "rh@empresa-exemplo.com.br"),
    ("Vila Velha", "Unidade Praia", "Atendimento", "Elisa Prado", "Atendente",
     "(27) 3333-0005", "elisaprado@empresa-exemplo.com.br"),
    ("Vila Velha", "Unidade Praia", "TI", "Fabio Nunes", "Desenvolvedor",
     "(27) 3333-0006", "ti@empresa-exemplo.com.br"),
    ("Vila Velha", "Unidade Centro", "Suporte", "Gabi Moura", "Técnica de suporte",
     "(27) 3333-0008", "gabi.moura@empresa-exemplo.com.br"),
    ("Serra", "Unidade Laranjeiras", "Atendimento", "Hugo Alves", "Atendente",
     "(27) 3333-0009", "hugo.alves@empresa-exemplo.com.br"),
    ("Serra", "Unidade Laranjeiras", "Logística", "Inês Castro", "Coordenadora",
     "(27) 3333-0010", "logistica@empresa-exemplo.com.br"),
    ("Cariacica", "Unidade Centro", "Atendimento", "João Pinto", "Atendente",
     "(27) 3333-0011", "joao.pinto@empresa-exemplo.com.br"),
    ("Cariacica", "Unidade Centro", "TI", "Karla Mendes", "Analista de sistemas",
     "(27) 3333-0012", "karla.mendes@empresa-exemplo.com.br"),
]

SENHA_INICIAL = "bemvindo123"


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def get_db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    con = get_db()
    con.executescript(SCHEMA)
    n = con.execute("SELECT COUNT(*) AS c FROM contatos").fetchone()["c"]
    if n == 0:
        locs, uns, sets = {}, {}, {}
        for loc, und, set_, nome, cargo, tel, mail in SEED:
            if loc not in locs:
                locs[loc] = con.execute(
                    "INSERT INTO localidades (nome) VALUES (?)", (loc,)).lastrowid
            key_u = (loc, und)
            if key_u not in uns:
                uns[key_u] = con.execute(
                    "INSERT INTO unidades (localidade_id, nome) VALUES (?,?)",
                    (locs[loc], und)).lastrowid
            key_s = (loc, und, set_)
            if key_s not in sets:
                sets[key_s] = con.execute(
                    "INSERT INTO setores (unidade_id, nome) VALUES (?,?)",
                    (uns[key_u], set_)).lastrowid
            con.execute(
                "INSERT INTO contatos (setor_id, nome, cargo, telefone, email)"
                " VALUES (?,?,?,?,?)", (sets[key_s], nome, cargo, tel, mail))
        con.execute(
            "INSERT INTO usuarios (usuario, senha_sha256, aprovado)"
            " VALUES (?,?,1) ON CONFLICT(usuario) DO NOTHING",
            ("admin", sha("admin123")))
        con.execute(
            "INSERT INTO historico (acao, detalhe) VALUES (?,?)",
            ("init", "base de demonstração criada com dados fictícios"))
    con.commit()
    con.close()


def log(con, acao, contato_id=None, detalhe=""):
    con.execute(
        "INSERT INTO historico (acao, contato_id, detalhe) VALUES (?,?,?)",
        (acao, contato_id, detalhe))


class Handler(BaseHTTPRequestHandler):
    server_version = "ContatosDemo/2.0"

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _static(self, name, ctype):
        p = FRONT / name
        if not p.exists() or ".." in name:
            self.send_error(404)
            return
        body = p.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        ln = int(self.headers.get("Content-Length") or 0)
        if ln == 0:
            return {}
        try:
            return json.loads(self.rfile.read(ln).decode("utf-8"))
        except Exception:
            return {}

    def _uid(self):
        tok = self.headers.get("X-Admin-Token") or ""
        return SESSIONS.get(tok)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        arg = lambda k: (q.get(k) or [""])[0].strip()
        if u.path in ("/", "/public.html"):
            return self._static("public.html", "text/html; charset=utf-8")
        if u.path == "/admin":
            return self._static("admin.html", "text/html; charset=utf-8")
        if u.path in ("/public.js", "/admin.js"):
            return self._static(u.path[1:], "application/javascript; charset=utf-8")
        if u.path == "/style.css":
            return self._static("style.css", "text/css; charset=utf-8")
        con = get_db()
        try:
            if u.path == "/api/localidades":
                rows = con.execute(
                    "SELECT l.id, l.nome, COUNT(c.id) AS total FROM localidades l"
                    " LEFT JOIN unidades u ON u.localidade_id=l.id"
                    " LEFT JOIN setores s ON s.unidade_id=u.id"
                    " LEFT JOIN contatos c ON c.setor_id=s.id"
                    " GROUP BY l.id ORDER BY l.nome").fetchall()
                return self._json([dict(r) for r in rows])
            if u.path == "/api/unidades":
                rows = con.execute(
                    "SELECT * FROM unidades WHERE localidade_id=? ORDER BY nome",
                    (arg("localidade_id"),)).fetchall()
                return self._json([dict(r) for r in rows])
            if u.path == "/api/setores":
                rows = con.execute(
                    "SELECT * FROM setores WHERE unidade_id=? ORDER BY nome",
                    (arg("unidade_id"),)).fetchall()
                return self._json([dict(r) for r in rows])
            if u.path == "/api/contatos":
                sql = ("SELECT c.*, s.nome AS setor, u.nome AS unidade,"
                       " u.id AS unidade_id, l.nome AS localidade, l.id AS localidade_id"
                       " FROM contatos c JOIN setores s ON s.id=c.setor_id"
                       " JOIN unidades u ON u.id=s.unidade_id"
                       " JOIN localidades l ON l.id=u.localidade_id WHERE 1=1")
                params = []
                for key, col in (("setor_id", "c.setor_id"),
                                 ("unidade_id", "u.id"),
                                 ("localidade_id", "l.id")):
                    if arg(key):
                        sql += f" AND {col}=?"
                        params.append(arg(key))
                if arg("q"):
                    like = f"%{arg('q')}%"
                    sql += (" AND (c.nome LIKE ? OR c.cargo LIKE ? OR c.telefone LIKE ?"
                            " OR c.email LIKE ? OR s.nome LIKE ? OR u.nome LIKE ?)")
                    params += [like] * 6
                sql += " ORDER BY c.nome"
                rows = con.execute(sql, params).fetchall()
                return self._json([dict(r) for r in rows])
            if u.path == "/api/historico":
                if not self._uid():
                    return self._json({"erro": "não autenticado"}, 403)
                rows = con.execute(
                    "SELECT * FROM historico ORDER BY id DESC LIMIT 50").fetchall()
                return self._json([dict(r) for r in rows])
            if u.path == "/api/me":
                uid = self._uid()
                if not uid:
                    return self._json({"erro": "não autenticado"}, 403)
                row = con.execute(
                    "SELECT id, usuario FROM usuarios WHERE id=?", (uid,)).fetchone()
                return self._json(dict(row))
            if u.path == "/api/pedidos":
                if not self._uid():
                    return self._json({"erro": "não autenticado"}, 403)
                rows = con.execute(
                    "SELECT * FROM pedidos WHERE status='pendente'"
                    " ORDER BY id DESC").fetchall()
                return self._json([dict(r) for r in rows])
        finally:
            con.close()
        return self.send_error(404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/login":
            data = self._body()
            con = get_db()
            row = con.execute(
                "SELECT * FROM usuarios WHERE usuario=? AND senha_sha256=?",
                (data.get("usuario"), sha(data.get("senha") or ""))).fetchone()
            con.close()
            if row and row["aprovado"]:
                tok = secrets.token_hex(16)
                SESSIONS[tok] = row["id"]
                return self._json({"token": tok})
            return self._json({"erro": "credenciais inválidas ou acesso não aprovado"}, 401)
        if u.path == "/api/pedidos":
            data = self._body()
            if not data.get("nome") or not data.get("usuario"):
                return self._json({"erro": "nome e usuário desejado são obrigatórios"}, 400)
            con = get_db()
            cur = con.execute(
                "INSERT INTO pedidos (nome, email, usuario_desejado, motivo)"
                " VALUES (?,?,?,?)",
                (data.get("nome"), data.get("email", ""),
                 data.get("usuario"), data.get("motivo", "")))
            log(con, "pedido", None,
                f"solicitação de acesso: {data.get('nome')} ({data.get('usuario')})")
            con.commit()
            con.close()
            return self._json({"ok": True, "id": cur.lastrowid}, 201)
        parts = u.path.rstrip("/").split("/")
        if len(parts) == 5 and parts[1] == "api" and parts[2] == "pedidos" \
                and parts[4] == "aprovar":
            if not self._uid():
                return self._json({"erro": "não autenticado"}, 403)
            try:
                pid = int(parts[3])
            except ValueError:
                return self._json({"erro": "id inválido"}, 400)
            con = get_db()
            ped = con.execute(
                "SELECT * FROM pedidos WHERE id=?", (pid,)).fetchone()
            if not ped or ped["status"] != "pendente":
                con.close()
                return self._json({"erro": "pedido não encontrado"}, 404)
            con.execute(
                "INSERT INTO usuarios (usuario, senha_sha256, aprovado)"
                " VALUES (?,?,1) ON CONFLICT(usuario) DO UPDATE SET aprovado=1",
                (ped["usuario_desejado"], sha(SENHA_INICIAL)))
            con.execute("UPDATE pedidos SET status='aprovado' WHERE id=?", (pid,))
            log(con, "aprovar", None, f"acesso aprovado: {ped['usuario_desejado']}")
            con.commit()
            con.close()
            return self._json({"ok": True, "usuario": ped["usuario_desejado"],
                               "senha_inicial": SENHA_INICIAL})
        if u.path == "/api/contatos":
            if not self._uid():
                return self._json({"erro": "não autenticado"}, 403)
            data = self._body()
            if not data.get("nome") or not data.get("setor_id"):
                return self._json({"erro": "'nome' e 'setor_id' são obrigatórios"}, 400)
            con = get_db()
            cur = con.execute(
                "INSERT INTO contatos (setor_id, nome, cargo, telefone, email)"
                " VALUES (?,?,?,?,?)",
                (data.get("setor_id"), data.get("nome"), data.get("cargo", ""),
                 data.get("telefone", ""), data.get("email", "")))
            log(con, "criar", cur.lastrowid, f"criado: {data.get('nome')}")
            con.commit()
            row = con.execute(
                "SELECT * FROM contatos WHERE id=?", (cur.lastrowid,)).fetchone()
            con.close()
            return self._json(dict(row), 201)
        return self.send_error(404)

    def do_DELETE(self):
        parts = urllib.parse.urlparse(self.path).path.rstrip("/").split("/")
        if len(parts) == 4 and parts[1] == "api" and parts[2] == "contatos":
            if not self._uid():
                return self._json({"erro": "não autenticado"}, 403)
            try:
                cid = int(parts[3])
            except ValueError:
                return self._json({"erro": "id inválido"}, 400)
            con = get_db()
            row = con.execute(
                "SELECT * FROM contatos WHERE id=?", (cid,)).fetchone()
            if not row:
                con.close()
                return self._json({"erro": "não encontrado"}, 404)
            con.execute("DELETE FROM contatos WHERE id=?", (cid,))
            log(con, "remover", cid, f"removido: {row['nome']}")
            con.commit()
            con.close()
            return self._json({"ok": True})
        return self.send_error(404)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    init_db()
    print("Pública: http://localhost:8000  |  Admin: http://localhost:8000/admin"
          "  (demo: admin / admin123)")
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
