// Applications list: status filter chips + table. Rows open the detail screen.
// Mirrors dc.html L238-269. Filter state is page-local (kept in a closure).
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState, modal, toast, setButtonBusy } from '../ui.js';

const STATUSES = [
  'New', 'In Review', 'Pending Documents', 'Pending Agent Response',
  'Approved', 'Rejected', 'Agreement Signed',
];

export async function renderApplications(mount, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading applications…</div>`;

  let all;
  try {
    all = await api.applications();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load applications.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  let filter = 'all';

  function draw() {
    const counts = { all: all.length };
    STATUSES.forEach((s) => { counts[s] = all.filter((a) => a.status === s).length; });
    const rows = filter === 'all' ? all : all.filter((a) => a.status === filter);

    const chips = ['all', ...STATUSES].map((f) => {
      const selected = f === filter;
      const label = f === 'all' ? 'All' : f;
      const bg = selected ? 'var(--color-primary)' : '#fff';
      const color = selected ? '#fff' : 'var(--color-ink)';
      const border = selected ? 'var(--color-primary)' : 'var(--color-hairline)';
      return `<button class="app-chip" data-filter="${esc(f)}" style="padding:8px 14px;
        border-radius:999px;font-size:13px;font-weight:540;cursor:pointer;background:${bg};
        color:${color};border:1px solid ${border};font-family:inherit;">
        ${esc(label)} <span style="opacity:0.6;margin-left:4px;">${counts[f] || 0}</span></button>`;
    }).join('');

    const body = rows.length ? rows.map((a) => `
      <div class="app-row" data-id="${a.id}" style="display:grid;
        grid-template-columns:2fr 1.4fr 1fr 1fr 1.2fr 120px;padding:14px 20px;
        border-bottom:1px solid var(--color-hairline);font-size:13px;align-items:center;cursor:pointer;">
        <div>
          <div style="font-weight:540;color:var(--color-ink);">${esc(a.business)}</div>
          <div style="color:var(--color-ink-faint);font-size:11px;">App-${a.id} · ${esc(a.contact)}</div>
        </div>
        <div style="color:var(--color-ink-mute);">
          <div>${esc(a.email)}</div>
          <div style="font-size:11px;color:var(--color-ink-faint);">${esc(a.phone)}</div>
        </div>
        <div style="color:var(--color-ink-mute);"><span style="margin-right:6px;">${esc(a.flag)}</span>${esc(a.country)}</div>
        <div style="color:var(--color-ink-mute);">
          <div>${esc(a.date)}</div>
          <div style="font-size:11px;color:var(--color-ink-faint);">${esc(a.age)}</div>
        </div>
        <div>${statusPill(a.status)}</div>
        <div style="text-align:right;display:flex;gap:12px;justify-content:flex-end;align-items:center;">
          <button class="app-del" data-id="${a.id}" data-name="${esc(a.business)}" title="Remove application"
            style="background:none;border:none;color:#a12020;font-size:13px;font-weight:540;cursor:pointer;font-family:inherit;padding:2px 2px;">Delete</button>
          <span style="color:var(--color-primary);font-weight:600;">Review →</span>
        </div>
      </div>`).join('') : `<div style="padding:32px;text-align:center;color:var(--color-ink-mute);font-size:13px;">No applications with status “${esc(filter)}”.</div>`;

    mount.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="font-size:13px;color:var(--color-ink-mute);">${all.length} application(s) · offline or online intake</div>
        <button id="btn-upload" style="padding:9px 16px;background:var(--color-primary);color:#fff;border:none;
          border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">⬆ Upload application</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">${chips}</div>
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:2fr 1.4fr 1fr 1fr 1.2fr 120px;padding:14px 20px;
          background:var(--color-canvas-soft);font-size:11px;font-weight:600;color:var(--color-ink-mute);
          text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid var(--color-hairline);">
          <div>Business</div><div>Contact</div><div>Country</div><div>Submitted</div><div>Status</div>
          <div style="text-align:right;">Actions</div>
        </div>
        ${body}
      </div>`;

    mount.querySelectorAll('.app-chip').forEach((c) =>
      c.addEventListener('click', () => { filter = c.dataset.filter; draw(); }));
    mount.querySelectorAll('.app-row').forEach((r) =>
      r.addEventListener('click', () => navigate(`application/${r.dataset.id}`)));
    mount.querySelectorAll('.app-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();  // don't open the row while deleting it
      confirmDelete(b.dataset.id, b.dataset.name);
    }));
    mount.querySelector('#btn-upload').addEventListener('click', openUpload);
  }

  function confirmDelete(id, name) {
    modal({
      title: 'Remove application',
      bodyHtml: `<div style="font-size:14px;color:var(--color-ink-mute);line-height:1.5;">
        Permanently remove <b>${esc(name)}</b> (App-${esc(id)}) and all of its review data?
        This cannot be undone.</div>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Remove', kind: 'danger', keepOpen: true, onClick: async (overlay) => {
          const restore = setButtonBusy(overlay.querySelectorAll('[data-actions] button')[1], 'Removing…');
          try {
            await api.deleteApplication(id);
            all = all.filter((a) => String(a.id) !== String(id));
            overlay.remove();
            toast(`App-${id} removed`);
            draw();
          } catch {
            restore();
            toast('Could not remove the application.');
          }
        } },
      ],
    });
  }

  function field(id, label, placeholder, type = 'text') {
    return `<label style="display:block;margin-bottom:12px;">
      <span style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">${esc(label)}</span>
      <input id="${id}" type="${type}" placeholder="${esc(placeholder)}" style="width:100%;padding:11px 14px;
        border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-family:inherit;background:#fff;outline:none;">
    </label>`;
  }

  function openUpload() {
    modal({
      title: 'Upload application',
      bodyHtml: `
        <div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:16px;">
          Attach the filled application-form <b>PDF</b> to auto-extract and verify the fields, or
          enter the basic details manually. Either way the application lands in <b>In Review</b>.</div>
        <label style="display:block;margin-bottom:16px;">
          <span style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">Application PDF <span style="color:var(--color-ink-faint);font-weight:400;">(optional)</span></span>
          <input id="up-file" type="file" accept="application/pdf,.pdf"
            style="width:100%;font-size:13px;font-family:inherit;padding:9px 0;">
          <span style="display:block;font-size:11px;color:var(--color-ink-faint);margin-top:4px;">When attached, the company name and other fields are read from the PDF on upload.</span>
        </label>
        ${field('up-business', 'Business / agency name', 'Sunrise Overseas Consultants')}
        ${field('up-contact', 'Primary contact', 'Ananya Iyer')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          ${field('up-email', 'Email', 'contact@agency.com', 'email')}
          ${field('up-phone', 'Phone', '+91 98333 71120')}
        </div>
        ${field('up-country', 'Country', 'India')}`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Create & review', kind: 'primary', keepOpen: true, onClick: async (overlay) => {
          const val = (id) => overlay.querySelector(`#${id}`).value.trim();
          const fileInput = overlay.querySelector('#up-file');
          const file = fileInput && fileInput.files[0];
          const business = val('up-business');
          if (!file && !business) { toast('Attach a PDF or enter a business name'); return; }
          const restore = setButtonBusy(overlay.querySelectorAll('[data-actions] button')[1], file ? 'Uploading…' : 'Creating…');
          try {
            let id;
            if (file) {
              const fd = new FormData();
              fd.append('file', file);
              fd.append('business', business);  // optional; PDF fills the rest
              fd.append('contact', val('up-contact'));
              fd.append('email', val('up-email'));
              fd.append('phone', val('up-phone'));
              fd.append('country', val('up-country'));
              const res = await api.uploadApplication(fd);
              id = res.application.id;
            } else {
              const created = await api.createApplication({
                business,
                contact: val('up-contact'), email: val('up-email'),
                phone: val('up-phone'), country: val('up-country'),
              });
              id = created.id;
            }
            overlay.remove();
            toast(`App-${id} created · in review`);
            navigate(`application/${id}`);
          } catch (err) {
            restore();
            const msg = err instanceof ApiError && err.detail ? err.detail : 'Could not create the application.';
            toast(typeof msg === 'string' ? msg : 'Could not create the application.');
          }
        } },
      ],
    });
  }

  draw();
}
