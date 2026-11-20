// The local test site used by the end-to-end tests and the store screenshot.
export const PAGES = {
  '/app.html': `<!doctype html><title>Sign up</title><body>
    <form action="/welcome.html" method="get">
      <label>Email <input id="email" data-testid="email" name="email" type="email"></label>
      <label>Password <input name="password" type="password"></label>
      <select id="plan" name="plan"><option>Free</option><option>Pro</option><option>Team</option></select>
      <input type="checkbox" id="terms" name="terms"><label for="terms">I agree</label>
      <button type="submit" class="btn primary">Sign up</button>
    </form></body>`,
  '/welcome.html': `<!doctype html><title>Welcome</title><body><h1></h1><p>Plan: <b id="plan-name"></b></p>
    <button id="alert-btn" onclick="alert('Saved!')">Save</button> <a href="/settings.html">Settings</a>
    <script>const q = new URLSearchParams(location.search);
      setTimeout(() => { document.querySelector('h1').textContent = 'Welcome, ' + q.get('email'); }, 400);
      document.getElementById('plan-name').textContent = q.get('plan');</script></body>`,
  '/settings.html': '<!doctype html><title>Settings</title><body><h1>Settings</h1></body>',
};
