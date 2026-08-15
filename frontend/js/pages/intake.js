// Public application intake (M3): the agent's own front door. Rendered standalone
// (no shell, like login) and reachable UNAUTHENTICATED at #/apply. Collects the
// basic details, the filled application PDF, AND the supporting documents an
// Australian college requires (PRD §"Verify Documents": ASIC/business
// registration, QEAC/PIER or education-agent training certificate, MARN,
// identity, insurance, licence, references). Posts to the public /intake endpoint
// (files stored in the app-forms document store) and shows a success state. The
// submission lands in the admin's Applications list as "New".
import { api, ApiError } from '../api.js';
import { esc, toast, setButtonBusy, runWithSpinner } from '../ui.js';

// Supporting-document slots. `type` is persisted as Document.doc_type.
const DOC_SLOTS = [
  { id: 'doc-business', type: 'Business registration', required: true,
    label: 'Business / company registration', hint: 'ASIC certificate, certificate of incorporation, or ABN registration' },
  { id: 'doc-training', type: 'Education-agent training', required: true,
    label: 'Education-agent training certificate', hint: 'QEAC, PIER, or AEATC completion certificate' },
  { id: 'doc-identity', type: 'Identity', required: true,
    label: 'Proof of identity — director / owner', hint: 'Passport or government photo ID' },
  { id: 'doc-marn', type: 'MARA/MARN', required: false,
    label: 'MARA / MARN registration', hint: 'Only if you provide migration advice' },
  { id: 'doc-insurance', type: 'Insurance', required: false,
    label: 'Professional indemnity insurance', hint: 'Certificate of currency (recommended)' },
  { id: 'doc-licence', type: 'Licence', required: false,
    label: 'Local agent / recruitment licence', hint: 'If licensing applies in your country' },
  { id: 'doc-reference', type: 'Reference', required: false,
    label: 'Reference / support letter', hint: 'From an institution or partner' },
];

const ACCEPT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg';

