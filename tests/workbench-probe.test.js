import test from 'node:test';
import assert from 'node:assert/strict';
import {probeRecovery} from '../assets/workbench-probe.js';
test('missing, expired and denied probes terminate rather than claiming a recoverable connection',()=>{
 for(const error of [{code:'JOB_NOT_FOUND'},{code:'JOB_EXPIRED'},{code:'JOB_REMOVED'},{status:404},{status:410},{status:403,message:'访问已撤回'}])assert.equal(probeRecovery(error).retry,false);
 assert.match(probeRecovery({status:404}).message,/重新测试/);
});
test('temporary failures back off while continuing only the original probe',()=>{
 for(const error of [Error('network'),{status:408},{status:429},{status:500},{status:503}]){
  assert.deepEqual(probeRecovery(error,1),{retry:true,delay:5000});assert.equal(probeRecovery(error,2).delay,10000);assert.equal(probeRecovery(error,10).delay,30000);
 }
});
