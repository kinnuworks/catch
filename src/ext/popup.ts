import { send, type Reader, type SavedPlan } from "./messages";

const select = document.getElementById("reader") as HTMLSelectElement;
const status = document.getElementById("status")!;
const plansBox = document.getElementById("plans")!;

async function refresh() {
  const s = await send({ type: "status" });
  select.value = s.reader;
  if (!s.webgpu) status.textContent = "No WebGPU here, so Catch uses its rules.";
  else if (s.reader === "rules") status.textContent = "Rules only. Pick a Gemma model for better reading.";
  else status.textContent = s.ready ? "Model loaded. Everything runs on this laptop." : `Downloading once: ${s.progress ?? 0}%`;
}

select.addEventListener("change", async () => {
  await chrome.storage.local.set({ reader: select.value as Reader });
  void refresh();
});

async function showPlans() {
  const { plans = [] } = (await chrome.storage.local.get("plans")) as { plans?: SavedPlan[] };
  if (plans.length === 0) return;
  plansBox.replaceChildren(
    ...plans.map((p) => {
      const box = document.createElement("div");
      box.className = "plan";
      const title = document.createElement("strong");
      title.textContent = `${p.service} · ${new Date(p.savedAt).toLocaleDateString()}`;
      const list = document.createElement("ol");
      for (const step of p.steps) {
        const li = document.createElement("li");
        li.textContent = step;
        list.append(li);
      }
      box.append(title, list);
      return box;
    }),
  );
}

void refresh();
void showPlans();
setInterval(refresh, 1000);
