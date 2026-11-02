import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const manifest=JSON.parse(await readFile(new URL('../renderer/manifest.json',import.meta.url),'utf8'));
for(const [path,sha] of Object.entries(manifest.files)) {
 const bytes=await readFile(new URL(`../renderer/dist/${path}`,import.meta.url));
 if(createHash('sha256').update(bytes).digest('hex')!==sha)throw new Error(`Rebuild manifest needed for ${path}`);
}
console.error(`Verified ${Object.keys(manifest.files).length} renderer files.`);
