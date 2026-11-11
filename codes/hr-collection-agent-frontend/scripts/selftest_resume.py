#!/usr/bin/env python3
"""Self-test scenarios for the resume collection UI (stdlib only; drives the `orca` CLI).

Reuses helpers from drill_resume.py. Holds no personal data: sample/synthetic files, data dirs and the
optional truth file are arguments. Output is verdicts, counts and lengths only - never field values.

  selftest_resume.py SCENARIO --sample S --synth DIR --data-dir D --file-dir F [--truth truth.md]

Scenarios: main | viewports | refresh | dup | overwrite | newchat | errors | hooks
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import time

import drill_resume as d

URL = "http://127.0.0.1:5173/"
RESULTS: list[tuple[str, bool, str]] = []

INSTALL_HOOKS = (
    "(()=>{if(window.__st)return 'ok';window.__st={net:[],con:[],delay:{},fail:{}};"
    "const of=window.fetch;window.fetch=async function(i,o){const u=String(i&&i.url||i);const m=(o&&o.method)||'GET';"
    "const k=m+' '+new URL(u,location.origin).pathname;window.__st.net.push(k);"
    "try{if(o&&typeof o.body==='string'){const b=JSON.parse(o.body);window.__st.net.push(k+' keys='+Object.keys(b.fields||b).sort().join(','))}"
    "else if(o&&o.body instanceof FormData){window.__st.net.push(k+' formdata='+[...o.body.keys()].join(',')+' ct='+(o.headers&&o.headers['Content-Type']||''))}}catch(e){}"
    "const dl=window.__st.delay[k];if(dl)await new Promise(r=>setTimeout(r,dl));"
    "if(window.__st.fail[k])throw new TypeError('injected');return of.apply(this,arguments)};"
    "for(const n of ['log','info','warn','error','debug']){const f=console[n];"
    "console[n]=function(){try{window.__st.con.push(n+':'+[...arguments].map(a=>{try{return typeof a==='string'?a:JSON.stringify(a)}catch(e){return String(a)}}).join(' '))}catch(e){}return f.apply(console,arguments)}}"
    "return 'ok'})()"
)


def rec(tc: str, ok: bool, note: str = "") -> None:
    RESULTS.append((tc, ok, note))
    print(f"{tc} {'PASS' if ok else 'FAIL'} {note}", flush=True)


def txt() -> str:
    return d.js("document.body.innerText") or ""


def jn(expr: str) -> int:
    return int(float(d.js(expr)))


def has(s: str) -> bool:
    return s in txt()


def open_page(w: int = 1280, h: int = 900) -> None:
    d.PAGE = d.orca("tab", "create", "--url", URL)["result"]["browserPageId"]
    d.orca("viewport", "--page", d.PAGE, "--width", str(w), "--height", str(h))
    time.sleep(2)


def hooks() -> None:
    d.js(INSTALL_HOOKS)


def net() -> list[str]:
    return json.loads(d.js("JSON.stringify(window.__st.net)"))


def upload(path: str, wait: float = 3.0) -> None:
    ref = d.find_button("📎 上传简历")
    d.orca("upload", "--page", d.PAGE, "--element", f"@{ref}", "--files", path)
    time.sleep(wait)


def wait_review(timeout: float = 150) -> float:
    t0 = time.time()
    d.wait_until("document.body.innerText.includes('确认本区')", timeout, "review")
    return time.time() - t0


def click_text(label: str) -> bool:
    ref = d.find_button(label)
    if not ref:
        return False
    d.click(ref)
    time.sleep(0.8)
    return True


def sql(db: str, q: str):
    c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return c.execute(q).fetchall()
    finally:
        c.close()


_run = d.subprocess.run


def _run_t(*a, **k):
    k.setdefault("timeout", 90)  # never hang on a stuck orca call
    return _run(*a, **k)


d.subprocess.run = _run_t
_click = d.click


def _click_retry(ref: str) -> None:
    for i in range(8):
        try:
            return _click(ref)
        except RuntimeError as e:
            if "input method" not in str(e) or i == 7:
                raise
            time.sleep(3)


d.click = _click_retry


def open_section(title: str, snap: str | None = None) -> str | None:
    """Ref of the 修改 button that follows the given section heading."""
    seen = False
    for line in (snap if snap is not None else d.snapshot()).splitlines():
        t = line.strip()
        if t.startswith(f'- heading "{title}"'):
            seen = True
        elif seen and t.startswith('- button "修改"'):
            return re.search(r"ref=(e\d+)", t).group(1)
        elif seen and t.startswith("- heading "):
            return None
    return None


def find_ref(role: str, name: str, snap: str | None = None) -> str | None:
    """Ref of the first enabled `- <role> "<name>"` element (values after ':' are never read)."""
    snap = snap if snap is not None else d.snapshot()
    for line in snap.splitlines():
        s = line.strip()
        if s.startswith(f'- {role} "{name}"') and "disabled" not in s.split(":")[0]:
            m = re.search(r"ref=(e\d+)", s)
            if m:
                return m.group(1)
    return None


def fill(label: str, value: str) -> bool:
    ref = find_ref("textbox", label)
    if not ref:
        return False
    d.orca("fill", "--page", d.PAGE, "--element", f"@{ref}", "--value", value)
    time.sleep(0.4)
    return True


def clear_hooks_net() -> None:
    d.js("window.__st.net.length=0")


def storage_empty() -> bool:
    return d.js("(localStorage.length===0&&sessionStorage.length===0&&!document.cookie.includes('draft_token'))") in (True, "true")


def core_truth(path: str) -> dict:
    """Extract name/phone/email from a free-form truth.md (kept in memory only)."""
    t = open(path, encoding="utf-8").read()
    first = t.splitlines()[0]
    return {
        "name": re.match(r"[^（(]+", first).group(0).strip() if re.match(r"[^（(]+", first) else "",
        "phone": (re.search(r"1\d{10}", t) or [""])[0] if re.search(r"1\d{10}", t) else "",
        "email": (re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", t) or [""])[0] if re.search(r"@", t) else "",
    }


def input_value(label: str) -> str:
    """Value of the `- textbox "<label>"` element, read from the accessibility snapshot (never printed)."""
    for line in d.snapshot().splitlines():
        t = line.strip()
        if t.startswith(f'- textbox "{label}"'):
            return t.split("]:", 1)[1].strip() if "]:" in t else ""
    return ""


def scenario_main(a) -> None:
    open_page()
    hooks()
    rec("TC-FE-001-ST-01", has("你好，我是简历录入助手") and jn("document.querySelectorAll('[role=alert]').length") == 0,
        "欢迎页空态，无 alert")
    gets = jn("performance.getEntriesByType('resource').filter(e=>e.name.includes('/resume-drafts/current')).length")
    rec("TC-FE-001-AC-01", gets == 1, f"启动 GET 次数={gets}")
    inp = json.loads(d.js("JSON.stringify([...document.querySelectorAll('input[type=file]')].map(i=>({a:i.accept,m:i.multiple})))"))
    rec("TC-FE-002-RD-01", len(inp) == 1 and not inp[0]["m"] and ".pdf" in inp[0]["a"] and ".png" in inp[0]["a"]
        and has("单个文件 ≤ 10 MB"), "accept 含 pdf/jpg/jpeg/png，无 multiple")
    clear_hooks_net()
    upload(a.sample, wait=2.0)
    loading = has("正在识别，最长约 1 分钟")
    single = jn("(document.body.innerText.match(/正在识别，最长约 1 分钟/g)||[]).length") == 1
    blocked = d.find_button("📎 上传简历") is None  # find_button skips disabled buttons
    rec("TC-FE-002-IA-02", loading and single and blocked, f"加载提示={loading} 唯一={single} 上传禁用={blocked}")
    secs = wait_review()
    posts = [n for n in net() if n.startswith("POST /api/v1/resume-drafts")]
    rec("TC-FE-002-IA-01", has("确认本区"), f"识别耗时 {secs + 2:.1f}s")
    rec("TC-FE-002-AC-01", any("formdata=file" in n for n in posts) and not any("ct=application" in n for n in posts)
        and len([n for n in posts if " keys=" not in n and "formdata" not in n]) == 1, f"POST 记录={len(posts)}")
    draft = d.fetch_draft()
    f = draft["fields"]
    rec("TC-FE-003-RD-01", len(f) == 22 and jn("document.querySelectorAll('h3').length") >= 11,
        f"字段={len(f)} 分区标题={d.js('document.querySelectorAll(\"h3\").length')}")
    cnt = {}
    for v in f.values():
        cnt[v["status"]] = cnt.get(v["status"], 0) + 1
    body = txt()
    want = f"待确认 {cnt.get('recognized', 0)} / 不确定 {cnt.get('uncertain', 0)} / 待补充 {cnt.get('missing', 0)} / 已确认 {cnt.get('confirmed', 0)}"
    rec("TC-FE-003-RD-02", want in body, f"草稿状态计数={cnt}；摘要行与草稿计数一致")
    rec("TC-FE-003-RD-03", "已确认 0" in body and cnt.get("confirmed", 0) == 0, "上传后无字段显示为已确认")
    if a.truth:
        t = core_truth(a.truth)
        got = {k: (f[k]["value"] or "") for k in ("name", "phone", "email")}
        dom = {k: input_value(lb) for k, lb in (("name", "姓名"), ("phone", "手机号"), ("email", "邮箱"))}  # snapshot values
        txt_truth = open(a.truth, encoding="utf-8").read()
        res = {"name": bool(got["name"]) and got["name"] in txt_truth and dom["name"] == got["name"],
               "phone": got["phone"] == t["phone"] and dom["phone"] == t["phone"],
               "email": got["email"] == t["email"] and dom["email"] == t["email"]}
        rec("TC-FE-003-IA-01", all(res.values()), "核心字段与真值一致=" + json.dumps(res) + f" 长度={ {k: len(v) for k, v in got.items()} }")
    pe = len(f["project_experiences"]["value"])
    rec("TC-FE-001-RD-02", jn("(document.body.innerText.match(/项目名称/g)||[]).length") == pe, f"项目经历 草稿={pe} 条与 DOM 一致")
    d.PAGE_KEEP = d.PAGE
    json.dump({"page": d.PAGE}, open(os.path.join(a.synth, "page.json"), "w"))


SUFFIX = "（自测）"


SECTIONS = ["个人信息", "个人优势", "工作经历", "项目经历", "教育背景", "专业技能", "证书与荣誉", "语言能力", "自我评价"]


def confirm_sections() -> int:
    """Open each remaining section (修改) and confirm it (确认本区)."""
    n = 0
    for title in SECTIONS:
        ref = open_section(title)
        if ref:
            d.click(ref)
            time.sleep(0.6)
        ref = find_ref("button", "确认本区")
        if ref:
            d.click(ref)
            n += 1
            time.sleep(0.8)
    return n


def scenario_flow(a) -> dict:
    """Continue on the review page: edit one field, confirm all, final confirm, saved."""
    f0 = d.fetch_draft()["fields"]
    # basic section: confirm; intent section: edit job_title
    rec("TC-FE-004-IA-01", json.loads(d.js("JSON.stringify([...document.querySelectorAll('h3')].map(h=>h.innerText))"))[:3]
        == ["基本信息", "求职意向", "个人信息"], "分区顺序 基本信息→求职意向→个人信息")
    clear_hooks_net()
    click_text("确认本区")
    patches = [n for n in net() if n.startswith("PATCH ") and "keys=" in n]
    keys = patches[0].split("keys=")[1].split(",") if patches else []
    rec("TC-FE-004-AC-01", set(keys) == {"name", "phone", "email", "homepage"}, f"PATCH 键={keys}")
    f1 = d.fetch_draft()["fields"]
    changed = sorted(k for k in f1 if f1[k]["status"] != f0[k]["status"])
    rec("TC-FE-004-IA-02", changed == sorted(keys), f"状态变化字段={changed}")
    # edit intent section
    ref = open_section("求职意向")
    if ref:
        d.click(ref)
        time.sleep(0.8)
    orig = input_value("意向岗位")
    ok = fill("意向岗位", orig + SUFFIX)
    click_text("确认本区")
    edited = d.fetch_draft()["fields"]["job_title"]
    rec("TC-FE-004-IA-03", ok and (edited["value"] or "").endswith(SUFFIX) and edited["status"] == "confirmed",
        f"意向岗位 原长={len(orig)} 新长={len(edited['value'] or '')} 状态={edited['status']}")
    n = confirm_sections()
    print(f"(info) 其余逐区确认 {n} 次")
    body = txt()
    rec("TC-FE-005-IA-01", "已保存" not in body and ("确认提交" in body), "最终确认视图未出现已保存")
    return {"orig": orig}


def scenario_submit(a, orig: str) -> None:
    d.js("window.__st.delay['POST /api/v1/resumes']=3000")
    clear_hooks_net()
    ref = d.find_button("确认提交")
    if not ref:
        rec("TC-FE-005-IA-03", False, "没有确认提交按钮")
        return
    d.click(ref)
    d.orca("click", "--page", d.PAGE, "--element", f"@{ref}", check=False)  # 2nd click during the in-flight request
    seen = []
    for _ in range(5):  # sample the DOM while POST is pending
        seen.append("已保存" in txt())
        time.sleep(0.5)
    posts_mid = len([n for n in net() if n == "POST /api/v1/resumes"])
    rec("TC-FE-005-IA-03", not any(seen), f"返回前 5 次采样均无「已保存」={not any(seen)}")
    d.wait_until("document.body.innerText.includes('已保存')", 30, "saved")
    posts = [n for n in net() if n.startswith("POST /api/v1/resumes")]
    rec("TC-FE-005-AC-01", len([n for n in posts if " keys=" not in n]) == 1
        and any(n.endswith("keys=confirmed") for n in posts), f"POST /resumes 次数={len([n for n in posts if ' keys=' not in n])}")
    body = txt()
    draft_vals = [v for v in (input_value("姓名"),) if v]
    rec("TC-FE-005-IA-04", "上传下一份" in body, "显示已保存 + 上传下一份")
    rows = sql(f"{a.data_dir}/resumes.db", "select count(*) from resumes")[0][0]
    jt = sql(f"{a.data_dir}/resumes.db", "select job_title from resumes order by created_at desc limit 1")[0][0] or ""
    drafts = sql(f"{a.data_dir}/drafts.db", "select count(*) from drafts")[0][0]
    files = os.listdir(a.file_dir)
    tmp = [x for x in files if x.endswith(".tmp")]
    rec("TC-FE-005-AC-02", rows >= 1 and jt.endswith(SUFFIX) and drafts == 0 and not tmp,
        f"resumes={rows} 修改值入库={jt.endswith(SUFFIX)} drafts={drafts} 文件数={len(files)} tmp={len(tmp)}")
    rec("TC-FE-009-SC-01", storage_empty() and d.js("indexedDB.databases().then(x=>x.length===0)") in (True, "true"),
        "localStorage/sessionStorage/IndexedDB 为空，无可读 draft_token")
    origins = d.js("performance.getEntriesByType('resource').every(e=>new URL(e.name).origin===location.origin)")
    rec("TC-FE-009-SC-03", origins in (True, "true"), "所有资源请求同源")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("scenario")
    ap.add_argument("--sample")
    ap.add_argument("--synth")
    ap.add_argument("--data-dir")
    ap.add_argument("--file-dir")
    ap.add_argument("--truth")
    ap.add_argument("--out")
    a = ap.parse_args()
    try:
        if a.scenario == "main":
            scenario_main(a)
            st = scenario_flow(a)
            scenario_submit(a, st["orig"])
        else:
            globals()["scenario_" + a.scenario](a)
    finally:
        if a.out:
            with open(a.out, "a") as fh:
                for tc, ok, note in RESULTS:
                    fh.write(json.dumps({"tc": tc, "ok": ok, "note": note}, ensure_ascii=False) + "\n")
    return 0 if all(ok for _, ok, _ in RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
