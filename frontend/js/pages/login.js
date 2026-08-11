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
          <div class="sidebar__logo">A</div> Agent Management Portal
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
          <div class="login__hint">Not a partner yet? <a href="#/apply" style="color:var(--color-primary);font-weight:600;">Apply to become a partner →</a></div>
          <div class="login__hint">Demo: admin@kmc.edu.au (admin) · agent@sunriseoverseas.in (agent)</div>
        </form>
      </div>
    </div>`;

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
