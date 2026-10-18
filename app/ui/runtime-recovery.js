export const isRuntimeLoadError=error=>/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|Failed to load module script/i.test(String(error?.message||error));
export const runtimeFailureMessage=error=>isRuntimeLoadError(error)?'页面组件暂时未能载入。可刷新获取最新版本；已保存的材料与草稿仍保留在本机。':String(error?.message||error||'请重试');
