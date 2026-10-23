import {esc,button} from './html.js';

// Shared styles are present before either feature's optional stylesheet loads.
export function surfaceLoadingHTML({titleId,title,overline,message,closeCommand}){
 return '<section class="surface-loading"><span class="overline">'+esc(overline)+'</span><h2 id="'+esc(titleId)+'">'+esc(title)+'</h2><p role="status"><span class="surface-loading-mark" aria-hidden="true"></span>'+esc(message)+'</p>'+button('关闭',closeCommand,{},'outline')+'</section>';
}
