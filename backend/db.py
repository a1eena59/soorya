"""Database connection and schema setup. Run `python db.py` to create tables."""
from contextlib import contextmanager
from pathlib import Path

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extensions import AsIs, register_adapter
from psycopg2.extras import execute_values

from config import DATABASE_URL
from locations import LOCATIONS

# Let numpy numbers go straight into SQL
register_adapter(np.float64, AsIs)
register_adapter(np.float32, AsIs)
register_adapter(np.int64, AsIs)
register_adapter(np.int32, AsIs)
register_adapter(np.bool_, lambda b: AsIs(bool(b)))


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query_df(sql, params=None):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return pd.DataFrame(cur.fetchall(), columns=[c.name for c in cur.description])


def insert_many(table, columns, rows, conflict="DO NOTHING"):
    if not rows:
        return
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT {conflict}"
    with get_conn() as conn, conn.cursor() as cur:
        execute_values(cur, sql, rows, page_size=5000)


def init_db():
    schema = (Path(__file__).parent / "schema.sql").read_text()
    conn = psycopg2.connect(DATABASE_URL)
    # CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous) can't run inside a transaction
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(schema)
    conn.close()
    insert_many("locations", ["name", "district", "lat", "lon"], LOCATIONS)


def db_status():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'")
        row = cur.fetchone()
        cur.execute("SELECT hypertable_name FROM timescaledb_information.hypertables ORDER BY 1")
        hypertables = [r[0] for r in cur.fetchall()]
    return {"timescaledb": row[0] if row else None, "hypertables": hypertables}


if __name__ == "__main__":
    init_db()
    print("Schema ready:", db_status())
