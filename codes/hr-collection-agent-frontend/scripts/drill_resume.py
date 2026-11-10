#!/usr/bin/env python3
"""Repeatable browser drill for the resume collection flow (stdlib only, drives the `orca` CLI).

Usage (all paths are arguments; this script holds no personal data):

  drill_resume.py --file SAMPLE --url http://127.0.0.1:5173/ --data-dir DIR --file-dir DIR \
      [--truth truth.json] [--shots DIR] [--viewports 360x640,390x844] [--no-submit]

Flow: open a page -> upload FILE -> wait for recognition -> dump the draft (to --shots/draft.json,
never printed) -> compare with --truth -> optional narrow-viewport checks -> confirm every section
-> final submit -> read-only SQLite/file check.

Output contains verdicts, statuses, lengths and counts only - never field values.

truth.json (kept outside the repository):
  {"scalars":  [{"label": "...", "field": "name", "exact": "..."}],
   "lists":    [{"label": "...", "field": "skills", "items": ["..."]}],
   "any":      [{"label": "...", "needles": ["..."]}],
   "noise":    ["..."],
   "projects": {"count": 4, "keywords": [["零售"], ["医药"]]}}
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

ORCA = os.environ.get("ORCA_CLI_COMMAND", "orca")
PAGE = ""


def orca(*args: str, check: bool = True) -> dict:
    cmd = [ORCA, *args, "--json"]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads(out.stdout)
    except json.JSONDecodeError:
        data = {"ok": False, "error": {"message": out.stdout[:200] + out.stderr[:200]}}
    if check and not data.get("ok"):
        raise RuntimeError(f"orca {' '.join(args[:2])} failed: {data.get('error')}")
    return data


def snapshot(interactive: bool = True) -> str:
    cmd = [ORCA, "snapshot", "--page", PAGE]
    if interactive:
        cmd.append("--interactive")
    return subprocess.run(cmd, capture_output=True, text=True).stdout


def find_button(text: str, snap: str | None = None) -> str | None:
    """Ref of the first `- button "<text>"` line (exact label)."""
    snap = snap if snap is not None else snapshot()
    for line in snap.splitlines():
        s = line.strip()
        if s.startswith(f'- button "{text}"') and "disabled" not in s:
            m = re.search(r"ref=(e\d+)", s)
            if m:
                return m.group(1)
    return None


def click(ref: str) -> None:
    orca("click", "--page", PAGE, "--element", f"@{ref}")


def js(expr: str):
    data = orca("eval", "--page", PAGE, "--expression", expr)
    return data["result"]["result"]


def shot(shots: str, name: str) -> None:
    if not shots:
        return
    data = orca("screenshot", "--page", PAGE)
    os.makedirs(shots, exist_ok=True)
    src = data["result"]["path"]
    with open(src, "rb") as f, open(os.path.join(shots, f"{name}.png"), "wb") as g:
        g.write(f.read())


def wait_until(expr: str, timeout: float, what: str) -> None:
    end = time.time() + timeout
    while time.time() < end:
        if js(expr) in (True, "true"):
            return
        time.sleep(1.0)
    raise TimeoutError(f"timeout waiting for {what}")


FETCH_DRAFT = (
    "fetch('/api/v1/resume-drafts/current',{credentials:'same-origin'})"
    ".then(r=>r.ok?r.text():null)"
)


def fetch_draft() -> dict | None:
    raw = js(FETCH_DRAFT)
    return json.loads(raw) if raw else None


def norm(s) -> str:
    return re.sub(r"\s+", "", s or "")


def verdict(expected: str, actual) -> str:
    if actual in (None, ""):
        return "缺失"
    if actual == expected:
        return "正确"
    if norm(actual) == norm(expected):
        return "正确(仅空白差异)"
    if norm(expected) in norm(actual) or norm(actual) in norm(expected):
        return "部分"
    return "错误"


def flatten_strings(fields: dict):
    """Yield (field, text) for every string inside the fields."""
    for name, f in fields.items():
        v = f["value"]
        if isinstance(v, str):
            yield name, v
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, str):
                    yield name, item
                elif isinstance(item, dict):
                    for val in item.values():
                        if isinstance(val, str):
                            yield name, val
                        elif isinstance(val, list):
                            for x in val:
                                if isinstance(x, str):
                                    yield name, x


def compare(draft: dict, truth: dict) -> None:
    fields = draft["fields"]
    print("\n== 字段状态汇总 ==")
    counts: dict[str, int] = {}
    for f in fields.values():
        counts[f["status"]] = counts.get(f["status"], 0) + 1
    print("  ", counts)
    print("  recognized/uncertain/missing 明细：")
    for name, f in fields.items():
        print(f"   {name:20s} {f['status']}")

    print("\n== 标量字段 ==")
    for t in truth.get("scalars", []):
        f = fields[t["field"]]
        v = verdict(t["exact"], f["value"])
        print(f"   {t['label']:10s} {v:14s} status={f['status']} len(actual)={len(f['value'] or '')}"
              f" len(expected)={len(t['exact'])}")

    print("\n== 列表字段 ==")
    for t in truth.get("lists", []):
        f = fields[t["field"]]
        actual = [a for a in f["value"] if isinstance(a, str)]
        print(f"   {t['label']}: status={f['status']} 条数 expected={len(t['items'])} actual={len(actual)}")
        for i, exp in enumerate(t["items"], 1):
            best = "缺失"
            for a in actual:
                v = verdict(exp, a)
                if v.startswith("正确"):
                    best = v
                    break
                if v == "部分":
                    best = "部分"
            print(f"      第{i}项 {best}")

    print("\n== 全文检索（出现在哪个字段）==")
    pool = list(flatten_strings(fields))
    for t in truth.get("any", []):
        hit = []
        for n in t["needles"]:
            where = sorted({fn for fn, text in pool if norm(n) in norm(text)})
            hit.append(where)
        found = sum(1 for h in hit if h)
        print(f"   {t['label']}: 命中 {found}/{len(t['needles'])}; 落点={sorted({w for h in hit for w in h})}")

    print("\n== 噪声 ==")
    for n in truth.get("noise", []):
        where = sorted({fn for fn, text in pool if n in text})
        print(f"   噪声#{truth['noise'].index(n) + 1} 出现字段={where or '无'}")

    pe = fields["project_experiences"]
    print(f"\n== 项目经历 == status={pe['status']} 段数={len(pe['value'])}"
          f" (expected {truth.get('projects', {}).get('count', '?')})")
    kws = truth.get("projects", {}).get("keywords", [])
    for i, p in enumerate(pe["value"], 1):
        lens = {k: len(v) for k, v in p.items() if isinstance(v, str) and v}
        text = "".join(v for v in p.values() if isinstance(v, str))
        kw = ""
        if i - 1 < len(kws):
            kw = " 行业关键词=" + ("命中" if any(k in text for k in kws[i - 1]) else "未命中")
        print(f"   第{i}段 非空字段长度={lens}{kw}")


def metrics() -> dict:
    expr = (
        "(()=>{const de=document.documentElement;"
        "const ins=[...document.querySelectorAll('input,textarea')].filter(e=>e.getBoundingClientRect().width>0);"
        "const clipped=ins.filter(i=>i.scrollWidth>i.clientWidth+1).length;"
        "const off=[...document.querySelectorAll('button,input,textarea')].filter(e=>{const r=e.getBoundingClientRect();"
        "return r.width>0&&(r.right>innerWidth+1||r.left<-1)}).length;"
        "const bs=[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0&&"
        "getComputedStyle(b).visibility!=='hidden'&&!b.className.includes('ant-modal-close'));"
        "const small=bs.filter(b=>{const r=b.getBoundingClientRect();return r.height<44||r.width<44}).length;"
        "const comp=document.querySelector('.composer-bar,[class*=composer]');"
        "return JSON.stringify({iw:innerWidth,ih:innerHeight,overflowX:de.scrollWidth>innerWidth,"
        "inputs:ins.length,clippedInputs:clipped,offscreenControls:off,buttons:bs.length,"
        "buttonsUnder44:small,composerH:comp?Math.round(comp.getBoundingClientRect().height):null})})()"
    )
    return json.loads(js(expr))


def confirm_all() -> int:
    n = 0
    for _ in range(40):
        ref = find_button("确认本区")
        if not ref:
            break
        click(ref)
        n += 1
        time.sleep(0.8)
    return n


def db_check(data_dir: str, file_dir: str, src: str, draft: dict | None) -> None:
    print("\n== 保存后只读核对 ==")
    r = sqlite3.connect(f"file:{data_dir}/resumes.db?mode=ro", uri=True)
    d = sqlite3.connect(f"file:{data_dir}/drafts.db?mode=ro", uri=True)
    print("   drafts 行数:", d.execute("select count(*) from drafts").fetchone()[0])
    n = r.execute("select count(*) from resumes").fetchone()[0]
    print("   resumes 行数:", n, "| 工作/项目/教育:",
          [r.execute(f"select count(*) from {t}").fetchone()[0]
           for t in ("resume_work_experiences", "resume_project_experiences", "resume_educations")])
    files = sorted(os.listdir(file_dir))
    print("   file/ 条目:", len(files), "tmp 残留:", [f for f in files if f.endswith(".tmp")])
    row = r.execute("select id,name,phone,email,job_title,file_path,file_size,content_type,original_filename,"
                    "highest_education,skills_json,certificates_honors_json from resumes order by created_at desc limit 1").fetchone()
    if not row:
        print("   无记录")
        return
    rid, name, phone, email, jt, fp, fsize, ctype, orig, edu, skills_json, certs_json = row
    stored = os.path.join(file_dir, os.path.basename(fp))
    sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
    print(f"   原始文件: 存在={os.path.exists(stored)} 大小一致={fsize == os.path.getsize(src)}"
          f" 内容sha256一致={os.path.exists(stored) and sha(stored) == sha(src)} content_type={ctype}")
    if draft:
        f = draft["fields"]
        print(f"   与校对结果一致: name={name == f['name']['value']} phone={phone == f['phone']['value']}"
              f" email={email == f['email']['value']} job_title={jt == f['job_title']['value']}"
              f" highest_education={edu == f['highest_education']['value']}"
              f" skills={json.loads(skills_json) == f['skills']['value']}"
              f" certs={json.loads(certs_json) == f['certificates_honors']['value']}")
        pw = r.execute("select count(*) from resume_project_experiences where resume_id=?", (rid,)).fetchone()[0]
        print(f"   项目经历条数 库={pw} 校对={len(f['project_experiences']['value'])}")
    print(f"   手机号位数={len(phone or '')}")


def main() -> int:
    global PAGE
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--url", default="http://127.0.0.1:5173/")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--file-dir", required=True)
    ap.add_argument("--truth")
    ap.add_argument("--shots")
    ap.add_argument("--viewports", default="")
    ap.add_argument("--timeout", type=float, default=150)
    ap.add_argument("--no-submit", action="store_true")
    a = ap.parse_args()

    PAGE = orca("tab", "create", "--url", a.url)["result"]["browserPageId"]
    try:
        orca("viewport", "--page", PAGE, "--width", "1280", "--height", "900")
        time.sleep(2)
        ref = find_button("📎 上传简历")
        if not ref:
            print("没有上传按钮（页面可能处于草稿恢复态）")
            return 2
        shot(a.shots, "01-empty")
        orca("upload", "--page", PAGE, "--element", f"@{ref}", "--files", a.file)
        t0 = time.time()
        time.sleep(1.5)
        shot(a.shots, "02-uploading")
        wait_until("document.body.innerText.includes('项待确认')||document.body.innerText.includes('共 22 项')",
                   a.timeout, "recognition")
        print(f"识别耗时 {time.time() - t0:.1f}s")
        time.sleep(1)
        shot(a.shots, "03-recognized")

        draft = fetch_draft()
        if not draft:
            print("读取草稿失败")
            return 3
        if a.shots:
            with open(os.path.join(a.shots, "draft.json"), "w") as f:  # personal data: stays under /tmp
                json.dump(draft, f, ensure_ascii=False)
            os.chmod(os.path.join(a.shots, "draft.json"), 0o600)
        if a.truth:
            compare(draft, json.load(open(a.truth)))

        for vp in [v for v in a.viewports.split(",") if v]:
            w, h = vp.split("x")
            orca("viewport", "--page", PAGE, "--width", w, "--height", h)
            time.sleep(1)
            js("window.scrollTo(0,0)")
            shot(a.shots, f"vp-{vp}-review")
            print(f"\n== 视口 {vp} ==", metrics())
        if a.viewports:
            orca("viewport", "--page", PAGE, "--width", "1280", "--height", "900")
            time.sleep(1)

        if a.no_submit:
            return 0
        print(f"\n逐区确认 {confirm_all()} 个分区")
        shot(a.shots, "04-final-review")
        ref = find_button("确认提交")
        if not ref:
            print("没有“确认提交”按钮")
            return 4
        click(ref)
        wait_until("document.body.innerText.includes('已保存')", 30, "saved")
        shot(a.shots, "05-saved")
        print("页面显示已保存")
        db_check(a.data_dir, a.file_dir, a.file, draft)
        return 0
    finally:
        orca("tab", "close", "--page", PAGE, check=False)


if __name__ == "__main__":
    sys.exit(main())
