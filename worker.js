import {importBatch,analyze} from './engine.js';
self.onmessage=async e=>{try{const r=e.data.type==='analyze'?{jobs:await analyze(e.data.state.messages,e.data.state.profile)}:await importBatch(e.data);self.postMessage({ok:true,result:r});}catch(err){self.postMessage({ok:false,error:err.message||'本地解析失败'});}};
