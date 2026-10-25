import type { FromPomelo, ToPomelo } from "./pomelo";

if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
}

const frame = document.getElementById("pomelo") as HTMLIFrameElement;
const status = document.getElementById("try-status")!;
const meter = status.querySelector<HTMLElement>(".meter")!;
const out = document.getElementById("paste-out")!;
const send = (msg: ToPomelo) => frame.contentWindow?.postMessage(msg, location.origin);

function setStatus(text: string, progress?: number) {
  status.firstChild!.textContent = text;
  if (progress === undefined || progress >= 100) meter.hidden = true;
  else {
    meter.hidden = false;
    meter.querySelector("i")!.style.width = `${progress}%`;
  }
}

window.addEventListener("message", (e: MessageEvent<FromPomelo>) => {
  if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
  const msg = e.data;
  if (msg.type === "catch-status") setStatus(msg.text, msg.progress);
  if (msg.type === "catch-paste-result") {
    out.replaceChildren();
    if (msg.findings.length === 0) {
      out.textContent = "No renewal, lock-in or exit-fee clauses found.";
      return;
    }
    for (const f of msg.findings) {
      const row = document.createElement("div");
      row.className = "row";
      const b = document.createElement("b");
      b.textContent = f.plain;
      const q = document.createElement("q");
      q.textContent = f.quote;
      row.append(b, q);
      out.append(row);
    }
    if (msg.steps.length) {
      const p = document.createElement("p");
      p.className = "t-small";
      p.textContent = `If you signed up today: ${msg.steps.join(" ")}`;
      out.append(p);
    }
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-reader]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-reader]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    send({ type: "catch-reader", reader: btn.dataset.reader! });
  });
});

document.getElementById("read-paste")!.addEventListener("click", () => {
  const text = (document.getElementById("paste") as HTMLTextAreaElement).value.trim();
  if (!text) return;
  out.textContent = "Reading…";
  send({ type: "catch-paste", text });
});
