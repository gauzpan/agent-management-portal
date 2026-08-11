// App state + session persistence. In M1 the session is the stub-login result
// (token + role). Swapped for Supabase Auth state in M6.
const SESSION_KEY = 'amp.session';

let session = null;
try {
  session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
} catch {
  session = null;
}

export const store = {
  getSession: () => session,
  getToken: () => (session ? session.token : null),
  getRole: () => (session ? session.role : null),
  isAuthed: () => !!session,

  setSession(next) {
    session = next;
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  },
  clearSession() {
    session = null;
    localStorage.removeItem(SESSION_KEY);
  },
};
