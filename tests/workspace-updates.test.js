import test from 'node:test';
import assert from 'node:assert/strict';
import {planDraftMatches} from '../app/data/workspace-drafts.js';
test('载入新材料后从同一学生入口继续未提交计划，不把草稿套给其他对象或考次',()=>{
 const draft={sid:'a',exam:'52',training:{key:'数学|52',goal:'未提交目标'}};
 assert(planDraftMatches({},draft));assert(planDraftMatches({sid:'a',exam:'52'},draft));assert(planDraftMatches({sid:'a',exam:52,key:'数学|52'},draft));
 assert(!planDraftMatches({sid:'b'},draft));assert(!planDraftMatches({exam:'51'},draft));assert(!planDraftMatches({key:'物理|52'},draft));
 assert(!planDraftMatches({sid:'a'},{...draft,id:'saved'}));assert(planDraftMatches({id:'saved'},{...draft,id:'saved'}));assert(!planDraftMatches({id:'other'},{...draft,id:'saved'}));
});
