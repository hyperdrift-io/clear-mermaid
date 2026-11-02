import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../renderer/dist/',import.meta.url));const files={};
for(const entry of await readdir(root,{recursive:true,withFileTypes:true})) {
 if(!entry.isFile())continue;const path=join(entry.parentPath,entry.name);const name=path.slice(root.length).split('\\').join('/');files[name]=createHash('sha256').update(await readFile(path)).digest('hex');
}
await writeFile(new URL('../renderer/manifest.json',import.meta.url),JSON.stringify({source:'HD shared Clear Mermaid d4cfaa3',files},null,2)+'\n');
