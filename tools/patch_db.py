#!/usr/bin/env python3
"""Apply a reviewed SQL edit to a NEW copy of the Kingdom Code database.

    python3 tools/patch_db.py tools/patches/NAME.sql kc_v18.db kc_v19.db

The patch file holds plain SQL statements (UPDATE, INSERT) and is kept in tools/patches/ as the
record of the change. Its first comment line ("-- ...") is copied into import_log as the reason.
The input database is opened read-only and never modified; the output must not already exist.
Everything runs in one transaction: if any statement fails, or a statement changes no rows, nothing
is written. Edits to a node's title or body keep the old text in node_revisions (the database's own
trigger does that).
"""
import os
import sqlite3
import sys


def statements(sql):
    out, buf = [], ""
    for line in sql.splitlines(keepends=True):
        if line.lstrip().startswith("--") and not buf.strip():
            continue
        buf += line
        if sqlite3.complete_statement(buf):
            out.append(buf.strip())
            buf = ""
    if buf.strip():
        raise RuntimeError("the patch ends with an incomplete statement")
    return out


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    patch, src, out = sys.argv[1:]
    if os.path.exists(out):
        sys.exit("refusing to overwrite an existing file: " + out)
    sql = open(patch, encoding="utf-8").read()
    first = next((l[2:].strip() for l in sql.splitlines() if l.startswith("--")), "")
    stmts = statements(sql)
    tmp = out + ".partial"
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        inp = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(src), uri=True)
        dst = sqlite3.connect(tmp)
        inp.backup(dst)                              # consistent copy; the input is never touched
        inp.close()
        total = 0
        with dst:
            for s in stmts:
                n = dst.execute(s).rowcount
                if n == 0:
                    raise RuntimeError("this statement changed nothing, so the patch does not fit this database:\n" + s)
                total += max(n, 0)
            dst.execute("insert into import_log(file_name, source, rows_read, rows_loaded, notes) values (?, ?, ?, ?, ?)",
                        (os.path.basename(out), "patch:" + os.path.basename(patch), len(stmts), total,
                         (first + " " if first else "") + "Applied to a copy of %s." % os.path.basename(src)))
        ok = dst.execute("pragma integrity_check").fetchone()[0]
        fk = dst.execute("pragma foreign_key_check").fetchall()
        if ok != "ok" or fk:
            raise RuntimeError("integrity check failed: %s %s" % (ok, fk[:3]))
        dst.close()
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.rename(tmp, out)
    print("statements: %d | rows changed: %d | integrity: ok | foreign-key problems: 0" % (len(stmts), total))
    print("wrote", out)


if __name__ == "__main__":
    main()
