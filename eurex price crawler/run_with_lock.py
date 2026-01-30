# crawler/run_with_lock.py
import os
import sys
import subprocess
import time
import psycopg2
from psycopg2 import sql, OperationalError

# Config: use DATABASE_URL or separate parts
DATABASE_URL = os.getenv("DATABASE_URL")  # e.g. postgres://user:pass@host:5432/dbname
# Advisory lock key — pick any big integer, must be same across runs
ADVISORY_LOCK_KEY = 1234567890

LOCK_TIMEOUT_SECONDS = 5  # how long to wait trying to acquire lock before giving up

def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL env var not set")
    return psycopg2.connect(DATABASE_URL, connect_timeout=10)

def acquire_advisory_lock(conn, key, timeout=LOCK_TIMEOUT_SECONDS):
    cur = conn.cursor()
    # try to obtain the advisory lock (non-blocking)
    cur.execute("SELECT pg_try_advisory_lock(%s);", (key,))
    got = cur.fetchone()[0]
    cur.close()
    return got

def release_advisory_lock(conn, key):
    cur = conn.cursor()
    cur.execute("SELECT pg_advisory_unlock(%s);", (key,))
    cur.close()

def main():
    print("Runner start:", time.strftime("%Y-%m-%d %H:%M:%S"))
    try:
        conn = get_conn()
    except OperationalError as e:
        print("DB connection failed:", e)
        sys.exit(2)

    try:
        got = acquire_advisory_lock(conn, ADVISORY_LOCK_KEY)
        if not got:
            print("Could not acquire advisory lock — another run probably in progress. Exiting.")
            sys.exit(0)

        print("Acquired lock. Running crawler...")
        # Run your existing script (adjust path if needed)
        # We capture and stream the output so Actions shows it in logs
        proc = subprocess.Popen([sys.executable, "crawl_prices.py"], cwd=os.path.dirname(__file__))
        ret = proc.wait()
        print("Crawler exited with code", ret)
        if ret != 0:
            sys.exit(ret)
    finally:
        try:
            release_advisory_lock(conn, ADVISORY_LOCK_KEY)
            conn.close()
            print("Released lock.")
        except Exception:
            pass

if __name__ == "__main__":
    main()
