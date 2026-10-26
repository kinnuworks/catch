// Writes eval/review.html: every pre-label shown one by one for a person to accept or correct.
import { readFileSync, writeFileSync } from "node:fs";

const pool = (JSON.parse(readFileSync("eval/pool.json", "utf8")) as { key: string; service: string; text: string }[]).map(({ key, service, text }) => ({ key, service, text }));
const pre = JSON.parse(readFileSync("eval/prelabels.json", "utf8")) as Record<string, string[]>;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Catch: review labels</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;background:#fffbeb;color:#1c1917}
h1{font-size:24px;margin:0 0 4px}.help{color:#57534e;font-size:14px;margin:4px 0 14px}
.s{font-size:19px;background:#fff;border:1px solid #f59e0b;border-radius:12px;padding:16px;margin:12px 0;height:260px;overflow-y:auto}
body{padding-bottom:150px}
.dock{position:fixed;left:0;right:0;bottom:0;background:#fffbeb;border-top:1px solid #fde68a;box-shadow:0 -6px 20px rgba(0,0,0,.06)}
.dock .in{max-width:820px;margin:0 auto;padding:10px 16px 14px}
#btns{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
#btns button{margin:0;padding:10px 4px;font-size:14px}
.row2{display:flex;gap:8px;margin-top:8px}.row2 button{margin:0}
@media (max-width:700px){#btns{grid-template-columns:repeat(4,minmax(0,1fr))}}
.svc{color:#92400e;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
button{font:inherit;margin:4px;padding:8px 12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer}
button.on{background:#1c1917;color:#fff;border-color:#1c1917}
.bar{height:6px;background:#fde68a;border-radius:3px}.bar i{display:block;height:6px;background:#d97706;border-radius:3px}
.accept{background:#16a34a;color:#fff;border-color:#16a34a;font-weight:600}
.changed{color:#b45309;font-weight:600}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:14px;color:#44403c;margin:0}dt{font-weight:600}
</style></head><body>
<h1>Review the labels</h1>
<p class="help">Each sentence comes with a suggested label. If it's right, press <b>Enter</b>. If not, press the number keys to change it, then Enter. You can't skip: every sentence needs a look.</p>
<dl><dt>1</dt><dd>Auto-renews: keeps charging until you cancel</dd><dt>2</dt><dd>Trial turns paid</dd><dt>3</dt><dd>Lock-in: can't cancel (for free) before a minimum period</dd><dt>4</dt><dd>Exit fee: leaving early costs money</dd><dt>5</dt><dd>Cancel rules: notice, a deadline, or a set channel (post, phone, a specific page)</dd><dt>6</dt><dd>No refunds</dd><dt>0</dt><dd>None of these</dd></dl>
<div class="bar" style="margin-top:14px"><i id="bar"></i></div>
<p id="pos"></p>
<div class="s"><div class="svc" id="svc"></div><div id="text"></div></div>
<div class="dock"><div class="in"><div id="btns"></div>
<div class="row2"><button id="prev">← Back</button><button id="ok" class="accept" style="flex:1">Looks right, next (Enter)</button><button id="dl">Download labels</button></div></div></div>
<script>
const POOL=${JSON.stringify(pool)};
const PRE=${JSON.stringify(pre)};
const KINDS=[["auto_renew","1 Auto-renews"],["trial_converts","2 Trial turns paid"],["lock_in","3 Lock-in"],["exit_fee","4 Exit fee"],["cancel_notice","5 Cancel rules"],["no_refund","6 No refunds"],["none","0 None"]];
let st={labels:{},reviewed:{}};try{st=JSON.parse(localStorage.getItem("catch-review-v2")||"")||st}catch{}
const save=()=>{try{localStorage.setItem("catch-review-v2",JSON.stringify(st))}catch{}};
let i=POOL.findIndex(p=>!st.reviewed[p.key]);if(i<0)i=POOL.length-1;
const cur=k=>st.labels[k]||PRE[k];
const same=(a,b)=>[...a].sort().join()==[...b].sort().join();
function toggle(k){const key=POOL[i].key;let s=new Set(cur(key));if(k==="none")s=new Set(["none"]);else{s.delete("none");s.has(k)?s.delete(k):s.add(k);if(!s.size)s.add("none")}st.labels[key]=[...s];save();render()}
function accept(){const key=POOL[i].key;st.labels[key]=cur(key);st.reviewed[key]=true;save();if(i<POOL.length-1)i++;render()}
function render(){const p=POOL[i];document.getElementById("svc").textContent=p.service;document.getElementById("text").textContent=p.text;
const done=POOL.filter(x=>st.reviewed[x.key]).length,changed=POOL.filter(x=>st.reviewed[x.key]&&!same(cur(x.key),PRE[x.key])).length;
document.getElementById("pos").innerHTML=(i+1)+" of "+POOL.length+" · "+done+" reviewed · <span class=changed>"+changed+" changed</span>"+(done===POOL.length?" · <b>All done, click Download labels</b>":"");
document.getElementById("bar").style.width=(100*done/POOL.length)+"%";
document.getElementById("btns").replaceChildren(...KINDS.map(([k,l])=>{const x=document.createElement("button");x.textContent=l;if(cur(p.key).includes(k))x.className="on";x.onclick=()=>toggle(k);return x}))}
document.getElementById("ok").onclick=accept;document.getElementById("prev").onclick=()=>{i=Math.max(0,i-1);render()};
document.getElementById("dl").onclick=()=>{const reviewed=POOL.filter(x=>st.reviewed[x.key]);const out={};for(const x of reviewed)out[x.key]=cur(x.key);
out._meta={method:"pre-labelled by an AI assistant, reviewed one by one by the author",reviewed:reviewed.length,changed:reviewed.filter(x=>!same(cur(x.key),PRE[x.key])).map(x=>x.key)};
const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:"application/json"}));a.download="catch-labels.json";a.click()};
addEventListener("keydown",e=>{if(e.key>="1"&&e.key<="6")toggle(KINDS[+e.key-1][0]);else if(e.key==="0")toggle("none");else if(e.key==="Enter"){e.preventDefault();accept()}else if(e.key==="ArrowLeft"){i=Math.max(0,i-1);render()}});
render();
</script></body></html>`;
writeFileSync("eval/review.html", html);
console.log("wrote eval/review.html");
