// Downloads each service's terms once and stores readable text in eval/cache.
import { DOMParser } from "linkedom";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { htmlToText } from "../src/page/detect";

(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser;
const sources = JSON.parse(readFileSync("eval/sources.json", "utf8")) as [string, string][];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

const rows: { name: string; url: string; chars: number; status: string }[] = [];
await Promise.all(sources.map(async ([name, url]) => {
  const file = `eval/cache/${name.replace(/\W+/g, "_")}.txt`;
  if (existsSync(file)) return rows.push({ name, url, chars: readFileSync(file, "utf8").length, status: "cached" });
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en" }, signal: AbortSignal.timeout(25000) });
    const text = htmlToText(await res.text());
    if (res.ok && text.length > 3000) writeFileSync(file, `${name}\n${url}\n\n${text}`);
    rows.push({ name, url, chars: text.length, status: String(res.status) });
  } catch (err) {
    rows.push({ name, url, chars: 0, status: String(err).slice(0, 40) });
  }
}));
rows.sort((a, b) => b.chars - a.chars);
for (const r of rows) console.log(r.chars.toString().padStart(7), r.status.padEnd(8), r.name);
console.log("usable:", rows.filter((r) => r.chars > 3000).length);
