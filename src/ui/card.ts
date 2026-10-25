import { formatMoney } from "../core/facts";
import type { ExitPlan } from "../core/exitPlan";
import { googleCalendarLink, toICS } from "../core/ics";
import type { Finding, TrapKind } from "../core/types";

const ICONS: Record<TrapKind, string> = {
  exit_fee: "💸",
  lock_in: "🔒",
  trial_converts: "⏳",
  cancel_notice: "✉️",
  auto_renew: "🔁",
  no_refund: "🚫",
};

const LABELS: Record<TrapKind, string> = {
  exit_fee: "Exit fee",
  lock_in: "Lock-in",
  trial_converts: "Trial turns paid",
  cancel_notice: "Cancel rules",
  auto_renew: "Auto-renews",
  no_refund: "No refunds",
};

const STYLE = `
:host { all: initial; }
.card { font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1917; background: #fffbeb;
  border: 1px solid #f59e0b; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.18); width: 320px; overflow: hidden; }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fef3c7; font-weight: 600; }
.head .what { flex: 1; }
.head .who { font-weight: 400; font-size: 11px; color: #78350f; }
.close { all: unset; cursor: pointer; padding: 0 4px; color: #78350f; font-size: 16px; }
ul { list-style: none; margin: 0; padding: 6px 0; }
li { display: grid; grid-template-columns: 22px 1fr; gap: 6px; padding: 7px 12px; cursor: pointer; }
li:hover { background: #fef3c7; }
.kind { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #92400e; }
.plain { font-size: 14px; font-weight: 600; }
.quote { display: none; margin-top: 4px; font-size: 12px; color: #44403c; border-left: 3px solid #f59e0b; padding-left: 8px; font-style: italic; }
li.open .quote { display: block; }
.foot { padding: 8px 12px 10px; font-size: 11px; color: #57534e; border-top: 1px solid #fde68a; }
.plan { padding: 10px 12px; }
.plan h3 { margin: 0 0 6px; font-size: 14px; }
.plan ol { margin: 0 0 8px; padding-left: 18px; }
.plan li { display: list-item; padding: 2px 0; cursor: default; }
.plan li:hover { background: none; }
.btns { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { all: unset; cursor: pointer; background: #1c1917; color: #fff; border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
.btn.alt { background: #fff; color: #1c1917; border: 1px solid #d6d3d1; }
.empty { padding: 10px 12px; }
@media (prefers-color-scheme: dark) {
  .card { background: #1c1917; color: #fafaf9; border-color: #b45309; }
  .head { background: #292524; } .head .who, .close, .kind { color: #fcd34d; }
  li:hover { background: #292524; } .quote { color: #d6d3d1; } .foot { color: #a8a29e; border-color: #44403c; }
  .btn { background: #fafaf9; color: #1c1917; } .btn.alt { background: #292524; color: #fafaf9; border-color: #57534e; }
}`;

export interface CardOptions {
  findings: Finding[];
  checkedBy: string;
  /** Called when a line is clicked, so the host page can scroll to the quote. */
  onQuote?: (f: Finding) => void;
  onClose?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export class CatchCard {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly body: HTMLElement;

  constructor() {
    this.host = el("div", { "data-catch": "card" });
    this.root = this.host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = STYLE;
    this.body = el("div", { class: "card", role: "dialog", "aria-label": "Catch: what the terms say" });
    this.root.append(style, this.body);
  }

  private header(title: string, who: string, onClose?: () => void): HTMLElement {
    const head = el("div", { class: "head" });
    head.append(el("span", {}, "🪝"), el("span", { class: "what" }, title), el("span", { class: "who" }, who));
    const close = el("button", { class: "close", "aria-label": "Close" }, "×");
    close.addEventListener("click", () => onClose?.());
    head.append(close);
    return head;
  }

  renderLoading(message: string): void {
    this.body.replaceChildren(this.header("Reading the terms…", ""), el("div", { class: "empty" }, message));
  }

  renderFindings({ findings, checkedBy, onQuote, onClose }: CardOptions): void {
    if (findings.length === 0) {
      this.body.replaceChildren(this.header("No catch found", checkedBy, onClose), el("div", { class: "empty" }, "Nothing about renewals, lock-ins or exit fees in the terms on this page."));
      return;
    }
    const list = el("ul");
    for (const f of findings) {
      const item = el("li", { tabindex: "0" });
      const text = el("div");
      text.append(el("div", { class: "kind" }, LABELS[f.kind]), el("div", { class: "plain" }, f.plain), el("div", { class: "quote" }, `"${f.quote}"`));
      item.append(el("span", { "aria-hidden": "true" }, ICONS[f.kind]), text);
      const open = () => {
        item.classList.toggle("open");
        onQuote?.(f);
      };
      item.addEventListener("click", open);
      item.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && open());
      list.append(item);
    }
    const foot = el("div", { class: "foot" }, "Tap a line to see the exact sentence. Read on this laptop; nothing was sent anywhere.");
    this.body.replaceChildren(this.header(findings.length === 1 ? "1 catch" : `${findings.length} catches`, checkedBy, onClose), list, foot);
  }

  renderPlan(plan: ExitPlan, service: string, url: string, onClose?: () => void): void {
    const box = el("div", { class: "plan" });
    box.append(el("h3", {}, "Your exit plan"));
    const steps = el("ol");
    for (const s of plan.steps) steps.append(el("li", {}, s));
    box.append(steps);
    const btns = el("div", { class: "btns" });
    const ics = el("button", { class: "btn" }, "Add to calendar");
    ics.addEventListener("click", () => {
      const blob = new Blob([toICS(plan, service, url)], { type: "text/calendar" });
      const a = el("a", { href: URL.createObjectURL(blob), download: `catch-${service.toLowerCase().replace(/\W+/g, "-")}.ics` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    btns.append(ics);
    const g = googleCalendarLink(plan, service, url);
    if (g) {
      const link = el("a", { class: "btn alt", href: g, target: "_blank", rel: "noopener" }, "Google Calendar");
      btns.append(link);
    }
    box.append(btns);
    const fee = plan.exitFee ? ` Leaving early costs ${formatMoney(plan.exitFee)}.` : "";
    this.body.replaceChildren(this.header("Before you go in", service, onClose), box, el("div", { class: "foot" }, `Dates come from the quoted terms.${fee}`));
  }

  /** Pins the card next to an element and keeps it there on scroll and resize. */
  anchorTo(target: Element): () => void {
    Object.assign(this.host.style, { position: "absolute", zIndex: "2147483647" });
    const place = () => {
      const r = target.getBoundingClientRect();
      const width = 320;
      const right = r.right + 12 + width < window.innerWidth;
      const left = right ? r.right + 12 : Math.max(8, r.left + r.width / 2 - width / 2);
      const top = right ? r.top + r.height / 2 - 60 : r.bottom + 12;
      this.host.style.left = `${left + window.scrollX}px`;
      this.host.style.top = `${Math.max(8, top) + window.scrollY}px`;
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    if (!this.host.isConnected) document.body.append(this.host);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }

  remove(): void {
    this.host.remove();
  }
}
