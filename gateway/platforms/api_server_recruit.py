"""
RecruitAI API handlers.

Stores extracted job postings and score revisions in the same SQLite database
used by the job-posting SQLite skills, and creates the Recruit workspace chat
session under the master agent.
"""

import json
import logging
import os
import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from aiohttp import web

from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)

VALID_POSTING_STATUSES = {"待编辑", "待评分", "待发布", "已完成", "已暂停"}
LEGACY_POSTING_STATUS_MAP = {
    "未完善": "待编辑",
    "未发布": "待发布",
    "已发布": "已完成",
    "已终止": "已暂停",
}
DEFAULT_POSTING_STATUS = "待编辑"
FORMAL_SCORE_STATUSES = {"待发布", "已完成"}
VALID_SCORE_MODES = {"正式权重", "预览权重"}
WORKSPACE_SOURCE = "recruit-workspace"
WORKSPACE_TITLE = "RecruitAI 工作台"


class RecruitAPIHandlers:
    """Handlers for RecruitAI workspace and job posting storage APIs."""

    def __init__(self, session_token: str):
        self._session_token = session_token
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            self._expected_token = os.getenv("HERMES_GATEWAY_TOKEN") or session_token
        else:
            self._expected_token = session_token

    def _check_auth(self, request: web.Request) -> None:
        auth = request.headers.get("Authorization", "")
        if auth == f"Bearer {self._expected_token}":
            return
        if request.query.get("token", "") == self._expected_token:
            return
        raise web.HTTPUnauthorized(text="Unauthorized")

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _json_dump(value: Any) -> Optional[str]:
        if value is None:
            return None
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _json_load(value: Optional[str], fallback: Any = None) -> Any:
        if value is None or value == "":
            return fallback
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return fallback

    @staticmethod
    def _float_or_none(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_list(value: Any) -> List[Any]:
        if isinstance(value, list):
            return value
        if value is None or value == "":
            return []
        return [value]

    def _db_path(self) -> Path:
        configured = os.getenv("HERMES_RECRUIT_DB_PATH")
        if configured:
            return Path(configured).expanduser()
        return get_hermes_home() / "job_postings.sqlite"

    def _connect(self) -> sqlite3.Connection:
        db_path = self._db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path), timeout=5.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        self._ensure_schema(conn)
        return conn

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS job_postings (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              record_uid TEXT UNIQUE,
              record_id TEXT,
              schema_version TEXT,
              source_type TEXT,
              source_format TEXT,
              source_platform TEXT,
              source_file_name TEXT,
              source_document_title TEXT,
              status TEXT NOT NULL CHECK (status IN ('待编辑', '待评分', '待发布', '已完成', '已暂停')),
              company_name TEXT,
              position_title TEXT,
              position_category TEXT,
              city TEXT,
              district TEXT,
              salary_min REAL,
              salary_max REAL,
              salary_unit TEXT,
              salary_months REAL,
              skills_json TEXT,
              must_have_json TEXT,
              responsibilities_json TEXT,
              benefits_json TEXT,
              source_json TEXT,
              extraction_meta_json TEXT,
              raw_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_job_postings_status
              ON job_postings(status);

            CREATE INDEX IF NOT EXISTS idx_job_postings_company_position
              ON job_postings(company_name, position_title);

            CREATE TABLE IF NOT EXISTS job_posting_scores (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              job_posting_id INTEGER NOT NULL,
              mode TEXT NOT NULL CHECK (mode IN ('正式权重', '预览权重')),
              status_at_scoring TEXT,
              score_json TEXT NOT NULL,
              summary_json TEXT,
              is_active INTEGER NOT NULL DEFAULT 1,
              revision INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_job_posting_scores_job_active
              ON job_posting_scores(job_posting_id, is_active);

            CREATE TABLE IF NOT EXISTS recruit_candidates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              candidate_uid TEXT UNIQUE,
              name TEXT,
              email TEXT,
              phone TEXT,
              location TEXT,
              current_role TEXT,
              current_company TEXT,
              experience_years REAL,
              status TEXT,
              skills_json TEXT,
              summary TEXT,
              source_json TEXT,
              raw_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_recruit_candidates_status
              ON recruit_candidates(status);
            """
        )
        self._migrate_posting_status_check(conn)

    def _migrate_posting_status_check(self, conn: sqlite3.Connection) -> None:
        table_row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'job_postings'"
        ).fetchone()
        table_sql = table_row["sql"] if table_row else ""
        if not table_sql or "未完善" not in table_sql:
            return

        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("PRAGMA legacy_alter_table=ON")
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("ALTER TABLE job_postings RENAME TO job_postings_legacy_status")
            conn.execute(
                """
                CREATE TABLE job_postings (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  record_uid TEXT UNIQUE,
                  record_id TEXT,
                  schema_version TEXT,
                  source_type TEXT,
                  source_format TEXT,
                  source_platform TEXT,
                  source_file_name TEXT,
                  source_document_title TEXT,
                  status TEXT NOT NULL CHECK (status IN ('待编辑', '待评分', '待发布', '已完成', '已暂停')),
                  company_name TEXT,
                  position_title TEXT,
                  position_category TEXT,
                  city TEXT,
                  district TEXT,
                  salary_min REAL,
                  salary_max REAL,
                  salary_unit TEXT,
                  salary_months REAL,
                  skills_json TEXT,
                  must_have_json TEXT,
                  responsibilities_json TEXT,
                  benefits_json TEXT,
                  source_json TEXT,
                  extraction_meta_json TEXT,
                  raw_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                INSERT INTO job_postings (
                  id, record_uid, record_id, schema_version, source_type, source_format,
                  source_platform, source_file_name, source_document_title, status,
                  company_name, position_title, position_category, city, district,
                  salary_min, salary_max, salary_unit, salary_months, skills_json,
                  must_have_json, responsibilities_json, benefits_json, source_json,
                  extraction_meta_json, raw_json, created_at, updated_at
                )
                SELECT
                  id, record_uid, record_id, schema_version, source_type, source_format,
                  source_platform, source_file_name, source_document_title,
                  CASE status
                    WHEN '未完善' THEN '待编辑'
                    WHEN '未发布' THEN '待发布'
                    WHEN '已发布' THEN '已完成'
                    WHEN '已终止' THEN '已暂停'
                    ELSE '待编辑'
                  END,
                  company_name, position_title, position_category, city, district,
                  salary_min, salary_max, salary_unit, salary_months, skills_json,
                  must_have_json, responsibilities_json, benefits_json, source_json,
                  extraction_meta_json, raw_json, created_at, updated_at
                FROM job_postings_legacy_status
                """
            )
            conn.execute("DROP TABLE job_postings_legacy_status")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.execute("PRAGMA legacy_alter_table=OFF")
            conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status)")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_job_postings_company_position "
            "ON job_postings(company_name, position_title)"
        )

    def _posting_from_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "record_uid": row["record_uid"],
            "record_id": row["record_id"],
            "schema_version": row["schema_version"],
            "source": {
                "type": row["source_type"],
                "format": row["source_format"],
                "platform": row["source_platform"],
                "file_name": row["source_file_name"],
                "document_title": row["source_document_title"],
            },
            "status": row["status"],
            "company_name": row["company_name"],
            "position_title": row["position_title"],
            "position_category": row["position_category"],
            "city": row["city"],
            "district": row["district"],
            "salary": {
                "min": row["salary_min"],
                "max": row["salary_max"],
                "unit": row["salary_unit"],
                "months": row["salary_months"],
            },
            "skills": self._json_load(row["skills_json"], []),
            "must_have": self._json_load(row["must_have_json"], []),
            "responsibilities": self._json_load(row["responsibilities_json"], []),
            "benefits": self._json_load(row["benefits_json"], []),
            "source_json": self._json_load(row["source_json"], {}),
            "extraction_meta": self._json_load(row["extraction_meta_json"], {}),
            "raw_json": self._json_load(row["raw_json"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _score_from_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "job_posting_id": row["job_posting_id"],
            "mode": row["mode"],
            "status_at_scoring": row["status_at_scoring"],
            "score_json": self._json_load(row["score_json"], {}),
            "summary_json": self._json_load(row["summary_json"], None),
            "is_active": bool(row["is_active"]),
            "revision": row["revision"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _candidate_from_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "candidate_uid": row["candidate_uid"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "location": row["location"],
            "current_role": row["current_role"],
            "current_company": row["current_company"],
            "experience_years": row["experience_years"],
            "status": row["status"],
            "skills": self._json_load(row["skills_json"], []),
            "summary": row["summary"],
            "source_json": self._json_load(row["source_json"], {}),
            "raw_json": self._json_load(row["raw_json"], {}),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _extract_record_rows(self, payload: Any) -> List[Dict[str, Any]]:
        if isinstance(payload, list):
            root: Dict[str, Any] = {"records": payload}
        elif isinstance(payload, dict):
            root = payload
            for key in ("job_json", "payload", "data", "result", "output"):
                nested = root.get(key)
                if isinstance(nested, dict):
                    root = nested
                    break
                if isinstance(nested, list):
                    root = {"records": nested}
                    break
        else:
            return []

        source = root.get("source") if isinstance(root.get("source"), dict) else {}
        schema_version = root.get("schema_version")
        payload_record_uid = payload.get("record_uid") if isinstance(payload, dict) else None
        records = root.get("records")
        if not isinstance(records, list):
            record = root.get("record")
            records = [record] if isinstance(record, dict) else [root]

        rows = []
        for record in records:
            if not isinstance(record, dict):
                continue
            company_value = record.get("company")
            company = company_value if isinstance(company_value, dict) else {
                "name": record.get("company_name") or (company_value if isinstance(company_value, str) else None)
            }
            position_value = record.get("position")
            position = position_value if isinstance(position_value, dict) else {
                "title": record.get("position_title") or record.get("job_title") or record.get("title"),
                "category": record.get("position_category") or record.get("category"),
                "description": record.get("description"),
            }
            location_value = record.get("location")
            location = location_value if isinstance(location_value, dict) else {
                "city": record.get("city") or (location_value if isinstance(location_value, str) else None),
                "district": record.get("district"),
            }
            salary_value = record.get("salary")
            salary = salary_value if isinstance(salary_value, dict) else {
                "min": record.get("salary_min"),
                "max": record.get("salary_max"),
                "unit": record.get("salary_unit"),
                "months": record.get("salary_months"),
            }
            requirements_value = record.get("requirements")
            requirements = requirements_value if isinstance(requirements_value, dict) else {}
            flat_requirements = requirements_value if isinstance(requirements_value, list) else None
            raw_status = record.get("status")
            if raw_status in LEGACY_POSTING_STATUS_MAP:
                status = LEGACY_POSTING_STATUS_MAP[raw_status]
            elif raw_status in VALID_POSTING_STATUSES:
                status = raw_status
            else:
                status = DEFAULT_POSTING_STATUS
            raw_record = {
                "schema_version": schema_version,
                "source": source,
                "record": record,
            }
            rows.append({
                "record_uid": record.get("record_uid") or payload_record_uid,
                "record_id": record.get("record_id"),
                "schema_version": schema_version,
                "source_type": source.get("type"),
                "source_format": source.get("format"),
                "source_platform": source.get("platform"),
                "source_file_name": source.get("file_name"),
                "source_document_title": source.get("document_title"),
                "status": status,
                "company_name": company.get("name"),
                "position_title": position.get("title"),
                "position_category": position.get("category"),
                "city": location.get("city"),
                "district": location.get("district"),
                "salary_min": self._float_or_none(salary.get("min")),
                "salary_max": self._float_or_none(salary.get("max")),
                "salary_unit": salary.get("unit"),
                "salary_months": self._float_or_none(salary.get("months")),
                "skills_json": self._json_dump(self._as_list(requirements.get("skills") or record.get("skills"))),
                "must_have_json": self._json_dump(
                    self._as_list(requirements.get("must_have") or record.get("must_have") or flat_requirements)
                ),
                "responsibilities_json": self._json_dump(self._as_list(record.get("responsibilities"))),
                "benefits_json": self._json_dump(self._as_list(record.get("benefits"))),
                "source_json": self._json_dump(source),
                "extraction_meta_json": self._json_dump(record.get("extraction_meta") or {}),
                "raw_json": self._json_dump(raw_record),
            })
        return rows

    def _list_workspace_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        from hermes_state import SessionDB

        db = SessionDB()
        try:
            return db.list_sessions_rich(
                source=WORKSPACE_SOURCE,
                limit=limit,
                offset=0,
                include_children=False,
                agent_id=None,
            )
        finally:
            db.close()

    def _create_workspace_session(self) -> Dict[str, Any]:
        from hermes_state import SessionDB

        db = SessionDB()
        try:
            session_id = f"recruit_{uuid.uuid4().hex[:12]}"
            db.create_session(
                session_id=session_id,
                source=WORKSPACE_SOURCE,
                user_id="local-user",
                agent_id=None,
            )
            db._conn.execute(
                "UPDATE sessions SET title = ? WHERE id = ?",
                (WORKSPACE_TITLE, session_id),
            )
            db._conn.commit()
            session = db.get_session(session_id) or {}
            session["last_active"] = session.get("started_at", time.time())
            session["preview"] = ""
            session["has_active_stream"] = False
            return session
        finally:
            db.close()

    def _ensure_workspace_session(self) -> Dict[str, Any]:
        existing = self._list_workspace_sessions(limit=1)
        if existing:
            return existing[0]
        return self._create_workspace_session()

    async def handle_get_workspace(self, request: web.Request) -> web.Response:
        """GET /api/recruit/workspace."""
        self._check_auth(request)
        try:
            session = self._ensure_workspace_session()
            sessions = self._list_workspace_sessions(limit=50)
            with closing(self._connect()) as conn:
                postings = self._list_postings(conn, limit=50, offset=0)
                candidates = self._list_candidates(conn, limit=50, offset=0)
            return web.json_response({
                "workspace_session": session,
                "workspace_sessions": sessions,
                "postings": postings,
                "candidates": candidates,
                "database_path": str(self._db_path()),
            })
        except Exception as exc:
            _log.exception("GET /api/recruit/workspace failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_create_workspace_session(self, request: web.Request) -> web.Response:
        """POST /api/recruit/workspace/session."""
        self._check_auth(request)
        try:
            session = self._create_workspace_session()
            return web.json_response({"session": session})
        except Exception as exc:
            _log.exception("POST /api/recruit/workspace/session failed")
            return web.json_response({"detail": str(exc)}, status=500)

    def _list_postings(self, conn: sqlite3.Connection, limit: int, offset: int) -> List[Dict[str, Any]]:
        cursor = conn.execute(
            """
            SELECT p.*,
                   s.id AS active_score_id,
                   s.mode AS active_score_mode,
                   s.revision AS active_score_revision,
                   s.created_at AS active_score_created_at
            FROM job_postings p
            LEFT JOIN job_posting_scores s
              ON s.job_posting_id = p.id AND s.is_active = 1
            ORDER BY p.updated_at DESC, p.id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        postings = []
        for row in cursor.fetchall():
            item = self._posting_from_row(row)
            item["active_score"] = None
            if row["active_score_id"] is not None:
                item["active_score"] = {
                    "id": row["active_score_id"],
                    "mode": row["active_score_mode"],
                    "revision": row["active_score_revision"],
                    "created_at": row["active_score_created_at"],
                }
            postings.append(item)
        return postings

    def _list_candidates(self, conn: sqlite3.Connection, limit: int, offset: int) -> List[Dict[str, Any]]:
        cursor = conn.execute(
            """
            SELECT *
            FROM recruit_candidates
            ORDER BY updated_at DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )
        return [self._candidate_from_row(row) for row in cursor.fetchall()]

    async def handle_list_postings(self, request: web.Request) -> web.Response:
        """GET /api/recruit/postings."""
        self._check_auth(request)
        try:
            limit = max(1, min(int(request.query.get("limit", "50")), 200))
            offset = max(0, int(request.query.get("offset", "0")))
            with closing(self._connect()) as conn:
                postings = self._list_postings(conn, limit=limit, offset=offset)
                total = conn.execute("SELECT COUNT(*) AS count FROM job_postings").fetchone()["count"]
            return web.json_response({
                "postings": postings,
                "total": total,
                "limit": limit,
                "offset": offset,
                "database_path": str(self._db_path()),
            })
        except Exception as exc:
            _log.exception("GET /api/recruit/postings failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_list_candidates(self, request: web.Request) -> web.Response:
        """GET /api/recruit/candidates."""
        self._check_auth(request)
        try:
            limit = max(1, min(int(request.query.get("limit", "50")), 200))
            offset = max(0, int(request.query.get("offset", "0")))
            with closing(self._connect()) as conn:
                candidates = self._list_candidates(conn, limit=limit, offset=offset)
                total = conn.execute("SELECT COUNT(*) AS count FROM recruit_candidates").fetchone()["count"]
            return web.json_response({
                "candidates": candidates,
                "total": total,
                "limit": limit,
                "offset": offset,
                "database_path": str(self._db_path()),
            })
        except Exception as exc:
            _log.exception("GET /api/recruit/candidates failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_get_posting(self, request: web.Request) -> web.Response:
        """GET /api/recruit/postings/{posting_id}."""
        self._check_auth(request)
        try:
            posting_id = int(request.match_info["posting_id"])
            with closing(self._connect()) as conn:
                row = conn.execute("SELECT * FROM job_postings WHERE id = ?", (posting_id,)).fetchone()
                if not row:
                    return web.json_response({"detail": "Posting not found"}, status=404)
                scores = conn.execute(
                    "SELECT * FROM job_posting_scores WHERE job_posting_id = ? ORDER BY revision DESC, id DESC",
                    (posting_id,),
                ).fetchall()
            return web.json_response({
                "posting": self._posting_from_row(row),
                "scores": [self._score_from_row(score) for score in scores],
                "database_path": str(self._db_path()),
            })
        except ValueError:
            return web.json_response({"detail": "Invalid posting id"}, status=400)
        except Exception as exc:
            _log.exception("GET /api/recruit/postings/{posting_id} failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_upsert_postings(self, request: web.Request) -> web.Response:
        """POST /api/recruit/postings."""
        self._check_auth(request)
        try:
            payload = await request.json()
            if not isinstance(payload, (dict, list)):
                return web.json_response({"detail": "JSON object or array expected"}, status=400)
            rows = self._extract_record_rows(payload)
            if not rows:
                return web.json_response({"detail": "No job records found"}, status=400)

            now = self._now_iso()
            written_ids: List[int] = []
            columns = [
                "record_uid", "record_id", "schema_version", "source_type", "source_format",
                "source_platform", "source_file_name", "source_document_title", "status",
                "company_name", "position_title", "position_category", "city", "district",
                "salary_min", "salary_max", "salary_unit", "salary_months", "skills_json",
                "must_have_json", "responsibilities_json", "benefits_json", "source_json",
                "extraction_meta_json", "raw_json",
            ]

            with closing(self._connect()) as conn:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    for row in rows:
                        values = [row.get(col) for col in columns]
                        if row.get("record_uid"):
                            set_clause = ", ".join(f"{col}=excluded.{col}" for col in columns if col != "record_uid")
                            cursor = conn.execute(
                                f"""
                                INSERT INTO job_postings ({", ".join(columns)}, created_at, updated_at)
                                VALUES ({", ".join("?" for _ in columns)}, ?, ?)
                                ON CONFLICT(record_uid) DO UPDATE SET
                                  {set_clause},
                                  updated_at=excluded.updated_at
                                RETURNING id
                                """,
                                [*values, now, now],
                            )
                        else:
                            cursor = conn.execute(
                                f"""
                                INSERT INTO job_postings ({", ".join(columns)}, created_at, updated_at)
                                VALUES ({", ".join("?" for _ in columns)}, ?, ?)
                                RETURNING id
                                """,
                                [*values, now, now],
                            )
                        written_ids.append(int(cursor.fetchone()["id"]))
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise

            return web.json_response({
                "ok": True,
                "database_path": str(self._db_path()),
                "table": "job_postings",
                "count": len(written_ids),
                "ids": written_ids,
            })
        except json.JSONDecodeError:
            return web.json_response({"detail": "Invalid JSON"}, status=400)
        except Exception as exc:
            _log.exception("POST /api/recruit/postings failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_list_scores(self, request: web.Request) -> web.Response:
        """GET /api/recruit/scores."""
        self._check_auth(request)
        try:
            posting_id = request.query.get("job_posting_id")
            params: List[Any] = []
            where_sql = ""
            if posting_id:
                where_sql = "WHERE job_posting_id = ?"
                params.append(int(posting_id))
            with closing(self._connect()) as conn:
                rows = conn.execute(
                    f"SELECT * FROM job_posting_scores {where_sql} ORDER BY created_at DESC, id DESC",
                    params,
                ).fetchall()
            return web.json_response({
                "scores": [self._score_from_row(row) for row in rows],
                "database_path": str(self._db_path()),
            })
        except ValueError:
            return web.json_response({"detail": "Invalid job_posting_id"}, status=400)
        except Exception as exc:
            _log.exception("GET /api/recruit/scores failed")
            return web.json_response({"detail": str(exc)}, status=500)

    async def handle_create_score(self, request: web.Request) -> web.Response:
        """POST /api/recruit/postings/{posting_id}/scores."""
        self._check_auth(request)
        try:
            posting_id = int(request.match_info["posting_id"])
            payload = await request.json()
            if not isinstance(payload, dict):
                return web.json_response({"detail": "JSON object expected"}, status=400)
            score_json = payload.get("score_json")
            if not isinstance(score_json, dict):
                return web.json_response({"detail": "score_json object is required"}, status=400)

            now = self._now_iso()
            with closing(self._connect()) as conn:
                posting = conn.execute(
                    "SELECT id, status FROM job_postings WHERE id = ?",
                    (posting_id,),
                ).fetchone()
                if not posting:
                    return web.json_response({"detail": "Posting not found"}, status=404)

                mode = payload.get("mode")
                if mode is None:
                    mode = "正式权重" if posting["status"] in FORMAL_SCORE_STATUSES else "预览权重"
                if mode not in VALID_SCORE_MODES:
                    return web.json_response({"detail": "Invalid score mode"}, status=400)

                conn.execute("BEGIN IMMEDIATE")
                try:
                    conn.execute(
                        "UPDATE job_posting_scores SET is_active = 0, updated_at = ? WHERE job_posting_id = ? AND mode = ?",
                        (now, posting_id, mode),
                    )
                    max_revision = conn.execute(
                        "SELECT COALESCE(MAX(revision), 0) AS revision FROM job_posting_scores WHERE job_posting_id = ?",
                        (posting_id,),
                    ).fetchone()["revision"]
                    revision = int(max_revision) + 1
                    cursor = conn.execute(
                        """
                        INSERT INTO job_posting_scores
                          (job_posting_id, mode, status_at_scoring, score_json, summary_json,
                           is_active, revision, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
                        RETURNING id
                        """,
                        (
                            posting_id,
                            mode,
                            posting["status"],
                            self._json_dump(score_json),
                            self._json_dump(payload.get("summary_json")),
                            revision,
                            now,
                            now,
                        ),
                    )
                    score_id = int(cursor.fetchone()["id"])
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise

            return web.json_response({
                "ok": True,
                "database_path": str(self._db_path()),
                "table": "job_posting_scores",
                "job_posting_id": posting_id,
                "score_id": score_id,
                "mode": mode,
                "status_at_scoring": posting["status"],
                "revision": revision,
            })
        except ValueError:
            return web.json_response({"detail": "Invalid posting id"}, status=400)
        except json.JSONDecodeError:
            return web.json_response({"detail": "Invalid JSON"}, status=400)
        except Exception as exc:
            _log.exception("POST /api/recruit/postings/{posting_id}/scores failed")
            return web.json_response({"detail": str(exc)}, status=500)
