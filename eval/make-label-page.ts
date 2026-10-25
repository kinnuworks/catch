// Writes eval/label.html: a self-contained page for labeling the pool by hand.
import { readFileSync, writeFileSync } from "node:fs";

const pool = (JSON.parse(readFileSync("eval/pool.json", "utf8")) as { key: string; service: string; text: string }[])
  .map(({ key, service, text }) => ({ key, service, text }));

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Catch labels</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;background:#fffbeb;color:#1c1917}
.s{font-size:19px;background:#fff;border:1px solid #f59e0b;border-radius:12px;padding:16px;margin:12px 0}
.svc{color:#92400e;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
button{font:inherit;margin:4px;padding:8px 12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer}
button.on{background:#1c1917;color:#fff;border-color:#1c1917}
.help{color:#57534e;font-size:14px}.bar{height:6px;background:#fde68a;border-radius:3px}.bar i{display:block;height:6px;background:#d97706;border-radius:3px}
dl{font-size:14px;color:#44403c}dt{font-weight:600}
</style></head><body>
<h1>Label the fine print</h1>
<p class="help">For each sentence, pick every kind that applies to the customer. Pick <b>None</b> if it puts no cost, delay or restriction on them. Keys: 1–6 toggle, 0 = None, Enter or → = next, ← = back.</p>
<dl>
<dt>1 Auto-renews</dt><dd>keeps charging until you cancel</dd>
<dt>2 Trial turns paid</dt><dd>a free or cheap trial becomes a paid plan</dd>
<dt>3 Lock-in</dt><dd>can't cancel (for free) before a minimum period ends</dd>
<dt>4 Exit fee</dt><dd>leaving early costs money (a fee, or paying the rest of the term)</dd>
<dt>5 Cancel rules</dt><dd>needs advance notice, a deadline, or a specific channel (post, phone)</dd>
<dt>6 No refunds</dt><dd>money already paid isn't returned</dd>
</dl>
<div class="bar"><i id="bar"></i></div>
<p id="pos"></p>
<div class="s"><div class="svc" id="svc"></div><div id="text"></div></div>
<div id="btns"></div>
<p><button id="prev">← Back</button><button id="next">Next →</button> <button id="dl">Download labels</button></p>
<script>
const POOL=${JSON.stringify(pool)};
const KINDS=[["auto_renew","1 Auto-renews"],["trial_converts","2 Trial turns paid"],["lock_in","3 Lock-in"],["exit_fee","4 Exit fee"],["cancel_notice","5 Cancel rules"],["no_refund","6 No refunds"],["none","0 None"]];
let labels={};try{labels=JSON.parse(localStorage.getItem("catch-labels")||"{}")}catch{}
let i=POOL.findIndex(p=>!labels[p.key]);if(i<0)i=0;
const save=()=>{try{localStorage.setItem("catch-labels",JSON.stringify(labels))}catch{}};
function toggle(k){const key=POOL[i].key;let cur=new Set(labels[key]||[]);if(k==="none")cur=new Set(["none"]);else{cur.delete("none");cur.has(k)?cur.delete(k):cur.add(k)}labels[key]=[...cur];save();render()}
function render(){const p=POOL[i];document.getElementById("svc").textContent=p.service;document.getElementById("text").textContent=p.text;
const done=POOL.filter(x=>(labels[x.key]||[]).length).length;document.getElementById("pos").textContent=(i+1)+" of "+POOL.length+" · "+done+" labelled";
document.getElementById("bar").style.width=(100*done/POOL.length)+"%";
const b=document.getElementById("btns");b.replaceChildren(...KINDS.map(([k,l])=>{const x=document.createElement("button");x.textContent=l;if((labels[p.key]||[]).includes(k))x.className="on";x.onclick=()=>toggle(k);return x}))}
const go=d=>{i=Math.max(0,Math.min(POOL.length-1,i+d));render()};
document.getElementById("next").onclick=()=>go(1);document.getElementById("prev").onclick=()=>go(-1);
document.getElementById("dl").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(labels,null,1)],{type:"application/json"}));a.download="catch-labels.json";a.click()};
addEventListener("keydown",e=>{if(e.key>="1"&&e.key<="6")toggle(KINDS[+e.key-1][0]);else if(e.key==="0")toggle("none");else if(e.key==="Enter"||e.key==="ArrowRight")go(1);else if(e.key==="ArrowLeft")go(-1)});
render();
</script></body></html>`;
writeFileSync("eval/label.html", html);
console.log("wrote eval/label.html with", pool.length, "sentences");