export function renderIntake(mount, { navigate }) {
  function field(id, label, placeholder, { type = 'text', required = false } = {}) {
    return `<label class="field" style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">${esc(label)}${required ? ' <span style="color:#a12020;">*</span>' : ''}</span>
      <input id="${id}" type="${type}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}
        style="width:100%;padding:11px 14px;border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-family:inherit;background:#fff;outline:none;box-sizing:border-box;">
    </label>`;
  }

  // Checklist row: the applicant TICKS which supporting documents their uploaded
  // bundle contains (self-attestation), instead of a file input per document.
  function docCheck(s) {
    return `<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid #f3f0eb;cursor:pointer;">
      <input type="checkbox" class="doc-check" data-type="${esc(s.type)}" data-required="${s.required ? '1' : ''}"
        style="margin-top:2px;width:16px;height:16px;flex:none;cursor:pointer;">
      <span>
        <span style="display:block;font-size:13px;font-weight:600;color:var(--color-ink);">${esc(s.label)}${s.required ? ' <span style="color:#a12020;">*</span>' : ' <span style="color:var(--color-ink-faint);font-weight:400;">(optional)</span>'}</span>
        <span style="display:block;font-size:11px;color:var(--color-ink-mute);margin-top:2px;">${esc(s.hint)}</span>
      </span>
    </label>`;
  }

  function drawForm() {
    mount.innerHTML = `
      <div class="login">
        <div class="login__hero">
          <div class="login__brand">
            <div class="sidebar__logo"><img src="icons/logo.svg" alt="Corridor"></div>
            <div style="line-height:1.15;">
              <div class="brand-wordmark" style="font-size:22px;">Corridor</div>
              <div style="font-size:11px;font-weight:460;letter-spacing:0.3px;color:rgba(255,255,255,0.72);">Agent Management Portal</div>
            </div>
          </div>
          <div>
            <div class="login__headline">Apply to become a recruitment partner.</div>
            <div class="login__blurb">Submit your agency details, your completed application form, and the supporting documents. Our admissions team reviews every application against ESOS and ASQA standards and will be in touch.</div>
          </div>
          <div class="login__badges"><div>ESOS Act aligned</div><div>ASQA standards</div><div>Reviewed by our team</div></div>
        </div>
        <div class="login__panel">
          <form class="login__card" id="intake-form" style="max-width:460px;">
            <div class="login__title">Partner application</div>
            <div class="login__subtitle">Fields marked * are required.</div>
            ${field('in-business', 'Business / agency name', 'Horizon Study Abroad', { required: true })}
            ${field('in-contact', 'Primary contact', 'Meera Nair')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              ${field('in-email', 'Email', 'contact@agency.com', { type: 'email' })}
              ${field('in-phone', 'Phone', '+91 90000 11122')}
            </div>
            ${field('in-country', 'Country', 'India')}

            <div style="background:#f6f4ef;border:1px solid var(--color-hairline);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
              <div style="font-size:12px;font-weight:600;color:var(--color-ink);">Don't have the form yet?</div>
              <div style="font-size:11px;color:var(--color-ink-mute);margin:2px 0 9px;">Download the blank Agent Application Form, fill it in, then upload it below.</div>
              <button type="button" id="in-download-form"
                style="padding:8px 14px;background:#fff;color:var(--color-primary);border:1px solid var(--color-primary);border-radius:8px;
                  font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">⬇ Download application form</button>
            </div>

            <label class="field" style="display:block;margin-bottom:8px;">
              <span style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">Application form (PDF) <span style="color:#a12020;">*</span></span>
              <input id="in-file" type="file" accept="application/pdf,.pdf" required
                style="width:100%;font-size:13px;font-family:inherit;padding:9px 0;">
              <span style="display:block;font-size:11px;color:var(--color-ink-faint);margin-top:4px;">Your completed City College agent application form.</span>
            </label>

            <div style="margin-top:18px;">
              <div style="font-size:13px;font-weight:700;color:var(--color-ink);">Supporting documents</div>
              <div style="font-size:11px;color:var(--color-ink-mute);margin-top:2px;">Upload all your compliance documents together in one place — a single combined PDF or several files. PDF, JPG or PNG.</div>

              <div style="margin-top:10px;">
                <input id="doc-bundle" type="file" accept="${ACCEPT}" multiple
                  style="width:100%;font-size:12px;font-family:inherit;">
                <div id="doc-bundle-count" style="font-size:11px;color:var(--color-ink-faint);margin-top:5px;"></div>
              </div>

              <div style="margin-top:14px;">
                <div style="font-size:12px;font-weight:600;color:var(--color-ink);">Tick the documents included in your upload</div>
                <div style="font-size:11px;color:var(--color-ink-mute);margin-top:2px;">Items marked * are required. This tells our review team what to expect in your bundle.</div>
                ${DOC_SLOTS.map(docCheck).join('')}
              </div>
            </div>

            <button class="btn-primary" type="submit" id="in-submit" style="margin-top:16px;">Submit application</button>
            <div id="in-error" style="font-size:12px;color:#a12020;margin-top:10px;min-height:16px;"></div>
            <div class="login__hint">Already a partner or staff? <a href="#/login" style="color:var(--color-primary);">Sign in</a></div>
          </form>
        </div>
      </div>`;

    mount.querySelector('#intake-form').addEventListener('submit', submit);

    const bundle = mount.querySelector('#doc-bundle');
    bundle.addEventListener('change', () => {
      const n = bundle.files.length;
      mount.querySelector('#doc-bundle-count').textContent =
        n ? `${n} file${n === 1 ? '' : 's'} selected` : '';
    });

    mount.querySelector('#in-download-form').addEventListener('click', async (e) => {
      try {
        const filename = await runWithSpinner(e.currentTarget, () => api.downloadApplicationForm(), 'Downloading…');
        toast(`Downloaded ${filename}`);
      } catch {
        toast('Could not download the application form. Is the backend running on :8000?');
      }
    });
  }

  async function submit(e) {
    e.preventDefault();
    const val = (id) => (mount.querySelector(`#${id}`).value || '').trim();
    const fileOf = (id) => { const el = mount.querySelector(`#${id}`); return el && el.files[0]; };
    const errBox = mount.querySelector('#in-error');
    errBox.textContent = '';

    const business = val('in-business');
    if (!business) { errBox.textContent = 'Please enter your business name.'; return; }
    const appFile = fileOf('in-file');
    if (!appFile) { errBox.textContent = 'Please attach your application PDF.'; return; }

    // Which supporting documents the applicant declared (ticked the checklist).
    const checks = [...mount.querySelectorAll('.doc-check')];
    const declared = checks.filter((c) => c.checked).map((c) => c.dataset.type);
    const bundleFiles = [...mount.querySelector('#doc-bundle').files];

    // Required supporting documents must be ticked.
    const missing = DOC_SLOTS.filter((s) =>
      s.required && !checks.find((c) => c.dataset.type === s.type && c.checked));
    if (missing.length) {
      errBox.textContent = `Please tick the required documents: ${missing.map((s) => s.label).join(', ')}.`;
      return;
    }
    if (declared.length && !bundleFiles.length) {
      errBox.textContent = 'Please upload your supporting documents for the items you ticked.';
      return;
    }

    const btn = mount.querySelector('#in-submit');
    const restore = setButtonBusy(btn, 'Submitting…');
    try {
      const fd = new FormData();
      fd.append('file', appFile);
      fd.append('business', business);
      fd.append('contact', val('in-contact'));
      fd.append('email', val('in-email'));
      fd.append('phone', val('in-phone'));
      fd.append('country', val('in-country'));
      // One supporting-documents bundle + the applicant's declared checklist.
      // The backend maps the ticked types onto the uploaded files (reusing the
      // bundle as evidence when a single combined PDF covers several documents).
      bundleFiles.forEach((f) => fd.append('documents', f));
      declared.forEach((t) => fd.append('declared_types', t));

      const res = await api.submitIntake(fd);
      drawSuccess(res.business || business, res.documents || 0);
    } catch (err) {
      const detail = err instanceof ApiError && typeof err.detail === 'string' ? err.detail : null;
      errBox.textContent = detail || 'Could not submit your application. Please try again.';
      restore();
    }
  }

  function drawSuccess(business, docCount) {
    mount.innerHTML = `
      <div class="login">
        <div class="login__hero">
          <div class="login__brand">
            <div class="sidebar__logo"><img src="icons/logo.svg" alt="Corridor"></div>
            <div style="line-height:1.15;">
              <div class="brand-wordmark" style="font-size:22px;">Corridor</div>
              <div style="font-size:11px;font-weight:460;letter-spacing:0.3px;color:rgba(255,255,255,0.72);">Agent Management Portal</div>
            </div>
          </div>
          <div>
            <div class="login__headline">Application received.</div>
            <div class="login__blurb">Thank you — our admissions team will review your application and supporting documents and contact you at the email you provided.</div>
          </div>
          <div class="login__badges"><div>ESOS Act aligned</div><div>ASQA standards</div></div>
        </div>
        <div class="login__panel">
          <div class="login__card" style="max-width:440px;text-align:center;">
            <div style="font-size:44px;margin-bottom:8px;">✅</div>
            <div class="login__title">You're all set</div>
            <div class="login__subtitle" style="margin-bottom:20px;">
              <b>${esc(business)}</b>'s application${docCount ? ` and ${docCount} document(s)` : ''} have been submitted and are now with our review team.</div>
            <button class="btn-primary" id="in-again" type="button">Submit another application</button>
            <div class="login__hint">Staff member? <a href="#/login" style="color:var(--color-primary);">Sign in to the portal</a></div>
          </div>
        </div>
      </div>`;
    mount.querySelector('#in-again').addEventListener('click', drawForm);
  }

  drawForm();
}
