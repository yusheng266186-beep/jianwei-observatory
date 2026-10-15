export function exerciseIdentity(atlas,record){
 const row=atlas.materialAt(record.sid,record.exam),saved=record.student;
 return {name:saved?.name||(atlas.people.has(record.sid)?atlas.name(record.sid):'专项练习'),classNo:saved?.classNo??row?.classNo,exam:saved?.examLabel||atlas.exam(record.exam)?.label||''};
}
