// Explicit SVG colors also survive standalone SVG/PNG exports.
export const plotPalette=Object.freeze({
  series:Object.freeze(['#315f83','#7098ad','#8999a6','#506b81']),
  grid:'#d7e4ef', point:'#fafdff', axis:'#6e8aa144', well:'#8aa6bd14',
  positiveLight:'#bbd0de', positive:'#4a799a',
  negativeLight:'#bbc8d4', negative:'#607487',
  distributionLight:'#b7cfdd', distribution:'#507d9c', threshold:'#214e77',
  profileUnder:'#527e9e', profileUnderLight:'#cfdfeb',
  profileTop:'#2b567b', profileTopLight:'#b3cbdc',
  label:'#42647f', caption:'#536c82', tick:'#6e8aa14f',
  rates:Object.freeze({missing:'#e6eaf0',low:'#d7e0e9',medium:'#e3eff8',high:'#bfdced'}),
  answerBands:Object.freeze({zero:'#61778c',low:'#97afc2',focus:'#bfdced',secure:'#5e96b6',full:'#1f5186',scored:'#5e96b6',missing:'#e6eaf0'})
});
