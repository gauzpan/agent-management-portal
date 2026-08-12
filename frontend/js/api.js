// Single FastAPI fetch client. All backend calls go through here so auth
// headers, base URL, and error handling live in one place (per frontend/CLAUDE.md).
import { store } from './store.js';

const BASE = 'http://127.0.0.1:8000';

async function request(path, { method = 'GET', body } = {}) {
  // FormData bodies (file uploads) must NOT set Content-Type — the browser adds
  // the multipart boundary itself.
  const isForm = body instanceof FormData;
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  const token = store.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    // Network / offline error — surface a typed failure the pages can handle.
    throw new ApiError(0, 'Network error — is the backend running on :8000?');
  }
  if (!res.ok) {
    // Attach the parsed error body (FastAPI puts it under `detail`) so callers
    // like the approval gate can read blocking/warnings.
    let detail = null;
    try { detail = (await res.json()).detail; } catch { /* non-JSON */ }
    throw new ApiError(res.status, `Request failed (${res.status})`, detail);
  }
  return res.status === 204 ? null : res.json();
}

export class ApiError extends Error {
  constructor(status, message, detail = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export const api = {
  health: () => request('/health'),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  seed: () => request('/seed', { method: 'POST' }),
  applications: () => request('/applications'),
  createApplication: (body) => request('/applications', { method: 'POST', body }),
  uploadApplication: (formData) => request('/applications/upload', { method: 'POST', body: formData }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
  getApplication: (id) => request(`/applications/${id}`),
  getReview: (id) => request(`/applications/${id}/review`),
  scanApplication: (id) => request(`/applications/${id}/scan`, { method: 'POST' }),
  reviewSection: (id, key, body) => request(`/applications/${id}/review/${key}`, { method: 'PATCH', body }),
  correctField: (id, key, value) => request(`/applications/${id}/fields/${key}`, { method: 'PATCH', body: { value } }),
  refreshInsights: (id) => request(`/applications/${id}/insights`, { method: 'POST' }),
  requestReference: (id, refKey, referee) => request(`/applications/${id}/references/${refKey}/request`, { method: 'POST', body: { referee } }),
  saveReferenceFeedback: (id, refKey, feedback, referee) => request(`/applications/${id}/references/${refKey}/feedback`, { method: 'PUT', body: { feedback, referee } }),
  setDocumentStatus: (docId, status) => request(`/documents/${docId}`, { method: 'PATCH', body: { status } }),
  decideApplication: (id, body) => request(`/applications/${id}/decision`, { method: 'PATCH', body }),
  sendAgreement: (id) => request(`/applications/${id}/agreement/send`, { method: 'POST' }),
  sendInvite: (id, channels) => request(`/applications/${id}/invite`, { method: 'POST', body: { channels } }),
  // Agreement lifecycle (post-approval).
  uploadSignedAgreement: (id, formData) => request(`/applications/${id}/agreement/upload`, { method: 'POST', body: formData }),
  verifyAgreement: (id) => request(`/applications/${id}/agreement/verify`, { method: 'POST' }),
  async viewAgreement(id) { return this._openFile(`/applications/${id}/agreement/document`); },
  async downloadAgreementDoc(id) { return this._downloadFile(`/applications/${id}/agreement/document`, `Agreement-${id}.pdf`); },
  async viewSignedAgreement(id) { return this._openFile(`/applications/${id}/agreement/signed`); },
  async downloadSignedAgreement(id) { return this._downloadFile(`/applications/${id}/agreement/signed`, `Signed-agreement-${id}.pdf`); },
  // Open a file endpoint in a new tab (best-effort; falls back to download).
  async _openFile(path) {
    const token = store.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${BASE}${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status, `Open failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  agents: () => request('/agents'),
  marketing: () => request('/marketing'),
  audit: () => request('/audit'),

  // M3 — agent portal + public intake.
  agentMe: () => request('/agent/me'),
  submitIntake: (formData) => request('/intake', { method: 'POST', body: formData }),
  // Fetch a file endpoint as a blob and trigger a browser save. Self-contained
  // because request() only handles JSON responses.
  async _downloadFile(path, fallbackName) {
    const token = store.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${BASE}${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : fallbackName;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
  },
  // Public: blank Agent Application Form PDF for applicants on the intake page.
  downloadApplicationForm() { return this._downloadFile('/application-form/download', 'Agent Application Form.pdf'); },
  downloadMarketing(id) { return this._downloadFile(`/marketing/${id}/download`, `asset-${id}.pdf`); },
  downloadDocument(id) { return this._downloadFile(`/documents/${id}/download`, `document-${id}`); },
};
