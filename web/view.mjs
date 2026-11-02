import { renderSource } from './renderer/clear-mermaid.js';
const base = new URL('../', location.href);
const id = location.pathname.split('/').at(-1);
const status = document.querySelector('#status');
try {
  const response = await fetch(new URL(`source/${id}`, base));
  if (!response.ok) throw new Error('This diagram link has expired. Ask your assistant to create it again.');
  const { source, title } = await response.json();
  document.querySelector('h1').textContent = title;
  document.title = `${title} — Clear Mermaid`;
  document.querySelector('#source').textContent = source;
  document.querySelector('#download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'diagram.mmd'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const { reader } = await renderSource(document.querySelector('#diagram'), source);
  const composition = reader.shadowRoot.querySelector('.composition');
  if (composition) composition.textContent = composition.textContent.replace(/^WR\b/, 'Clear Mermaid');
  status.textContent = '';
} catch (error) {
  status.setAttribute('role', 'alert');
  status.textContent = `Clear Mermaid could not display this diagram. ${error.message}`;
}
