#!/usr/bin/env python3
"""Fails when a caller job grants less than the workflow it calls declares.

A called workflow cannot ask for more than its caller grants, and GitHub checks that when the
run starts, for every job in the called workflow. So the caller needs the union of every
permission any job in the called workflow declares. This reads both files line by line (no YAML
library is needed for this shape) and compares the union with the caller job's block.

Usage: check-workflow-permissions.py <called.yml> <caller.yml> [caller-job]
"""
import re
import sys

RANK = {"none": 0, "read": 1, "write": 2}


def blocks(lines):
    """Yield (start_index, {scope: level}) for each `permissions:` mapping."""
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*)permissions:\s*(#.*)?$", line)
        if not m:
            continue
        indent = len(m.group(1))
        found = {}
        for nxt in lines[i + 1:]:
            if not nxt.strip() or nxt.lstrip().startswith("#"):
                continue
            n = len(nxt) - len(nxt.lstrip())
            if n <= indent:
                break
            km = re.match(r"^\s+([a-z-]+):\s*(read|write|none)\s*(#.*)?$", nxt)
            if km:
                found[km.group(1)] = km.group(2)
        yield i, found


def job_lines(lines, job):
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^  %s:\s*(#.*)?$" % re.escape(job), line):
            start = i
        elif start is not None and re.match(r"^  \S", line):
            return lines[start:i]
    return lines[start:] if start is not None else None


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    called = open(sys.argv[1]).read().splitlines()
    caller = open(sys.argv[2]).read().splitlines()
    job = sys.argv[3] if len(sys.argv) > 3 else "ci"

    need = {}
    for _, found in blocks(called):
        for scope, level in found.items():
            if RANK[level] > RANK.get(need.get(scope, "none"), 0):
                need[scope] = level

    body = job_lines(caller, job)
    if body is None:
        print("check-workflow-permissions: no job %r in %s" % (job, sys.argv[2]), file=sys.stderr)
        return 1
    have = {}
    for _, found in blocks(body):
        have.update(found)

    missing = [
        "%s: %s (has %s)" % (scope, level, have.get(scope, "nothing"))
        for scope, level in sorted(need.items())
        if RANK[have.get(scope, "none")] < RANK[level]
    ]
    if missing:
        print("check-workflow-permissions: job %r in %s grants less than %s declares:" % (job, sys.argv[2], sys.argv[1]), file=sys.stderr)
        for m in missing:
            print("  " + m, file=sys.stderr)
        return 1
    print("check-workflow-permissions: job %r grants every permission %s declares (%s)" % (
        job, sys.argv[1], ", ".join("%s: %s" % kv for kv in sorted(need.items()))))
    return 0


sys.exit(main())
