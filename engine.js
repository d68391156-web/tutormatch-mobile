import {inflateSync} from './fflate.js';
export const DEFAULT_PROFILE={school:'长沙理工大学',gender:'男生',schoolType:'双非',year:'大三',major:'电气工程及其自动化',origin:'长沙理工大学云塘校区',minRate:60,maxCommute:60};
const MAX=10*1024*1024;
export const norm=s=>String(s||'').normalize('NFKC').replace(/[【〖「]([^】〗」]+)[】〗」]\s*[:：]?/g,'$1:');
export async function hash(data){const b=typeof data==='string'?new TextEncoder().encode(data):data;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const CRC=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;CRC[n]=c>>>0;}
function crc32(b){let c=0xffffffff;for(const n of b)c=CRC[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function decode(b){for(const encoding of b[0]===255&&b[1]===254?['utf-16le']:b[0]===254&&b[1]===255?['utf-16be']:['utf-8','gb18030']){try{return new TextDecoder(encoding,{fatal:true}).decode(b).replace(/^\ufeff/,'');}catch{}}throw Error('文本编码无法识别，请从微信重新导出。');}
export function readFile(name,buffer){
 const b=new Uint8Array(buffer);if(b.length>MAX)throw Error('每个文件最多10MB，请分批导出。');
 if(!/\.zip$/i.test(name)){if(!/\.(txt|md|markdown)$/i.test(name))throw Error('请选择微信 ZIP、TXT 或 Markdown 文件。');return [{name,text:decode(b)}];}
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const u16=i=>{if(i<0||i+2>b.length)throw Error('ZIP 文件不完整。');return v.getUint16(i,true);};
 const u32=i=>{if(i<0||i+4>b.length)throw Error('ZIP 文件不完整。');return v.getUint32(i,true);};
 if(b.length<22)throw Error('ZIP 文件不完整。');let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===b.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6))throw Error('不支持损坏或分卷 ZIP。');
 const count=u16(end+10),start=u32(end+16),size=u32(end+12);
 if(!count||count>200||count!==u16(end+8)||start+size>end)throw Error('ZIP 目录异常或文件过多。');
 const files=[];let p=start,total=0;
 for(let i=0;i<count;i++){
  if(u32(p)!==0x02014b50)throw Error('ZIP 目录损坏。');
  const flags=u16(p+8),method=u16(p+10),crc=u32(p+16),compressed=u32(p+20),expanded=u32(p+24),n=u16(p+28),ex=u16(p+30),comment=u16(p+32),off=u32(p+42);
  if(flags&1||p+46+n+ex+comment>start+size)throw Error('不支持加密或损坏的 ZIP。');
  const entry=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p+46,p+46+n));p+=46+n+ex+comment;
  if(entry.startsWith('/')||entry.includes('\\')||entry.split('/').includes('..'))throw Error('ZIP 包含不安全路径。');
  total+=expanded;if(expanded>MAX||total>20*1024*1024)throw Error('解压内容超过20MB，请分批导出。');
  if(entry.startsWith('__MACOSX/')||!/\.(txt|md|markdown)$/i.test(entry))continue;
  if(![0,8].includes(method)||u32(off)!==0x04034b50||u16(off+8)!==method||u16(off+6)&1)throw Error('ZIP 压缩格式不支持。');
  const begin=off+30+u16(off+26)+u16(off+28);if(begin+compressed>start)throw Error('ZIP 内容截断。');
  const source=b.subarray(begin,begin+compressed);
  let out;if(method===0){if(compressed!==expanded)throw Error('ZIP 长度不一致。');out=source;}else{out=inflateSync(source,{out:new Uint8Array(expanded)});}
  if(out.length!==expanded||crc32(out)!==crc)throw Error('ZIP 校验失败，请重新导出。');
  files.push({name:entry,text:decode(out)});
 }
 if(!files.length)throw Error('ZIP 内没有可读取的聊天文本，不会报告导入成功。');return files;
}
function dateISO(s){const m=s.match(/^(\d{4})(?:年|[-/])(\d{1,2})(?:月|[-/])(\d{1,2})(?:日)?[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/);if(!m)return null;const value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}T${m[4].padStart(2,'0')}:${m[5]}:${m[6]||'00'}${m[7]||'+08:00'}`;const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
export async function parseText(text,group){
 if(text.startsWith('TutorMatch UTF-8 聊天记录 v1\n')){const rows=[];for(const line of text.split('\n').slice(1).filter(Boolean)){let r;try{r=JSON.parse(line);}catch{throw Error('TXT 结构损坏。');}if(typeof r.text!=='string')throw Error('TXT 缺少正文。');rows.push({group,sender:r.sender||null,date:r.timestamp&&Number.isFinite(Date.parse(r.timestamp))?new Date(r.timestamp).toISOString():null,body:r.text});}return identify(rows);}
 const lines=text.replace(/\r\n?/g,'\n').split('\n'),rows=[];let body=[],sender=null,date=null;
 const flush=()=>{const raw=body.join('\n').trim();if(raw)rows.push({group,sender,date,body:raw});body=[];};
 for(let i=0;i<lines.length;i++){
  const line=lines[i];let dt;
  if(line.startsWith('·')&&i+1<lines.length&&(dt=dateISO(lines[i+1].trim()))){flush();sender=line.slice(1).trim()||null;date=dt;i++;continue;}
  const m=line.match(/^\s*\[?(\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s*(.*)$/);
  if(m&&(dt=dateISO(m[1]))){flush();date=dt;sender=null;if(m[2])body.push(m[2]);continue;}
  body.push(line);if(rows.length>10000)throw Error('每批最多10000条消息。');
 }
 flush();return identify(rows);
}
async function identify(rows){if(rows.length>10000)throw Error('每批最多10000条消息。');for(const r of rows)r.id=await hash(JSON.stringify([r.group,r.sender,r.date,r.body]));return rows;}
function field(raw,labels){for(const line of norm(raw).split('\n')){const clean=line.replace(/^[^\p{L}\p{N}]*/u,'');const m=clean.match(new RegExp(`^(?:${labels})\\s*[:：]\\s*(.+)`));if(m)return m[1].trim();}return null;}
export function address(raw){const s=field(raw,'家教地址|家庭住址|学生地址|学员地址|上门地址|上门地点|授课地点|上课地点|辅导地点|联系地址|授课地址|上课地址|辅导地址|地址|地点|位置|住址|坐标');return s&&!/^(待定|待核实|未定|不详|线上|线上授课)$/.test(s)?s:null;}
export function teacher(raw){let active=false;const result=[];for(const line of norm(raw).split('\n')){const s=line.replace(/^[^\p{L}\p{N}]*/u,'');const m=s.match(/^(?:对(?:老师|教师|教员)(?:的)?要求|(?:老师|教师|教员)(?:性别|学历|院校)?要求|师资要求|综合要求|要求)\s*[:：]?\s*(.*)/);if(m){active=true;result.push(m[1]);}else if(/^上课模式\s*[:：]/.test(s)&&/女老师|男老师/.test(s)){active=false;result.push(s);}else if(/^[^:：]{1,16}[:：]/.test(s)){active=false;}else if(active){result.push(s);}else if(/只要女生|只招女生|仅限女|男老师|女老师/.test(s)&&!/^(学生|学员|地址|地点|家教地址|家庭住址)/.test(s)){result.push(s);}}
 for(const line of norm(raw).split('\n'))if(/^(工资|薪资|薪酬|报酬|课费|课时费|老师薪水)\s*[:：]/.test(line)&&!/本科院校|普通本科|双非|其他院校/.test(line)&&/(?:985|211)(?:的|老师|在读)|\/h\s*(?:211\/985|985\/211)/i.test(line))result.push(line);
 return result.join('\n');}
export function conflicts(requirement,p=DEFAULT_PROFILE){const text=norm(requirement),reasons=[];const both=/男女(?:老师|生)?(?:不限|均可|都可)|性别不限|不限性别/.test(text);const maleAllowed=/男(?:老师|生)?\s*(?:也可|可以|可投|均可|都可|优先)|最好男/.test(text);const withoutNegative=text.replace(/(?:不要|不招|不需要|不要求|不限制|不限|无需|不考虑)\s*(?:女大学生老师|女老师|女教师|女生|女性|女)/g,'');const female=/女大学生|女本科生|女研究生|女老师|女教师|女教员|女生|女性|(?:^|[\n,，;；])\s*女(?=[,，;；\s]|$)/.test(withoutNegative),femalePreferred=/女(?:老师|生)?\s*(?:优先|为佳)|(?:优先|最好|倾向)\s*女/.test(text);
 if(p.gender==='男生'&&(femalePreferred||!both&&!maleAllowed&&(female||/不(?:要|招|接受|考虑)男/.test(text))))reasons.push('要求或优先女老师，与本人男生不符');
 if(p.schoolType==='双非')for(const original of text.split(/[\n，,；;。]/)){const c=original.replace(/不(?:要求|限制|限|需要|必|一定要|强制)\s*(?:985\s*[/、或和 ]*211|985|211|三大校|92)/g,'');if(/双非(?:也|都|均)?(?:可|接受)|长沙理工(?:大学)?(?:也|都|均)?(?:可|接受)/.test(c))continue;if(/(?<!\d)(?:985211|985|211|92)(?!\d)|三大校|三所名校|中南(?:大学|大)?(?!林业)|湖南大学|湖大|湖南师范大学|湖师大|师大(?!附中|附小|附属|附近|旁|教材|学生|中学)/.test(c))reasons.push('院校要求不符，本人为长沙理工大学（双非）');}
 if(['大一','大二','大三','大四','大五'].includes(p.year))for(const c of text.split(/[\n，,；;。]/)){if(/本科(?:生|在读)?(?:也可|可|均可|即可)|研究生(?:优先|最好|为佳)|最好是研究生|不要求研究生/.test(c))continue;if(/已毕业|毕业生|研究生|硕士|博士/.test(c))reasons.push('要求已毕业或研究生，本人为本科在读');}
 return [...new Set(reasons)];}
const digits={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function grade(raw){const value=field(raw,'学生年级|孩子年级|年级性别|年级|学员情况|学生情况|学员')||raw;let m=value.match(/(初|高)([一二三1-3])/);if(m){const n=digits[m[2]]||Number(m[2]);return {name:m[1]+['','一','二','三'][n],rank:(m[1]==='初'?6:9)+n};}m=value.match(/([一二三四五六七八九1-9])年级/);if(m){const n=digits[m[1]]||Number(m[1]);return {name:n<=6?`小学${n}年级`:`${n}年级`,rank:n};}return {name:null,rank:0};}
function subjects(raw){const value=(field(raw,'辅导科目|授课科目|科目')||field(raw,'学生年级|孩子年级|年级')||raw).replaceAll('语数英','语文数学英语').replaceAll('数理化','数学物理化学');return ['数学','物理','语文','英语','化学','生物','地理','历史','政治','全科'].filter(x=>value.includes(x));}
function rate(raw){const q=(field(raw,'老师薪水|课时费|课费|课酬|薪资|薪酬|待遇|价格|报酬|时薪')||'').replace(/(\/h)\s*(?=211|985)/ig,'$1 ');const m=q.match(/(\d+(?:\.\d+)?)(?:\s*[-~到至]\s*(\d+(?:\.\d+)?))?\s*(?:元)?\s*(?:\/|每|一(?:个)?)\s*(\d+(?:\.\d+)?)?\s*(?:小时|[hH])(?!\d)/);if(!m)return [null,null];const d=Number(m[3]||1);return d>0?[Number(m[1])/d,Number(m[2]||m[1])/d]:[null,null];}
function reference(raw){const text=norm(raw);return text.match(/(?:编号|家庭单|订单号)\s*[:：]?\s*([A-Za-z]*\d{4,}[A-Za-z0-9_-]*)/)?.[1]||text.match(/^\s*([A-Z]{1,8}\d{4,}[A-Z0-9_-]*)/m)?.[1]||null;}
export function blocks(raw){const text=norm(raw),hits=[...text.matchAll(/^[^\p{L}\p{N}\n]*(?:(?:上门编号|编号|家庭单|订单号)\s*[:：]?\s*)?[A-Z]{1,8}\d{4,}[A-Z0-9_-]*/gmu)];if(hits.length<2)return [raw];const starts=hits.map(x=>x.index);starts[0]=0;return starts.map((n,i)=>text.slice(n,starts[i+1]??text.length).trim());}
export async function analyze(messages,p=DEFAULT_PROFILE){const merged=new Map();for(const m of [...messages].sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0))){for(const raw of blocks(m.body)){if(/求职|个人简历|本人接家教/.test(raw)&&!/招聘|老师要求|教员要求/.test(raw))continue;const g=grade(raw),ss=subjects(raw);if(!/家教|老师|辅导|招聘|课酬|薪资|价格|课时费/.test(raw)||(!g.rank&&!ss.length))continue;const requirements=teacher(raw),[min,max]=rate(raw),addr=address(raw),ref=reference(raw);const id=await hash(ref?`${m.group}|id:${ref}`:`${m.group}|${norm(raw).replace(/\s+/g,'')}`);const failures=conflicts(requirements,p),unknowns=[];
 if(/已招满|已找到老师|停止招聘|已结单/.test(raw))failures.push('原文已声明招聘结束');if(max!==null&&max<p.minRate)failures.push(`课时费低于${p.minRate}元/小时`);if(min===null)unknowns.push('课时费待确认');else if(min<p.minRate&&max>=p.minRate)unknowns.push('报价区间跨过最低时薪，请确认报价');
 if(!requirements)unknowns.push('原文未明确老师要求');if(!addr)unknowns.push('地点待确认');if(!g.rank)unknowns.push('年级待确认');if(!ss.length)unknowns.push('科目待确认');if(ss.length&&!(g.rank>=7&&g.rank<=9&&ss.every(x=>['数学','物理'].includes(x))))unknowns.push('请确认本人能否辅导该年级科目');const schedule=field(raw,'上课时间|辅导时间|时间安排|时间');if(!schedule)unknowns.push('上课时间待确认');if(!m.date)unknowns.push('发布时间未知，无法确认在最近72小时内');unknowns.push('公交 / 地铁时间待核实，不使用驾车时间');
 const source={messageID:m.id,group:m.group,sender:m.sender,date:m.date},sources=merged.get(id)?.sources||[];if(!sources.some(x=>x.messageID===m.id))sources.push(source);
 merged.set(id,{id,reference:ref,grade:g.name,rank:g.rank,subjects:ss,address:addr,rateMin:min,rateMax:max,schedule,contact:raw.match(/(?<!\d)1[3-9]\d{9}(?!\d)/)?.[0]||field(raw,'微信号|联系电话|联系方式'),requirements,body:raw,failures,unknowns,sources,published:sources.map(s=>s.date).filter(Boolean).sort().at(-1)||null});
 }}return [...merged.values()].sort((a,b)=>b.rank-a.rank||(Date.parse(b.published)||0)-(Date.parse(a.published)||0));}
export async function importBatch({files,group,state}){
 group=group.trim();if(!group||group.length>100)throw Error('请确认正确的来源群名。');if(!files.length||files.length>20)throw Error('每批请选择1到20个同群文件。');
 let bytes=0,rows=[];const originals=[];
 for(const f of files){bytes+=f.buffer.byteLength;if(bytes>20*1024*1024)throw Error('本批文件超过20MB，请分批导入。');for(const t of readFile(f.name,f.buffer))rows.push(...await parseText(t.text,group));originals.push({id:await hash(f.buffer),name:f.name,group,buffer:f.buffer});}
 if(!rows.length)throw Error('没有读到聊天正文，未导入。');if(rows.length>10000)throw Error('本批消息超过10000条。');
 const ids=new Set(state.messages.map(x=>x.id)),messages=[...state.messages];let added=0;for(const row of rows)if(!ids.has(row.id)){messages.push(row);ids.add(row.id);added++;}
 if(messages.length>50000)throw Error('本机最多保存50000条消息，请先备份并清理旧记录。');
 const next={...state,messages,groups:[...new Set([...state.groups,group])]};const jobs=await analyze(messages,next.profile);
 return {state:next,jobs,originals,report:{messages:rows.length,added,duplicates:rows.length-added,undated:rows.filter(x=>!x.date).length,candidates:jobs.length}};
}
