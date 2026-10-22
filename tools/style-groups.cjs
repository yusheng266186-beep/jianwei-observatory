// This order is the existing cascade. Placeholders remain in this order even
// when a feature is requested later, so late network responses cannot restyle it.
const group=(name,feature,sheets)=>({name,feature,sheets:sheets.map(s=>s==='base'?'styles.css':'styles/'+s+'.css')});
const groups=[
 // reports.css also contains shared teaching-plan and follow-page controls.
 group('foundation','',['base','journey','glass','reading-fonts','typography','questions','material','reports','controls','question-glass']),
 group('report-reading','reports',['report-reading']),
 group('papers','papers',['paper-material']),
 group('runtime','',['runtime']),
 group('exercises','exercises',['exercises','exercise-center','exercise-feedback']),
 group('finish','',['research-continuity','archive','fields','wheels','refinement','visual-language'])
];
module.exports={groups};
