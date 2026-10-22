const one=(source,pattern,replacement,label)=>{const count=[...source.matchAll(pattern)].length;if(count!==1)throw new Error(label+' expected once, found '+count);return source.replace(pattern,replacement);};
const styleLinks=/<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])[^>]*>\s*/gi;
function indexHTML(source,{launch,landingCSS,runtimeCSS,workspaceStyles=[{file:runtimeCSS,feature:''}],dock}){
 const launchPattern=/<script\b(?=[^>]*\bsrc\s*=\s*(["'])\.\/app\/launch\.js(?:\?[^"']*)?\1)[^>]*>\s*<\/script>/gi;
 // Check before removing any styles: unknown/missing entry markup must fail.
 one(source,launchPattern,'','Launch entry');
 const template=[...source.matchAll(/<template\b[^>]*\bid\s*=\s*["']empty-workspace-template["'][^>]*>([\s\S]*?)<\/template>/gi)];
 if(template.length!==1)throw new Error('Empty workspace template expected once');
 let html=source.replace(styleLinks,'').replace(/<style\b[^>]*data-landing-critical[^>]*>[\s\S]*?<\/style>\s*/gi,'');
 const styles=workspaceStyles.map(s=>'<link rel="stylesheet" data-href="./'+s.file+'" '+(s.feature?'data-feature-styles="'+s.feature+'"':'data-workspace-styles')+'>').join('\n  ');
 html=one(html,launchPattern,'<style data-landing-critical>'+landingCSS+'</style>\n  '+styles+'\n  '+launch,'Launch entry');
 html=one(html,/<main\b[^>]*\bid\s*=\s*["']stage["'][^>]*>[\s\S]*?<\/main>/gi,'<main id="stage" tabindex="-1" aria-busy="false">'+template[0][1]+'</main>','Workspace stage');
 html=one(html,/<nav\b[^>]*\bclass\s*=\s*["'][^"']*\bnavigation-dock\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi,match=>match.match(/^<nav[^>]*>/i)[0]+dock+'</nav>','Navigation dock');
 if((html.match(/data-workspace-styles/g)||[]).length!==workspaceStyles.filter(s=>!s.feature).length)throw new Error('Workspace style entry missing');
 return html;
}
function standaloneHTML(source,{entry,links}){
 let html=one(source,/<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=)[^>]*>\s*<\/script>/gi,'<script type="module" src="./app/'+entry+'"></script>','Standalone entry');
 html=html.replace(styleLinks,'');
 html=one(html,/<\/title>/gi,'</title>'+links,'Standalone title');
 if(!/\brel\s*=\s*["']icon["']/i.test(html))html=html.replace('</title>','</title><link rel="icon" type="image/png" href="./assets/school-crest-192.png?v=entry-v1">');
 return html;
}
module.exports={indexHTML,standaloneHTML,one};
