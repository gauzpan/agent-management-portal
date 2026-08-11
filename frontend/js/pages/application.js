// Application detail (M2.6): real extraction review. Driven by the /review
// payload (sections + extracted fields + summary + gate). The main column is the
// dominant content area (summary → per-section sign-off → extracted fields); the
// right rail is a single, subtle **review timeline** that is the one source of
// truth for section navigation (replacing the old horizontal tabs + checklist).
// Needs-attention and Advisory AI insights are surfaced on demand as modals.
// Fields are inline-editable (correction preserves the original OCR value). Apps
// without a source PDF fall back to the M2.5 simulated signals view.
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState, modal, toast, dualBadge, signalIcon,
  confidenceBucketChip, sourcePage } from '../ui.js';

export async function renderApplication(mount, id, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading application…</div>`;

  let data, review;
  try {
    [data, review] = await Promise.all([api.getApplication(id), api.getReview(id)]);
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 404
      ? `Application ${id} was not found.` : 'Could not load this application.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Unable to open', hint: msg });
    return;
  }

  let app = data.application;
  let tab = null;
  let processing = false;
  let editingKey = null;   // key of the field currently being corrected inline
  let editingRef = null;   // ref_key whose feedback is being entered/edited inline
  // Post-approval statuses put the review into a READ-ONLY mode and surface the
  // agreement workflow (send → sign → verify → invite). Set in draw() from status.
  const POST_APPROVAL = ['Agreement Sent', 'Agreement Signed', 'Active'];
  let readOnly = false;
  async function reloadAll() {
    [data, review] = await Promise.all([api.getApplication(id), api.getReview(id)]);
    app = data.application;
  }

  // Field-groups roll up into reviewer-facing tabs (mirrors backend review_build).
  const TAB_OF_GROUP = {
    business: 'company_overview', people: 'company_overview', credentials: 'company_overview',
    compliance: 'compliance', recruitment: 'recruitment', references: 'references',
    declaration: 'declaration',
  };
  const SUBGROUP_LABEL = { business: 'Business', people: 'Directors & People', credentials: 'Credentials' };
  const SUBGROUP_ORDER = ['business', 'people', 'credentials'];
  const DOCS_TAB = 'attached_documents';  // synthetic nav section for uploaded docs

  const attachedDocs = () => (data.documents || []).filter((d) => d.file);
  async function reloadApp() { data = await api.getApplication(id); }

  const sections = () => review.sections || [];
  const tabOf = (f) => TAB_OF_GROUP[f.group] || f.group;
  const fieldsFor = (key) => (review.fields || []).filter((f) => tabOf(f) === key);
  const sectionByKey = (k) => sections().find((s) => s.section_key === k);
  const isScanned = () => sections().length > 0;
  async function reloadReview() { review = await api.getReview(id); }

  // Section navigation order = timeline order (Attached documents in the 2nd slot).
  const labelOf = (k) => (k === DOCS_TAB ? 'Attached documents' : (sectionByKey(k) || {}).label || k);
  function navOrder() {
    const keys = sections().map((s) => s.section_key);
    keys.splice(1, 0, DOCS_TAB);
    return keys;
  }
  function nextTab(current) {
    const order = navOrder();
    const i = order.indexOf(current);
    return (i >= 0 && i < order.length - 1) ? order[i + 1] : null;
  }

  // Fields that need a reviewer's attention (same rule as the backend summary).
  function needsAttentionFields() {
    return (review.fields || []).filter((f) => {
      const v = f.validation || {};
      return v.ok === false || v.level === 'flag' || v.level === 'fail' || f.confidence < 0.60;
    }).map((f) => ({
      label: f.label, tab: tabOf(f),
      tabLabel: (sectionByKey(tabOf(f)) || {}).label || tabOf(f),
      reason: (f.validation || {}).message || 'Low legitimacy — verify the value',
      level: (f.validation || {}).level || (f.confidence < 0.60 ? 'flag' : 'pass'),
    }));
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmtScan = (iso) => {
    if (!iso) return '';
    const [d, t = ''] = String(iso).split('T');
    const [y, m, day] = d.split('-').map(Number);
    return y ? `${day} ${MONTHS[m - 1]} ${y} · ${t.slice(0, 5)}` : iso;
  };

  // ---- extracted-field rendering -------------------------------------------
  function fieldRow(f) {
    const v = f.validation || {};
    const levelColor = v.level === 'fail' ? '#a12020' : v.level === 'flag' ? '#8a6b00' : 'var(--color-ink-faint)';
    const ext = v.verify_externally && v.portal_url
      ? `<a href="${esc(v.portal_url)}" target="_blank" rel="noopener" style="font-size:11px;">Verify externally: ${esc(v.portal)} ↗</a>` : '';
    const msg = v.message ? `<span style="font-size:11px;color:${levelColor};">${esc(v.message)}</span>` : '';
    const editedTag = f.corrected
      ? `<span title="Corrected by reviewer — original OCR: ${esc(f.ocr_value) || '—'}" style="font-size:9px;color:#00843d;">✎ edited</span>` : '';

    // Editing state: swap the value cell for an input with Save / Cancel.
    if (editingKey === f.key) {
      return `<div style="display:grid;grid-template-columns:220px 1fr auto;gap:14px;padding:11px 0;
          border-top:1px solid #f3f0eb;font-size:13px;align-items:start;">
          <div style="color:var(--color-ink-mute);font-weight:540;">${esc(f.label)} ${editedTag}</div>
          <div>
            <textarea class="fld-input" data-key="${esc(f.key)}" rows="1" style="width:100%;padding:7px 10px;border:1px solid var(--color-teal-deep);border-radius:7px;font-size:13px;font-family:inherit;resize:vertical;">${esc(f.value)}</textarea>
            <div style="display:flex;gap:8px;margin-top:7px;">
              <button class="fld-save" data-key="${esc(f.key)}" style="padding:5px 12px;background:var(--color-teal-deep);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>
              <button class="fld-cancel" style="padding:5px 12px;background:#fff;color:var(--color-ink-mute);border:1px solid var(--color-hairline);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>
              ${f.corrected ? `<span style="font-size:11px;color:var(--color-ink-faint);align-self:center;">Original: ${esc(f.ocr_value) || '—'}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">${sourcePage(f.page)} ${confidenceBucketChip(f.confidence)}</div>
        </div>`;
    }

    return `<div style="display:grid;grid-template-columns:220px 1fr auto;gap:14px;padding:11px 0;
        border-top:1px solid #f3f0eb;font-size:13px;align-items:start;">
        <div style="color:var(--color-ink-mute);font-weight:540;">${esc(f.label)} ${editedTag}</div>
        <div>
          <div style="color:var(--color-ink);display:flex;align-items:center;gap:8px;">
            <span>${esc(f.value) || '<span style="color:var(--color-ink-faint);">—</span>'}</span>
            ${readOnly ? '' : `<button class="fld-edit" data-key="${esc(f.key)}" title="Correct this value" style="opacity:0.5;background:none;border:none;cursor:pointer;font-size:12px;padding:0;line-height:1;">✎</button>`}
          </div>
          <div style="display:flex;gap:10px;align-items:center;margin-top:3px;flex-wrap:wrap;">${msg}${ext}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">${sourcePage(f.page)} ${confidenceBucketChip(f.confidence)}</div>
      </div>`;
  }

  function signalsBlock(key) {
    const sec = sectionByKey(key);
    if (!sec || !sec.signals) return '';
    const rows = sec.signals.map((s) => `
      <div style="display:flex;gap:10px;padding:9px 0;border-top:1px solid #f3f0eb;align-items:flex-start;">
        ${signalIcon(s.status)}
        <div style="flex:1;"><div style="font-size:13px;font-weight:540;">${esc(s.label)}
          <span style="font-size:10px;color:var(--color-ink-faint);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;margin-left:6px;">${esc(s.automation)}</span></div>
          ${s.note ? `<div style="font-size:12px;color:var(--color-ink-mute);margin-top:2px;">${esc(s.note)}</div>` : ''}
        </div></div>`).join('');
    return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px 24px;margin-top:16px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);">Automated checks (system)</div>${rows}</div>`;
  }

  // ---- referee feedback (References tab) -----------------------------------
  const EMAIL_RE = /[\w.\-]+@[\w.\-]+\.\w+/;
  const feedbackByRef = () => Object.fromEntries(
    (review.references_feedback || []).map((r) => [r.ref_key, r]));

  function refParse(f) {
    const val = f.value || '';
    const email = (val.match(EMAIL_RE) || [''])[0];
    const name = (val.split(/[·|\n]/)[0] || '').trim() || f.label;
    return { name, email, full: val };
  }

  function refereeFeedbackPanel() {
    const refFields = fieldsFor('references').filter((f) => f.group === 'references');
    if (!refFields.length) return '';
    const fb = feedbackByRef();
    const statusChip = (st) => {
      const map = { received: ['#00843d', '#e9f5ee', 'Feedback received'],
        requested: ['#8a6b00', '#fbf3df', 'Request sent · awaiting reply'],
        pending: ['#73706d', '#f0efec', 'Not requested'] };
      const [c, bg, label] = map[st] || map.pending;
      return `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:${c};background:${bg};padding:2px 8px;border-radius:999px;">${label}</span>`;
    };

    const cards = refFields.map((f) => {
      const p = refParse(f);
      const row = fb[f.key] || { status: 'pending', feedback: '', ref_key: f.key };
      const editing = editingRef === f.key;

      const contact = `${p.email ? `<a href="mailto:${esc(p.email)}" style="font-size:12px;">${esc(p.email)}</a>` : '<span style="font-size:12px;color:var(--color-ink-faint);">no email on form</span>'}`;

      // The received feedback (read view).
      const received = row.status === 'received' && row.feedback && !editing ? `
        <div style="background:var(--color-canvas-soft);border-left:3px solid #00843d;border-radius:0 8px 8px 0;padding:12px 14px;margin-top:10px;">
          <div style="font-size:13px;color:var(--color-ink);line-height:1.5;white-space:pre-wrap;">${esc(row.feedback)}</div>
          <div style="font-size:11px;color:var(--color-ink-faint);margin-top:8px;">Recorded${row.updated_by ? ` by ${esc(row.updated_by)}` : ''}${row.received_at ? ` · ${fmtScan(row.received_at)}` : ''}</div>
        </div>
        <div style="margin-top:8px;"><button class="ref-enter" data-key="${esc(f.key)}" style="font-size:12px;color:var(--color-teal-deep);background:none;border:none;cursor:pointer;font-weight:600;padding:0;">✎ Edit feedback</button></div>` : '';

      // The inline editor.
      const editor = editing ? `
        <textarea class="ref-input" data-key="${esc(f.key)}" rows="4" placeholder="Paste or type the feedback received from ${esc(p.name)}…"
          style="width:100%;margin-top:10px;padding:10px 12px;border:1px solid var(--color-teal-deep);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;">${esc(row.feedback || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="ref-save" data-key="${esc(f.key)}" data-name="${esc(p.name)}" style="padding:6px 14px;background:var(--color-teal-deep);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Save feedback</button>
          <button class="ref-cancel" style="padding:6px 14px;background:#fff;color:var(--color-ink-mute);border:1px solid var(--color-hairline);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>
        </div>` : '';

      // Actions when there's nothing recorded yet.
      const actions = (row.status !== 'received' && !editing) ? `
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;">
          <button class="ref-request" data-key="${esc(f.key)}" data-name="${esc(p.name)}" ${!p.email ? 'disabled title="No email on the application form"' : ''}
            style="padding:6px 12px;background:#fff;color:var(--color-teal-deep);border:1px solid var(--color-hairline);border-radius:7px;font-size:12px;font-weight:600;cursor:${p.email ? 'pointer' : 'not-allowed'};opacity:${p.email ? 1 : 0.5};">
            ✉ ${row.status === 'requested' ? 'Resend request' : 'Request via email'}</button>
          <button class="ref-enter" data-key="${esc(f.key)}" style="padding:6px 12px;background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">+ Enter feedback manually</button>
          ${row.status === 'requested' && row.requested_at ? `<span style="font-size:11px;color:var(--color-ink-faint);">Requested ${fmtScan(row.requested_at)}</span>` : ''}
        </div>` : '';

      return `<div style="padding:16px 0;border-top:1px solid #f3f0eb;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;">
          <div><span style="font-size:14px;font-weight:600;color:var(--color-ink);">${esc(p.name)}</span>
            <span style="font-size:11px;color:var(--color-ink-faint);margin-left:6px;">${esc(f.label)}</span></div>
          ${statusChip(row.status)}
        </div>
        <div style="margin-top:2px;">${contact}</div>
        ${received}${editor}${actions}
      </div>`;
    }).join('');

    return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;margin-top:16px;">
      <div style="font-family:var(--font-display);font-weight:540;font-size:16px;margin-bottom:2px;">Referee feedback</div>
      <div style="font-size:12px;color:var(--color-ink-mute);margin-bottom:4px;">Request a reference by email, or record the written feedback received from each referee.</div>
      ${cards}
    </div>`;
  }

  function sectionPanel(key) {
    const extra = key === 'references' ? refereeFeedbackPanel() : '';
    const fields = fieldsFor(key);
    if (fields.length) {
      // The consolidated overview tab keeps Business / Directors / Credentials as subheadings.
      let inner;
      if (key === 'company_overview') {
        inner = SUBGROUP_ORDER.map((g) => {
          const sub = fields.filter((f) => f.group === g);
          if (!sub.length) return '';
          return `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;
              color:var(--color-ink-mute);margin:18px 0 2px;">${esc(SUBGROUP_LABEL[g])}</div>
            ${sub.map(fieldRow).join('')}`;
        }).join('');
      } else {
        inner = fields.map(fieldRow).join('');
      }
      return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;margin-bottom:2px;">Extracted fields</div>
        <div style="font-size:12px;color:var(--color-ink-mute);margin-bottom:8px;">From the submitted PDF · engine ${esc(fields[0].source_engine)}</div>
        ${inner}
      </div>${extra}`;
    }
    return (signalsBlock(key) || emptyState({ icon: '📄', title: 'Nothing extracted for this section', hint: 'Run the scan to populate.' })) + extra;
  }

  // ---- needs-attention (modal off the summary stat) ------------------------
  function openNeeds() {
    const items = needsAttentionFields();
    if (!items.length) {
      modal({ title: 'Needs attention',
        bodyHtml: `<div style="font-size:13px;color:var(--color-ink-mute);">Every extracted field passed its checks — nothing needs attention.</div>`,
        actions: [{ label: 'Close', kind: 'ghost' }] });
      return;
    }
    const rows = items.map((it, i) => {
      const dot = it.level === 'fail' ? '#a12020' : '#8a6b00';
      return `<div class="na-item" data-tab="${esc(it.tab)}" style="display:grid;grid-template-columns:8px 1fr auto;gap:12px;
          padding:12px 0;border-top:${i ? '1px solid #f3f0eb' : 'none'};align-items:start;cursor:pointer;">
          <div style="width:8px;height:8px;border-radius:999px;background:${dot};margin-top:5px;"></div>
          <div>
            <div style="font-size:13px;font-weight:540;color:var(--color-ink);">${esc(it.label)}</div>
            <div style="font-size:12px;color:${dot};margin-top:2px;">${esc(it.reason)}</div>
          </div>
          <div style="font-size:11px;color:var(--color-ink-faint);white-space:nowrap;">${esc(it.tabLabel)} →</div>
        </div>`;
    }).join('');
    const close = modal({
      title: `Needs attention · ${items.length}`,
      bodyHtml: `<div style="font-size:12px;color:var(--color-ink-mute);margin-bottom:4px;">Flagged, failed, or low-legitimacy fields. Select one to jump to its section.</div>${rows}`,
      actions: [{ label: 'Close', kind: 'ghost' }],
    });
    document.querySelectorAll('.na-item').forEach((el) =>
      el.addEventListener('click', () => { const t = el.dataset.tab; close(); tab = t; draw(); }));
  }

  // ---- sign-off bar --------------------------------------------------------
  // The Approve/Flag buttons reflect the CURRENT admin status so the completed
  // (green + tick) state only appears once the section is actually approved —
  // otherwise "Approve section" reads as already-approved and confuses.
  function signoffButtons(adminStatus, cls, currentKey) {
    const next = nextTab(currentKey);
    const nextBtn = next
      ? `<button class="nav-next" data-next="${esc(next)}" title="Next: ${esc(labelOf(next))}"
          style="padding:7px 11px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
            background:#fff;color:var(--color-ink-mute);border:1px solid var(--color-hairline);display:inline-flex;align-items:center;gap:5px;">
          Next <span style="font-size:14px;line-height:1;">→</span></button>`
      : '';
    // Read-only (post-approval): no sign-off actions, just section navigation.
    if (readOnly) return `<div style="display:flex;gap:8px;align-items:center;">${nextBtn}</div>`;
    const approved = adminStatus === 'approved';
    const rejected = adminStatus === 'rejected';
    const flagBtn = `<button class="${cls}" data-status="rejected" title="${rejected ? 'Section is flagged — click to keep flagged' : 'Flag this section for follow-up'}"
      style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
        background:${rejected ? '#a12020' : '#fff'};color:${rejected ? '#fff' : '#a12020'};border:${rejected ? 'none' : '1px solid #f3d4d4'};">
      ${rejected ? '⚑ Flagged' : 'Flag section'}</button>`;
    const approveBtn = `<button class="${cls}" data-status="approved" title="${approved ? 'Section is approved' : 'Mark this section approved'}"
      style="padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;
        background:${approved ? '#00843d' : '#fff'};color:${approved ? '#fff' : 'var(--color-teal-deep)'};border:${approved ? 'none' : '1px solid var(--color-hairline)'};">
      ${approved ? '✓ Approved' : 'Approve section'}</button>`;
    return `<div style="display:flex;gap:8px;align-items:center;">${flagBtn}${approveBtn}${nextBtn}</div>`;
  }

  function signoffBar(key) {
    const sec = sectionByKey(key);
    if (!sec) {
      return `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--color-canvas-soft);
        border:1px dashed var(--color-hairline);border-radius:12px;padding:14px 18px;margin-bottom:16px;font-size:13px;color:var(--color-ink-mute);">
        <span>Not scanned yet — run the scan to extract fields and run checks.</span>
        <button id="btn-scan-inline" style="padding:7px 12px;background:var(--color-teal-deep);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">✦ Run scan</button></div>`;
    }
    return `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;
      border:1px solid var(--color-hairline);border-radius:12px;padding:14px 18px;margin-bottom:16px;">
      <div>${dualBadge(sec.system_status, sec.admin_status)}
        <span style="font-size:12px;color:var(--color-ink-mute);margin-left:10px;">${esc(sec.system_note || '')}</span></div>
      ${signoffButtons(sec.admin_status, 'signoff', key)}</div>`;
  }

  // ---- summary widget ------------------------------------------------------
  function summaryWidget() {
    if (!isScanned() || !review.summary) return '';
    const s = review.summary;
    const stat = (label, value, color, { id = '', clickable = false } = {}) => `<div
      ${id ? `id="${id}"` : ''} ${clickable ? 'title="View items that need attention"' : ''}
      style="flex:1;${clickable ? 'cursor:pointer;' : ''}">
      <div style="font-size:11px;color:var(--color-ink-mute);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${label}</div>
      <div style="font-family:var(--font-display);font-weight:540;font-size:26px;color:${color || 'var(--color-ink)'};letter-spacing:-0.5px;">${value}</div></div>`;
    return `<div style="display:flex;gap:24px;background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:18px 24px;margin-bottom:16px;">
      ${stat('Completeness', s.completeness + '%', s.completeness === 100 ? '#00843d' : '#8a6b00')}
      ${stat('Needs attention', s.needs_attention, s.needs_attention ? '#a12020' : '#00843d', { id: 'stat-needs', clickable: !!s.needs_attention })}
      ${stat('Fields extracted', s.field_count)}
      ${stat('Submitted', esc(app.date || app.age))}
    </div>`;
  }

  // ---- review timeline (single source of section navigation) ---------------
  function timeline() {
    const notScanned = !isScanned();
    const na = needsAttentionFields();
    const issuesOf = (key) => na.filter((it) => it.tab === key).length;

    const tlRow = ({ glyph, glyphColor, label, sub, subColor, active = false, dataTab = '' }) => `
      <div ${dataTab ? `class="tl-item" data-tab="${esc(dataTab)}"` : ''}
        style="display:grid;grid-template-columns:16px 1fr;gap:10px;align-items:start;padding:7px 8px;border-radius:8px;
          ${dataTab ? 'cursor:pointer;' : ''}${active ? 'background:var(--color-canvas-soft);' : ''}">
        <div style="font-size:13px;line-height:18px;text-align:center;color:${glyphColor};">${glyph}</div>
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:${active ? 600 : 540};color:var(--color-ink);">${esc(label)}</div>
          <div style="font-size:11px;color:${subColor};margin-top:1px;">${esc(sub)}</div>
        </div>
      </div>`;

    const connector = `<div style="width:1px;height:12px;background:var(--color-hairline);margin-left:16px;"></div>`;

    const rowHtmls = sections().map((sec) => {
      const active = tab === sec.section_key;
      const issues = issuesOf(sec.section_key);
      // A tick means the ADMIN approved the section — system pass alone is not
      // enough (it would falsely look done before sign-off).
      const approved = sec.admin_status === 'approved';
      const rejected = sec.admin_status === 'rejected';
      let glyph, glyphColor, sub, subColor;
      if (active) { glyph = '●'; glyphColor = 'var(--color-ink)'; }
      else if (approved) { glyph = '✓'; glyphColor = '#00843d'; }
      else if (rejected || sec.system_status === 'fail' || issues > 0) { glyph = '!'; glyphColor = '#8a6b00'; }
      else { glyph = '○'; glyphColor = '#c4c0b8'; }
      if (approved) { sub = 'Approved'; subColor = 'var(--color-ink-faint)'; }
      else if (rejected) { sub = 'Flagged'; subColor = '#8a6b00'; }
      else if (sec.system_status === 'fail' || issues > 0) {
        const n = issues || 1;
        sub = `${n} issue${n === 1 ? '' : 's'}`; subColor = '#8a6b00';
      } else { sub = 'Pending review'; subColor = 'var(--color-ink-faint)'; }
      return tlRow({ glyph, glyphColor, label: sec.label, sub, subColor, active, dataTab: sec.section_key });
    });

    // Attached documents — ALWAYS shown; supporting documents are required for
    // approval, so a missing set must be visible as an outstanding item.
    {
      const docs = attachedDocs();
      const active = tab === DOCS_TAB;
      const verified = docs.filter((d) => d.status === 'Verified').length;
      const flagged = docs.some((d) => d.status === 'Flagged' || d.status === 'Missing page');
      const approvedDocs = review.documents_admin_status === 'approved';
      const rejectedDocs = review.documents_admin_status === 'rejected';
      let glyph, glyphColor, sub, subColor;
      if (active) { glyph = '●'; glyphColor = 'var(--color-ink)'; }
      else if (approvedDocs) { glyph = '✓'; glyphColor = '#00843d'; }
      else if (rejectedDocs || !docs.length || flagged) { glyph = '!'; glyphColor = '#8a6b00'; }
      else { glyph = '○'; glyphColor = '#c4c0b8'; }
      if (approvedDocs) { sub = 'Approved'; subColor = 'var(--color-ink-faint)'; }
      else if (rejectedDocs) { sub = 'Flagged'; subColor = '#8a6b00'; }
      else if (!docs.length) { sub = 'None attached'; subColor = '#8a6b00'; }
      else if (flagged) { sub = 'Flagged — review'; subColor = '#8a6b00'; }
      else { sub = `${verified}/${docs.length} verified`; subColor = 'var(--color-ink-faint)'; }
      // Second slot in the timeline (after the first section).
      rowHtmls.splice(1, 0, tlRow({ glyph, glyphColor, label: 'Attached documents', sub, subColor, active, dataTab: DOCS_TAB }));
    }

    const sectionRows = rowHtmls.join(connector);

    // Final approval — not a section; reuse the tiered gate.
    const gate = review.gate || { can_approve: false, blocking: [], warnings: [] };
    const approved = app.status === 'Approved';
    let fGlyph, fColor, fSub, fSubColor;
    if (notScanned) { fGlyph = '○'; fColor = '#c4c0b8'; fSub = 'Run scan to assess'; fSubColor = 'var(--color-ink-faint)'; }
    else if (approved) { fGlyph = '✓'; fColor = '#00843d'; fSub = 'Approved'; fSubColor = 'var(--color-ink-faint)'; }
    else if (gate.blocking.length) { fGlyph = '!'; fColor = '#8a6b00'; fSub = `${gate.blocking.length} blocking`; fSubColor = '#8a6b00'; }
    else if (gate.warnings.length) { const n = gate.warnings.length; fGlyph = '!'; fColor = '#8a6b00'; fSub = `${n} warning${n === 1 ? '' : 's'}`; fSubColor = '#8a6b00'; }
    else { fGlyph = '○'; fColor = '#c4c0b8'; fSub = 'Ready to approve'; fSubColor = 'var(--color-ink-faint)'; }
    const finalRow = tlRow({ glyph: fGlyph, glyphColor: fColor, label: 'Final approval', sub: fSub, subColor: fSubColor });

    const scanHint = (notScanned && !sections().length)
      ? '<div style="font-size:12px;color:var(--color-ink-faint);padding:2px 8px 8px;">Run scan to review the application sections.</div>'
      : '';
    return `<div style="position:sticky;top:0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.8px;color:var(--color-ink-faint);text-transform:uppercase;margin-bottom:10px;padding-left:8px;">Review</div>
      ${scanHint}${sectionRows}
      <div style="height:1px;background:var(--color-hairline);margin:12px 8px;"></div>
      ${finalRow}
    </div>`;
  }

  // ---- advisory AI insights (header button → modal) ------------------------
  function insightsBodyHtml() {
    const list = review.insights || [];
    const source = review.insights_source || '';
    const sourceLabel = source === 'rules'
      ? 'Rule-based advisor' : source ? `AI · ${esc(source)}` : '';
    const sevColor = { high: '#a12020', medium: '#8a6b00', low: '#3a7', info: '#73706d' };
    const sevBg = { high: '#fbeaea', medium: '#fbf3df', low: '#e9f5ee', info: '#f0efec' };
    const cards = !list.length
      ? `<div style="font-size:13px;color:var(--color-ink-faint);padding:6px 0;">No insights yet — run the AI review.</div>`
      : list.map((it, i) => {
          const c = sevColor[it.severity] || '#73706d';
          return `<div style="padding:12px 0;border-top:${i ? '1px solid #f3f0eb' : 'none'};">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${c};background:${sevBg[it.severity] || '#f0efec'};padding:2px 7px;border-radius:999px;">${esc(it.severity || 'info')}</span>
              <span style="font-size:13px;font-weight:600;color:var(--color-ink);">${esc(it.title)}</span>
            </div>
            ${it.detail ? `<div style="font-size:12px;color:var(--color-ink-mute);line-height:1.45;">${esc(it.detail)}</div>` : ''}
            ${it.action ? `<div style="font-size:12px;color:var(--color-ink);line-height:1.45;margin-top:5px;"><b style="color:var(--color-teal-deep);">Do:</b> ${esc(it.action)}${it.section ? ` <span style="color:var(--color-ink-faint);">· ${esc(it.section)}</span>` : ''}</div>` : ''}
          </div>`;
        }).join('');
    return `${sourceLabel ? `<div style="font-size:11px;color:var(--color-ink-faint);margin-bottom:6px;">${sourceLabel} · advisory only — the admin makes the decision.</div>` : ''}${cards}`;
  }

  function openInsights() {
    const hasInsights = (review.insights || []).length > 0;
    modal({
      title: 'Advisory insights',
      bodyHtml: insightsBodyHtml(),
      actions: [
        { label: hasInsights ? '↻ Re-run' : '✦ Run AI review', kind: 'ghost', keepOpen: true,
          onClick: async (overlay) => {
            const body = overlay.querySelector('[data-body]');
            body.innerHTML = `<div style="font-size:12px;color:var(--color-ink-mute);padding:10px 0;">Analysing…</div>`;
            try {
              const res = await api.refreshInsights(id);
              review.insights = res.insights;
              review.insights_source = res.insights_source;
            } catch { toast('Could not generate insights.'); }
            body.innerHTML = insightsBodyHtml();
          } },
        { label: 'Close', kind: 'ghost' },
      ],
    });
  }

  // ---- attached documents review (navigable section) -----------------------
  const DOC_STATUS_COLORS = {
    Verified: ['#00843d', '#e9f5ee'], Flagged: ['#a12020', '#fbe3e3'],
    'Missing page': ['#a12020', '#fbe3e3'], 'Not required': ['#73706d', '#f0efec'],
    Uploaded: ['#8a6b00', '#fbf3df'],
  };
  function docStatusChip(st) {
    const [c, bg] = DOC_STATUS_COLORS[st] || DOC_STATUS_COLORS.Uploaded;
    return `<span style="font-size:10px;font-weight:600;color:${c};background:${bg};padding:2px 8px;border-radius:999px;">${esc(st || 'Uploaded')}</span>`;
  }

  // Expected documents for an education-agent partnership. Required ones gate a
  // clean approval; the rest are important-but-conditional. Mirrors the intake
  // form's slots; anything else attached lands under "Other supporting documents".
  const EXPECTED_DOCS = [
    { type: 'Business registration', label: 'Business / company registration', required: true },
    { type: 'Education-agent training', label: 'Education-agent training certificate', required: true },
    { type: 'Identity', label: 'Proof of identity — director / owner', required: true },
    { type: 'MARA/MARN', label: 'MARA / MARN registration', required: false },
    { type: 'Insurance', label: 'Professional indemnity insurance', required: false },
    { type: 'Licence', label: 'Local agent / recruitment licence', required: false },
    { type: 'Reference', label: 'Reference / support letter', required: false },
  ];

  // The file + review actions for one attached document.
  function attachedDocLine(d) {
    const verified = d.status === 'Verified';
    const flagged = d.status === 'Flagged' || d.status === 'Missing page';
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding:8px 12px;background:var(--color-canvas-soft);border-radius:8px;flex-wrap:wrap;">
      <div style="font-size:12px;color:var(--color-ink);min-width:0;">${esc(d.name)}${d.size ? ` · ${esc(d.size)}` : ''}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
        ${docStatusChip(d.status)}
        <button class="doc-dl" data-id="${d.id}" style="padding:5px 10px;background:#fff;color:var(--color-teal-deep);border:1px solid var(--color-hairline);border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">⬇ View</button>
        ${readOnly ? '' : `<button class="doc-verify" data-id="${d.id}" ${verified ? 'disabled' : ''} style="padding:5px 10px;background:${verified ? '#e9f5ee' : '#00843d'};color:${verified ? '#00843d' : '#fff'};border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:${verified ? 'default' : 'pointer'};font-family:inherit;">${verified ? '✓ Verified' : '✓ Verify'}</button>
        <button class="doc-flag" data-id="${d.id}" ${flagged ? 'disabled' : ''} style="padding:5px 10px;background:#fff;color:#a12020;border:1px solid #f3d4d4;border-radius:7px;font-size:11px;font-weight:600;cursor:${flagged ? 'default' : 'pointer'};font-family:inherit;">${flagged ? 'Flagged' : 'Flag'}</button>`}
      </div>
    </div>`;
  }

  // System-tier verdict for the documents section, computed from current docs.
  function documentsSystem() {
    const docs = attachedDocs();
    const required = ['Business registration', 'Education-agent training', 'Identity'];
    const present = new Set(docs.map((d) => d.doc_type));
    const missing = required.filter((t) => !present.has(t));
    const flagged = docs.some((d) => d.status === 'Flagged' || d.status === 'Missing page');
    const unverified = docs.some((d) => !(d.status === 'Verified' || d.status === 'Not required'));
    if (!docs.length) return { status: 'fail', note: 'No documents attached' };
    if (missing.length) return { status: 'fail', note: `Required missing: ${missing.join(', ')}` };
    if (flagged) return { status: 'flag', note: 'A document was flagged' };
    if (unverified) return { status: 'flag', note: 'Documents awaiting verification' };
    return { status: 'pass', note: 'All required documents attached & verified' };
  }

  // Admin sign-off bar for the documents section (mirrors signoffBar; persists
  // via the 'documents' review section, but does not gate approval).
  function documentsSignoffBar() {
    const sys = documentsSystem();
    const adminStatus = review.documents_admin_status || 'pending';
    return `<div style="display:flex;justify-content:space-between;align-items:center;background:#fff;
      border:1px solid var(--color-hairline);border-radius:12px;padding:14px 18px;margin-bottom:16px;">
      <div>${dualBadge(sys.status, adminStatus)}
        <span style="font-size:12px;color:var(--color-ink-mute);margin-left:10px;">${esc(sys.note)}</span></div>
      ${signoffButtons(adminStatus, 'docs-signoff', DOCS_TAB)}</div>`;
  }

  function documentsReviewPanel() {
    const docs = attachedDocs();
    const byType = {};
    docs.forEach((d) => { (byType[d.doc_type] = byType[d.doc_type] || []).push(d); });

    const badge = (attached, required) => attached
      ? '<span style="font-size:10px;font-weight:700;color:#00843d;background:#e9f5ee;padding:2px 9px;border-radius:999px;">Attached</span>'
      : required
        ? '<span style="font-size:10px;font-weight:700;color:#a12020;background:#fbe3e3;padding:2px 9px;border-radius:999px;">Not attached</span>'
        : '<span style="font-size:10px;font-weight:600;color:#73706d;background:#f0efec;padding:2px 9px;border-radius:999px;">Not provided</span>';

    const expectedRows = EXPECTED_DOCS.map((spec) => {
      const found = byType[spec.type] || [];
      const attached = found.length > 0;
      return `<div style="padding:14px 0;border-top:1px solid #f3f0eb;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div style="font-size:13px;font-weight:600;color:var(--color-ink);">${esc(spec.label)}${spec.required ? ' <span style="color:#a12020;">*</span>' : ''}</div>
          ${badge(attached, spec.required)}
        </div>
        ${attached
          ? found.map(attachedDocLine).join('')
          : spec.required
            ? '<div style="font-size:11px;color:#a12020;margin-top:5px;">Required for approval — request this from the applicant.</div>'
            : ''}
      </div>`;
    }).join('');

    const expectedTypes = new Set(EXPECTED_DOCS.map((s) => s.type));
    const others = docs.filter((d) => !expectedTypes.has(d.doc_type));
    const othersBlock = others.length ? `
      <div style="margin-top:22px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);">Other supporting documents · ${others.length}</div>
        ${others.map((d) => `<div style="padding:14px 0;border-top:1px solid #f3f0eb;">
          <div style="font-size:13px;font-weight:600;color:var(--color-ink);">${esc(d.doc_type || 'Document')}</div>
          ${attachedDocLine(d)}
        </div>`).join('')}
      </div>` : '';

    const missingRequired = EXPECTED_DOCS.filter((s) => s.required && !(byType[s.type] || []).length).length;
    const subtitle = missingRequired
      ? `${missingRequired} required document(s) not yet attached.`
      : 'All required documents attached — verify each against the application.';

    return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;">
      <div style="font-family:var(--font-display);font-weight:540;font-size:16px;margin-bottom:2px;">Attached documents</div>
      <div style="font-size:12px;color:${missingRequired ? '#a12020' : 'var(--color-ink-mute)'};margin-bottom:8px;">${esc(subtitle)}</div>
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);">Required &amp; expected documents</div>
      ${expectedRows}
      ${othersBlock}
    </div>`;
  }

  // ---- agreement workflow (post-approval, read-only detail) ----------------
  function agreementCard() {
    if (!readOnly) return '';
    const ag = data.agreement || {};
    const stage = app.status === 'Active' ? 'active'
      : ag.signature_verified ? 'verified'
      : ag.signed_file ? 'uploaded'
      : 'sent';
    const ghost = 'background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);';
    const green = 'background:#00843d;color:#fff;border:none;';
    const btn = (cls, label, style) => `<button class="${cls}" style="padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;${style}">${label}</button>`;
    const uploadLabel = (text, style) => `<label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;${style}">${text}<input type="file" id="agr-file" accept="application/pdf,.pdf" style="display:none;"></label>`;

    const steps = ['Sent', 'Signed copy', 'Verified', 'Portal access'];
    const stageIdx = { sent: 0, uploaded: 1, verified: 2, active: 3 }[stage];
    const stepper = steps.map((s, i) => `<span style="font-size:11px;font-weight:600;color:${i <= stageIdx ? '#00843d' : 'var(--color-ink-faint)'};">${i <= stageIdx ? '●' : '○'} ${esc(s)}</span>`)
      .join('<span style="color:var(--color-hairline);margin:0 2px;">──</span>');

    let statusLine, actions;
    if (stage === 'sent') {
      statusLine = `Agreement sent${ag.sent_date ? ` on ${esc(ag.sent_date)}` : ''} — awaiting the agent's signed copy (returned by email).`;
      actions = `${btn('agr-view', 'View agreement', ghost)}${btn('agr-download', '⬇ Download', ghost)}${uploadLabel('⬆ Upload signed agreement', green)}`;
    } else if (stage === 'uploaded') {
      statusLine = 'Signed copy received — review the signature, then verify it.';
      actions = `${btn('agr-view-signed', 'View signed copy', ghost)}${btn('agr-verify', '✓ Verify signature', green)}${uploadLabel('Re-upload', ghost)}`;
    } else if (stage === 'verified') {
      statusLine = `Signature verified${ag.signed_date ? ` on ${esc(ag.signed_date)}` : ''} — grant the agent portal access.`;
      actions = `${btn('agr-view-signed', 'View signed copy', ghost)}${btn('agr-invite', '✉ Send invite & login details', green)}`;
    } else {
      statusLine = 'Agent onboarded — portal login details have been sent.';
      actions = `${btn('agr-view-signed', 'View signed agreement', ghost)}`;
    }

    return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;">Agreement</div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">${stepper}</div>
      </div>
      <div style="font-size:13px;color:var(--color-ink-mute);margin:6px 0 12px;">${statusLine}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${actions}</div>
    </div>`;
  }

  function showCredentials(c) {
    if (!c) { toast('Invitation sent'); return; }
    modal({
      title: 'Portal access sent',
      bodyHtml: `<div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:12px;">These login details were shared with the agent by email:</div>
        <div style="background:var(--color-canvas-soft);border:1px solid var(--color-hairline);border-radius:8px;padding:14px 16px;font-size:13px;line-height:1.9;">
          <div><b>Portal:</b> ${esc(c.portal_url)}</div>
          <div><b>Email:</b> ${esc(c.email)}</div>
          <div><b>Temporary password:</b> <code style="background:#fff;padding:1px 6px;border-radius:4px;border:1px solid var(--color-hairline);">${esc(c.password)}</code></div>
          <div><b>Role:</b> ${esc(c.role)}</div>
        </div>
        <div style="font-size:11px;color:var(--color-ink-faint);margin-top:10px;">The agent can sign in at the portal with these details.</div>`,
      actions: [{ label: 'Done', kind: 'primary' }],
    });
  }

  // ---- draw ----------------------------------------------------------------
  function draw() {
    if (tab === null && sections().length) tab = sections()[0].section_key;
    readOnly = POST_APPROVAL.includes(app.status);

    const scanLine = readOnly
      ? `Application ${app.status.toLowerCase()} · review is read-only`
      : isScanned() && review.scanned_at ? `Last scanned: ${fmtScan(review.scanned_at)}`
        : 'Not yet scanned — run a scan to extract & verify';

    const body = processing
      ? `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:56px;text-align:center;">
          <div style="font-size:28px;margin-bottom:10px;">⏳</div>
          <div style="font-family:var(--font-display);font-weight:540;font-size:18px;">Processing application…</div>
          <div style="font-size:13px;color:var(--color-ink-mute);margin-top:6px;">Extracting text, normalising fields, running checks.</div></div>`
      : tab === DOCS_TAB
        ? `${documentsSignoffBar()}${documentsReviewPanel()}`
        : !isScanned()
          ? (readOnly
              ? '<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;font-size:13px;color:var(--color-ink-mute);">No extracted fields are on file for this application.</div>'
              : signoffBar(null))
          : `${signoffBar(tab)}${sectionPanel(tab)}`;

    const insightsBtn = isScanned()
      ? `<button id="btn-insights-open" style="padding:9px 14px;background:#fff;color:var(--color-teal-deep);border:1px solid var(--color-hairline);border-radius:8px;font-size:13px;font-weight:540;cursor:pointer;">✦ Smart Insights</button>`
      : '';

    // Final approval is only offered once every review section — the extraction
    // sections AND Attached documents — has been signed off by the admin.
    const allApproved = isScanned()
      && sections().every((s) => s.admin_status === 'approved')
      && review.documents_admin_status === 'approved';
    const approveTitle = allApproved
      ? 'Approve the application'
      : 'Approve every section (including Attached documents) before final approval';

    mount.innerHTML = `
      <button id="back-link" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:12px;background:none;border:none;font-family:inherit;padding:0;">← All applications</button>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:12px;">
        <div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
            <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.6px;">${esc(app.business)}</div>
            ${statusPill(app.status)}
          </div>
          <div style="font-size:13px;color:var(--color-ink-mute);">App-${app.id} · Submitted ${esc(app.age)} · Contact ${esc(app.contact)} · ${esc(app.flag)} ${esc(app.country)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
            ${readOnly ? '' : `<button id="btn-scan" ${processing ? 'disabled' : ''} style="padding:9px 14px;background:#fff;color:var(--color-teal-deep);border:1px solid var(--color-hairline);border-radius:8px;font-size:13px;font-weight:540;cursor:pointer;">✦ Run scan</button>`}
            ${insightsBtn}
            ${readOnly ? '' : `<button id="btn-request" style="padding:9px 14px;background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);border-radius:8px;font-size:13px;font-weight:540;cursor:pointer;">Request info</button>
            <button id="btn-reject" style="padding:9px 14px;background:#fff;color:#a12020;border:1px solid #f3d4d4;border-radius:8px;font-size:13px;font-weight:540;cursor:pointer;">Reject</button>
            <button id="btn-approve" ${allApproved ? '' : 'disabled'} title="${esc(approveTitle)}" style="padding:9px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;background:${allApproved ? '#00843d' : '#e7e5e1'};color:${allApproved ? '#fff' : '#a8a5a0'};cursor:${allApproved ? 'pointer' : 'not-allowed'};">Approve</button>`}
          </div>
          <div style="font-size:11px;color:var(--color-ink-faint);">${esc(scanLine)}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:32px;align-items:start;">
        <div style="min-width:0;">
          ${agreementCard()}
          ${summaryWidget()}
          ${body}
        </div>
        <div style="border-left:1px solid var(--color-hairline);padding-left:24px;">${timeline()}</div>
      </div>`;

    mount.querySelector('#back-link').addEventListener('click', () => navigate('applications'));
    mount.querySelectorAll('.tl-item').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; draw(); }));
    const statNeeds = mount.querySelector('#stat-needs');
    if (statNeeds) statNeeds.addEventListener('click', openNeeds);
    mount.querySelectorAll('.signoff').forEach((b) => b.addEventListener('click', () => signOff(tab, b.dataset.status)));
    mount.querySelectorAll('.nav-next').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.next; draw(); }));
    mount.querySelector('#btn-scan')?.addEventListener('click', runScan);
    const inline = mount.querySelector('#btn-scan-inline');
    if (inline) inline.addEventListener('click', runScan);
    const biOpen = mount.querySelector('#btn-insights-open');
    if (biOpen) biOpen.addEventListener('click', openInsights);
    mount.querySelector('#btn-approve')?.addEventListener('click', openApprove);
    mount.querySelector('#btn-reject')?.addEventListener('click', openReject);
    mount.querySelector('#btn-request')?.addEventListener('click', openRequest);

    // Agreement workflow (post-approval).
    mount.querySelector('.agr-view')?.addEventListener('click', agrView);
    mount.querySelector('.agr-download')?.addEventListener('click', agrDownload);
    mount.querySelector('.agr-view-signed')?.addEventListener('click', agrViewSigned);
    mount.querySelector('.agr-verify')?.addEventListener('click', agrVerify);
    mount.querySelector('.agr-invite')?.addEventListener('click', agrInvite);
    const agrFile = mount.querySelector('#agr-file');
    if (agrFile) agrFile.addEventListener('change', () => { if (agrFile.files[0]) agrUpload(agrFile.files[0]); });

    // Inline field correction.
    mount.querySelectorAll('.fld-edit').forEach((b) =>
      b.addEventListener('click', () => { editingKey = b.dataset.key; draw(); }));
    mount.querySelectorAll('.fld-cancel').forEach((b) =>
      b.addEventListener('click', () => { editingKey = null; draw(); }));
    mount.querySelectorAll('.fld-save').forEach((b) =>
      b.addEventListener('click', () => saveField(b.dataset.key)));
    const editing = mount.querySelector('.fld-input');
    if (editing) { editing.focus(); editing.setSelectionRange(editing.value.length, editing.value.length); }

    // Attached-document review: download + verify/flag.
    mount.querySelectorAll('.doc-dl').forEach((b) => b.addEventListener('click', async () => {
      const label = b.textContent;
      b.disabled = true; b.textContent = 'Downloading…';
      try { await api.downloadDocument(b.dataset.id); toast('Document downloaded'); }
      catch { toast('Could not download the document.'); }
      finally { b.disabled = false; b.textContent = label; }
    }));
    mount.querySelectorAll('.doc-verify').forEach((b) =>
      b.addEventListener('click', () => setDocStatus(b.dataset.id, 'Verified')));
    mount.querySelectorAll('.doc-flag').forEach((b) =>
      b.addEventListener('click', () => setDocStatus(b.dataset.id, 'Flagged')));
    mount.querySelectorAll('.docs-signoff').forEach((b) =>
      b.addEventListener('click', () => setDocsSignoff(b.dataset.status)));

    // Referee feedback.
    mount.querySelectorAll('.ref-enter').forEach((b) =>
      b.addEventListener('click', () => { editingRef = b.dataset.key; draw(); }));
    mount.querySelectorAll('.ref-cancel').forEach((b) =>
      b.addEventListener('click', () => { editingRef = null; draw(); }));
    mount.querySelectorAll('.ref-save').forEach((b) =>
      b.addEventListener('click', () => saveFeedback(b.dataset.key, b.dataset.name)));
    mount.querySelectorAll('.ref-request').forEach((b) =>
      b.addEventListener('click', () => requestReference(b.dataset.key, b.dataset.name)));
    const refEditing = mount.querySelector('.ref-input');
    if (refEditing) refEditing.focus();
  }

  async function saveFeedback(refKey, name) {
    const input = mount.querySelector(`.ref-input[data-key="${CSS.escape(refKey)}"]`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) { toast('Enter the feedback text first'); return; }
    try {
      await api.saveReferenceFeedback(id, refKey, text, name);
      await reloadReview();
      editingRef = null;
      toast('Feedback recorded');
      draw();
    } catch { toast('Could not save the feedback.'); }
  }

  async function requestReference(refKey, name) {
    try {
      await api.requestReference(id, refKey, name);
      await reloadReview();
      toast(`Reference request sent to ${name}`);
      draw();
    } catch { toast('Could not send the request.'); }
  }

  async function setDocStatus(docId, status) {
    try {
      await api.setDocumentStatus(docId, status);
      await reloadApp();
      toast(`Document ${status.toLowerCase()}`);
      draw();
    } catch { toast('Could not update the document.'); }
  }

  async function setDocsSignoff(status) {
    try {
      await api.reviewSection(id, 'documents', { admin_status: status });
      await reloadReview();
      toast(status === 'approved' ? 'Documents approved' : 'Documents flagged');
      draw();
    } catch { toast('Could not update the documents review.'); }
  }

  // ---- agreement workflow handlers -----------------------------------------
  async function agrView() { try { await api.viewAgreement(id); } catch { toast('Could not open the agreement.'); } }
  async function agrDownload() { try { await api.downloadAgreementDoc(id); toast('Agreement downloaded'); } catch { toast('Download failed.'); } }
  async function agrViewSigned() { try { await api.viewSignedAgreement(id); } catch { toast('Could not open the signed copy.'); } }
  async function agrUpload(file) {
    const fd = new FormData(); fd.append('file', file);
    try { await api.uploadSignedAgreement(id, fd); await reloadAll(); toast('Signed agreement uploaded'); draw(); }
    catch (err) { toast(err instanceof ApiError && typeof err.detail === 'string' ? err.detail : 'Upload failed.'); }
  }
  async function agrVerify() {
    try { await api.verifyAgreement(id); await reloadAll(); toast('Signature verified'); draw(); }
    catch (err) { toast(err instanceof ApiError && typeof err.detail === 'string' ? err.detail : 'Could not verify.'); }
  }
  async function agrInvite() {
    try { const res = await api.sendInvite(id, ['Email']); await reloadAll(); showCredentials(res.credentials); draw(); }
    catch (err) {
      toast(err instanceof ApiError && err.status === 409 && typeof err.detail === 'string'
        ? err.detail : 'Could not send the invitation.');
    }
  }

  async function saveField(key) {
    const input = mount.querySelector(`.fld-input[data-key="${CSS.escape(key)}"]`);
    if (!input) return;
    const value = input.value.trim();
    try {
      await api.correctField(id, key, value);
      await reloadReview();
      editingKey = null;
      toast('Field updated');
      draw();
    } catch { toast('Could not save the correction.'); }
  }

  async function runScan() {
    processing = true; draw();
    try { review = await api.scanApplication(id); toast('Scan complete'); }
    catch { toast('Scan failed — is the backend running?'); }
    finally { processing = false; tab = sections().length ? sections()[0].section_key : null; draw(); }
  }

  async function signOff(key, status) {
    try {
      await api.reviewSection(id, key, { admin_status: status });
      await reloadReview();
      toast(status === 'approved' ? 'Section approved' : 'Section flagged');
      draw();
    } catch { toast('Could not update the section.'); }
  }

  // ---- decisions (gate unchanged from M2.5) --------------------------------
  async function decide(action, extra = {}) {
    try { await api.decideApplication(id, { action, ...extra }); return true; }
    catch (err) {
      if (err instanceof ApiError && err.status === 409) return err.detail || { blocking: [], warnings: [] };
      toast('Could not save the decision.'); return false;
    }
  }
  const gateList = (d) => `${(d.blocking || []).map((b) => `<li style="color:#a12020;">${esc(b)}</li>`).join('')}
    ${(d.warnings || []).map((w) => `<li style="color:#8a6b00;">${esc(w)}</li>`).join('')}`;

  function openApprove() {
    const gate = review.gate || { can_approve: false, blocking: [], warnings: [] };
    if (!gate.can_approve) {
      modal({ title: `Approval blocked · ${app.business}`,
        bodyHtml: `<div style="font-size:14px;color:var(--color-ink-mute);">Resolve these before approval:</div><ul style="margin:8px 0 0 18px;font-size:13px;">${gateList(gate)}</ul>`,
        actions: [{ label: 'Close', kind: 'ghost' }] });
      return;
    }
    const needsOverride = gate.warnings.length > 0;
    modal({
      title: `Approve ${app.business}?`,
      bodyHtml: `<div style="font-size:14px;color:var(--color-ink-mute);line-height:1.5;">Status → <b style="color:#00843d;">Approved</b>, a draft agreement is staged, and an audit entry is created.</div>
        ${needsOverride ? `<div style="margin-top:12px;font-size:13px;font-weight:600;color:#8a6b00;">Outstanding warnings — override reason required:</div><ul style="margin:6px 0 0 18px;font-size:13px;">${gateList({ warnings: gate.warnings })}</ul>
          <textarea id="ov-reason" rows="2" placeholder="Reason for approving despite warnings" style="width:100%;margin-top:10px;padding:11px 14px;border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>` : ''}`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: needsOverride ? 'Override & approve' : 'Approve & continue', kind: 'primary', keepOpen: true, onClick: async (overlay) => {
          const reason = needsOverride ? overlay.querySelector('#ov-reason').value.trim() : '';
          if (needsOverride && !reason) { toast('Enter an override reason'); return; }
          const res = await decide('approve', { override: needsOverride, override_reason: reason });
          if (res === true) { overlay.remove(); toast('Approved · draft agreement ready'); navigate(`agreement/${id}`); }
          else if (res) { overlay.remove(); await reloadReview(); openApprove(); }
        } },
      ],
    });
  }

  function openReject() {
    modal({ title: 'Reject application',
      bodyHtml: `<label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">Reason</label>
        <select id="rej-reason" style="width:100%;padding:11px 14px;border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-family:inherit;background:#fff;margin-bottom:14px;">
          <option>Incomplete business registration</option><option>Failed reference checks</option><option>Regulatory non-compliance</option><option>Duplicate application</option></select>
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">Comments to agent</label>
        <textarea id="rej-comment" rows="3" style="width:100%;padding:11px 14px;border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Send rejection', kind: 'danger', onClick: async (overlay) => {
          const reason = overlay.querySelector('#rej-reason').value;
          const comment = overlay.querySelector('#rej-comment').value;
          if ((await decide('reject', { reason, comment })) === true) { toast('Rejection sent'); navigate('applications'); }
        } }],
    });
  }

  function openRequest() {
    const items = ['Updated identity documents', 'Signed compliance declaration', 'Additional reference', 'Business insurance certificate'];
    const checks = items.map((it, i) => `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid #f3f0eb;font-size:13px;cursor:pointer;">
      <input type="checkbox" data-item="${i}" ${i < 2 ? 'checked' : ''} style="margin-top:2px;"><div style="font-weight:540;">${esc(it)}</div></label>`).join('');
    modal({ title: 'Request more information',
      bodyHtml: `<div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:8px;">Status → <b style="color:#8a4b00;">Pending Agent Response</b>.</div>${checks}`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: 'Send request', kind: 'dark', onClick: async (overlay) => {
          const checked = [...overlay.querySelectorAll('input[data-item]:checked')].map((c) => items[Number(c.dataset.item)]);
          if ((await decide('request_info', { items: checked })) === true) { toast('Request sent'); navigate('applications'); }
        } }],
    });
  }

  // A reviewed (post-approval) application should already have its extracted
  // fields. If it somehow doesn't (e.g. approved before a scan ran), auto-scan
  // once so the read-only detail populates instead of prompting to run a scan.
  if (POST_APPROVAL.includes(app.status) && !isScanned() && app.source_pdf) {
    try { review = await api.scanApplication(id); } catch { /* leave empty; body shows a read-only note */ }
  }

  draw();
}
