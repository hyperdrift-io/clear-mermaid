import { App } from '@modelcontextprotocol/ext-apps';
const app = new App({ name: 'Clear Mermaid', version: '0.2.0' });
const status = document.querySelector('#status');
const diagram = document.querySelector('#diagram');
let generation = 0;
let latest;
let renderPromise;
const reportError = message => {
  status.setAttribute('role', 'alert');
  status.textContent = message;
};
async function show(result) {
  const current = ++generation;
  if (result?.isError) { diagram.replaceChildren(); reportError('This diagram could not be prepared. Ask the assistant to revise its Mermaid source.'); return; }
  const data = result?.structuredContent;
  if (!data || typeof data.source !== 'string' || data.source.length > 30000 || typeof data.title !== 'string') return;
  latest = data;
  document.querySelector('h1').textContent = data.title;
  document.querySelector('#source').textContent = data.source;
  document.querySelector('#open').hidden = !data.url;
  status.setAttribute('role', 'status'); status.textContent = 'Checking and drawing your diagram…';
  const host = document.createElement('div'); diagram.replaceChildren(host);
  try {
    renderPromise ??= import(/* @vite-ignore */ `${document.body.dataset.renderer}clear-mermaid.js`);
    const { renderSource } = await renderPromise;
    if (current !== generation) return;
    const { reader } = await renderSource(host, data.source, { isCurrent: () => current === generation });
    if (current !== generation) return;
    const label = reader.shadowRoot.querySelector('.composition');
    if (label) label.textContent = label.textContent.replace(/^WR\b/, 'Clear Mermaid');
    status.textContent = '';
  } catch(error) {
    if (current !== generation) return;
    host.replaceChildren(); reportError(`Clear Mermaid could not display this diagram. ${error.message}`);
  }
}
app.ontoolresult = show;
const teardown = () => { generation++; diagram.replaceChildren(); };
app.onteardown = async () => { teardown(); return {}; };
window.addEventListener('pagehide', teardown);
app.onhostcontextchanged = context => { if (context.theme === 'light' || context.theme === 'dark') document.documentElement.style.colorScheme = context.theme; };
document.querySelector('#open').addEventListener('click', async () => {
  if (!latest?.url) return;
  try { await app.openLink({ url: latest.url }); } catch { reportError('This chat cannot open the full view. Use the diagram link in the tool result.'); }
});
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme === 'light' || theme === 'dark') document.documentElement.style.colorScheme = theme;
