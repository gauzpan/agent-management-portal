// Login screen — matches the designer's split hero/panel comp. Stub auth:
// posts email to /auth/login, stores the returned session, routes to the
// role's home. Any of the seeded emails work; password is ignored in M1.
import { api } from '../api.js';
import { store } from '../store.js';
import { defaultRouteForRole } from '../nav.js';
import { toast } from '../ui.js';

export function renderLogin(mount, { navigate }) {
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
          <div class="login__headline">A single home for every education agent partnership.</div>
          <div class="login__blurb">Onboard lawfully, monitor performance, share the right collateral, and stay compliant with ESOS and ASQA — from one workspace.</div>
        </div>
        <div class="login__badges">
          <div>ESOS Act aligned</div><div>ASQA standards</div><div>PRISMS · ASQAnet ready</div>
        </div>
      </div>
      <div class="login__panel">
        <form class="login__card" id="login-form">
          <div class="login__title">Sign in</div>
          <div class="login__subtitle">Use your college workspace credentials.</div>
          <label class="field">Work email
            <input id="login-email" type="email" placeholder="admin@kmc.edu.au" value="admin@kmc.edu.au" required>
          </label>
          <label class="field">Password
            <input id="login-password" type="password" placeholder="••••••••••" value="demo">
          </label>
          <button class="btn-primary" type="submit">Sign in</button>

          <div style="display:flex;align-items:center;gap:10px;margin:16px 0 4px;color:var(--color-ink-faint);font-size:11px;">
            <span style="flex:1;height:1px;background:var(--color-hairline);"></span>New agent?<span style="flex:1;height:1px;background:var(--color-hairline);"></span>
          </div>
          <button type="button" id="apply-cta"
            style="width:100%;padding:12px 16px;background:#fff;color:var(--color-primary);border:1px solid var(--color-primary);
              border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">
            Apply to become a partner →
          </button>

          <div class="login__hint">Demo: admin@kmc.edu.au (admin) · agent@sunriseoverseas.in (agent)</div>
        </form>
      </div>
    </div>`;

  mount.querySelector('#apply-cta').addEventListener('click', () => navigate('apply'));

  mount.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = mount.querySelector('#login-email').value.trim();
    const password = mount.querySelector('#login-password').value;
    try {
      const res = await api.login(email, password);
      store.setSession(res);
      navigate(defaultRouteForRole(res.role));
    } catch (err) {
      toast(err.message);
    }
  });
}
