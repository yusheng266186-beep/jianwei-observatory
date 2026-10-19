// Keep the selected policy consistent in the composer, saved drafts and history.
// Historical requests without a policy allowed optional SVG, never raster.
export const exerciseVisualOptions=[
 {value:'auto',label:'自动判断 · 由题目决定'},
 {value:'none',label:'不配图 · 文字与公式'},
 {value:'vector',label:'按题目需要配SVG图示'},
 {value:'hybrid',label:'按需配图，允许复杂插图'}
];
export const exerciseVisualLabel=value=>({auto:'自动判断 · 按题目需要配图',none:'不配图 · 文字与公式',vector:'按需SVG图示',hybrid:'按需图示与复杂插图'}[value]||'按需SVG图示');
