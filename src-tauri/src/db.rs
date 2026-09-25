//! SQLite access layer. The application layer (TypeScript) owns the schema and
//! the business logic; this module provides a small, transactional, typed bridge.
use crate::error::{AppError, AppResult};
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::limits::Limit;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::Path;

pub fn open_connection(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    // Rollback journal + FULL sync is the most robust choice for user-selected folders
    // (USB drives, synced folders, network shares) and guarantees that an interrupted
    // write never corrupts the database: the transaction is simply rolled back.
    conn.execute_batch(
        "PRAGMA journal_mode = DELETE;
         PRAGMA synchronous = FULL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA temp_store = MEMORY;",
    )?;
    Ok(conn)
}

/// Fast structural check used at startup.
pub fn quick_check(path: &Path) -> AppResult<bool> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let res: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    Ok(res == "ok")
}

/// Full integrity check; returns the list of problems (empty = healthy).
pub fn integrity_check(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("PRAGMA integrity_check")?;
    let rows: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    Ok(rows.into_iter().filter(|r| r != "ok").collect())
}

pub fn json_to_sql(v: &Value) -> AppResult<SqlValue> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else {
                SqlValue::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    })
}

fn sql_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => Value::String(hex::encode(b)),
    }
}

fn to_params(params: &[Value]) -> AppResult<Vec<SqlValue>> {
    params.iter().map(json_to_sql).collect()
}

pub fn query(conn: &Connection, sql: &str, params: &[Value]) -> AppResult<Vec<Map<String, Value>>> {
    let mut stmt = conn.prepare_cached(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let p = to_params(params)?;
    let mut rows = stmt.query(params_from_iter(p.iter()))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut m = Map::with_capacity(names.len());
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), sql_to_json(row.get_ref(i)?));
        }
        out.push(m);
    }
    Ok(out)
}

pub fn execute(conn: &Connection, sql: &str, params: &[Value]) -> AppResult<usize> {
    let p = to_params(params)?;
    let mut stmt = conn.prepare_cached(sql)?;
    Ok(stmt.execute(params_from_iter(p.iter()))?)
}

#[derive(Debug, Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
    /// When true, `sql` may contain several statements (used by migrations) and params are ignored.
    #[serde(default)]
    pub script: bool,
}

#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub changes: Vec<usize>,
}

/// Executes all statements inside a single transaction: either everything is applied or nothing.
pub fn batch(conn: &mut Connection, statements: &[Statement]) -> AppResult<BatchResult> {
    let tx = conn.transaction()?;
    let mut changes = Vec::with_capacity(statements.len());
    for s in statements {
        if s.script {
            tx.execute_batch(&s.sql)?;
            changes.push(0);
        } else {
            let p = to_params(&s.params)?;
            let mut stmt = tx.prepare_cached(&s.sql)?;
            changes.push(stmt.execute(params_from_iter(p.iter()))?);
        }
    }
    tx.commit()?;
    Ok(BatchResult { changes })
}

/// Read-only pragmas allowed for frontend SQL: schema introspection (the JSON importer) and
/// `data_version`, which FTS5 queries internally.
const FRONTEND_PRAGMAS: &[&str] = &["table_info", "table_xinfo", "foreign_key_list", "index_list", "index_info", "data_version"];

/// Authorizer for SQL sent by the frontend: it may read and write the workspace database,
/// but never attach other database files, change connection-level pragmas or load extensions.
fn frontend_authorizer(ctx: AuthContext<'_>) -> Authorization {
    match ctx.action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => Authorization::Deny,
        AuthAction::Pragma { pragma_name, .. } => {
            if FRONTEND_PRAGMAS.contains(&pragma_name.to_ascii_lowercase().as_str()) {
                Authorization::Allow
            } else {
                Authorization::Deny
            }
        }
        AuthAction::Function { function_name } if function_name.eq_ignore_ascii_case("load_extension") => Authorization::Deny,
        _ => Authorization::Allow,
    }
}

