// Marketing collateral (M3): the single source of truth shared with every agent.
// Browse the latest version of each asset and download it. Visible to both admin
// and agent roles. Version history is out of scope for M3 (only the latest ships).
import { api, ApiError } from '../api.js';
import { esc, emptyState, toast } from '../ui.js';

const CATEGORY_ICON = {
  'Course guide': '📘', 'Fee schedule': '💵', 'Handbook': '📗', 'Brochure': '📄',
};

export async function renderMarketing(mount) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading collateral…</div>`;

  let assets;
  try {
    assets = await api.marketing();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load marketing collateral.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  if (!assets.length) {
    mount.innerHTML = emptyState({ icon: '📁', title: 'No collateral yet', hint: 'Published marketing assets will appear here.' });
    return;
  }

  const cards = assets.map((a) => `
    <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="font-size:28px;line-height:1;">${CATEGORY_ICON[a.category] || '📄'}</div>
        <div style="flex:1;">
          <div style="font-weight:600;font-size:15px;color:var(--color-ink);line-height:1.3;">${esc(a.title)}</div>
          <div style="font-size:12px;color:var(--color-ink-mute);margin-top:3px;">${esc(a.category)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;">
        <div style="font-size:11px;color:var(--color-ink-faint);">
          <span style="font-weight:600;color:var(--color-ink-mute);">${esc(a.version)}</span> · updated ${esc(a.updated)}</div>
        <button class="mk-dl" data-id="${a.id}"
          style="padding:8px 14px;background:var(--color-primary);color:#fff;border:none;border-radius:8px;
            font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">⬇ Download</button>
      </div>
    </div>`).join('');

  mount.innerHTML = `
    <div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:16px;">
      ${assets.length} asset(s) · always the latest approved version</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">${cards}</div>`;

  mount.querySelectorAll('.mk-dl').forEach((b) => b.addEventListener('click', async () => {
    const label = b.textContent;
    b.disabled = true; b.textContent = 'Downloading…';
    try {
      const filename = await api.downloadMarketing(b.dataset.id);
      toast(`Downloaded ${filename}`);
    } catch {
      toast('Could not download this asset.');
    } finally {
      b.disabled = false; b.textContent = label;
    }
  }));
}
