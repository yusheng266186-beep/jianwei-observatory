import {readFile} from 'node:fs/promises';
const root=new URL('../assets/report-fonts/',import.meta.url);
// Exercise PDF tests use the actual local font's measurements, without a
// browser font canvas or outbound network. Worker/cache behaviour stays real.
export function localReportFonts(t){t.mock.method(globalThis,'fetch',async input=>{const url=new URL(String(input));if(url.protocol!=='file:'||!url.pathname.startsWith(root.pathname))throw Error('Unexpected test resource: '+url.pathname);return new Response(await readFile(url));});}