/// Runs frontend-supplied SQL with the authorizer installed and no database attachments
/// allowed (this also rules out `VACUUM INTO`, which writes files through an attachment).
/// Backend-internal operations such as snapshots run outside the guard.
pub fn with_frontend_guard<T>(conn: &mut Connection, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
    let previous = conn.set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0).unwrap_or(10);
    conn.authorizer(Some(frontend_authorizer));
    let result = f(conn);
    conn.authorizer(None::<fn(AuthContext<'_>) -> Authorization>);
    let _ = conn.set_limit(Limit::SQLITE_LIMIT_ATTACHED, previous);
    result
}

/// Writes a consistent snapshot of the live database to `dest` (VACUUM INTO).
pub fn snapshot(conn: &Connection, dest: &Path) -> AppResult<()> {
    if dest.exists() {
        std::fs::remove_file(dest)?;
    }
    let dest_str = dest
        .to_str()
        .ok_or_else(|| AppError::coded("path.invalid", "Snapshot path is not valid UTF-8"))?;
    conn.execute("VACUUM INTO ?1", [dest_str])?;
    Ok(())
}

/// Counts rows of every user table in a database file (used by backup previews).
pub fn table_counts(path: &Path) -> AppResult<Vec<(String, i64)>> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE 'search_index%' ORDER BY name",
    )?;
    let names: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut out = vec![];
    for n in names {
        let c: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM \"{}\"", n.replace('"', "\"\"")), [], |r| r.get(0))?;
        out.push((n, c));
    }
    Ok(out)
}

pub fn schema_version(path: &Path) -> Option<i64> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r.get(0)).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn batch_is_atomic() {
        let dir = tempfile::tempdir().unwrap();
        let mut c = open_connection(&dir.path().join("t.sqlite")).unwrap();
        c.execute_batch("CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)").unwrap();
        let ok = batch(
            &mut c,
            &[Statement { sql: "INSERT INTO t VALUES (?, ?)".into(), params: vec![json!("a"), json!(1)], script: false }],
        );
        assert!(ok.is_ok());
        let bad = batch(
            &mut c,
            &[
                Statement { sql: "INSERT INTO t VALUES (?, ?)".into(), params: vec![json!("b"), json!(2)], script: false },
                Statement { sql: "INSERT INTO t VALUES (?, ?)".into(), params: vec![json!("a"), json!(3)], script: false },
            ],
        );
        assert!(bad.is_err());
        let rows = query(&c, "SELECT * FROM t ORDER BY id", &[]).unwrap();
        assert_eq!(rows.len(), 1, "failed batch must roll back completely");
        assert_eq!(rows[0]["n"], json!(1));
    }

    #[test]
    fn frontend_guard_blocks_file_access_outside_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = open_connection(&dir.path().join("db.sqlite")).unwrap();
        let outside = dir.path().join("outside.sqlite");
        let outside_s = outside.to_string_lossy().to_string();
        let blocked = [
            format!("ATTACH DATABASE '{outside_s}' AS x"),
            format!("VACUUM INTO '{outside_s}'"),
            "PRAGMA writable_schema = ON".to_string(),
            "PRAGMA journal_mode = OFF".to_string(),
            "SELECT load_extension('x')".to_string(),
        ];
        for sql in &blocked {
            let r = with_frontend_guard(&mut conn, |c| execute(c, sql, &[]).map(|_| ()));
            assert!(r.is_err(), "should be blocked: {sql}");
        }
        assert!(!outside.exists());
        // Normal application SQL still works, including schema introspection and FTS5.
        with_frontend_guard(&mut conn, |c| {
            execute(c, "CREATE TABLE t (id TEXT PRIMARY KEY, name TEXT)", &[])?;
            execute(c, "CREATE VIRTUAL TABLE s USING fts5(body, tokenize = 'trigram')", &[])?;
            execute(c, "INSERT INTO t VALUES ('1', 'a')", &[])?;
            batch(c, &[Statement { sql: "INSERT INTO t VALUES ('2', 'b'); INSERT INTO s(body) VALUES ('hello');".into(), params: vec![], script: true }])?;
            assert_eq!(query(c, "PRAGMA table_info(t)", &[])?.len(), 2);
            assert_eq!(query(c, "SELECT * FROM s WHERE s MATCH 'ell'", &[])?.len(), 1);
            Ok(())
        })
        .unwrap();
        // The backend's own snapshot (VACUUM INTO) still works outside the guard.
        snapshot(&conn, &dir.path().join("snap.sqlite")).unwrap();
        assert!(dir.path().join("snap.sqlite").exists());
    }

    #[test]
    fn fts5_trigram_is_available() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE VIRTUAL TABLE s USING fts5(body, tokenize='trigram'); INSERT INTO s VALUES ('أمن الشبكات network security');").unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM s WHERE s MATCH '\"الشبك\"'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn snapshot_produces_valid_copy() {
        let dir = tempfile::tempdir().unwrap();
        let c = open_connection(&dir.path().join("a.sqlite")).unwrap();
        c.execute_batch("CREATE TABLE x(v); INSERT INTO x VALUES (1),(2);").unwrap();
        let dest = dir.path().join("b.sqlite");
        snapshot(&c, &dest).unwrap();
        assert!(quick_check(&dest).unwrap());
        assert_eq!(table_counts(&dest).unwrap(), vec![("x".to_string(), 2)]);
    }
}
