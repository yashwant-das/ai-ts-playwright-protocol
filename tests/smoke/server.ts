import { createServer } from 'node:http';

// Deliberately small local contract fixture, not a copy of Sauce Demo.
const login = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Controlled login</title>
<form><input placeholder="Username" autocomplete="username"><input placeholder="Password" type="password" autocomplete="current-password"><button type="submit">Login</button></form>
<div data-test="error" hidden><span>Epic sadface: Sorry, this user has been locked out.</span><button aria-label="Dismiss error"></button></div>
<script>
const form = document.querySelector('form');
const error = document.querySelector('[data-test="error"]');
form.addEventListener('submit', event => {
  event.preventDefault();
  const [username, password] = form.querySelectorAll('input');
  if (username.value === 'standard_user' && password.value === 'secret_sauce') location.href = '/inventory.html';
  else error.hidden = false;
});
error.querySelector('button').addEventListener('click', () => { error.hidden = true; });
</script></html>`;
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.url === '/') response.end(login);
  else if (request.url === '/inventory.html')
    response.end(
      '<!doctype html><html lang="en"><title>Inventory</title><div data-test="inventory-item">Controlled item</div></html>',
    );
  else {
    response.statusCode = 404;
    response.end('Not found');
  }
});
server.listen(4173, '127.0.0.1');
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
