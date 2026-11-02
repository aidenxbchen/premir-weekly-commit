import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const run=promisify(execFile);
const app='app_17b0qs50x8v';
const dir='local-data/snapshot-2026-09-11';
await mkdir(dir,{recursive:true});
async function cli(args){const {stdout}=await run('lark-cli',['apps',...args,'--app-id',app,'--environment','online','--as','user'],{maxBuffer:20*1024*1024});const result=JSON.parse(stdout);if(!result.ok)throw Error(JSON.stringify(result.error));return result.data;}
const list=await cli(['+db-table-list','--page-size','100']);
if(list.has_more)throw Error('Table list requires pagination');
const tables=[];
for(const item of list.items){
 const schema=await cli(['+db-table-get','--table',item.name]);
 await writeFile(`${dir}/${item.name}.schema.json`,JSON.stringify(schema,null,2));
 await cli(['+db-data-export','--table',item.name,'--output',`${dir}/${item.name}.json`]);
 const raw=await readFile(`${dir}/${item.name}.json`);
 const rows=JSON.parse(raw);
 tables.push({name:item.name,rows:rows.length,sha256:createHash('sha256').update(raw).digest('hex')});
 console.log(item.name,rows.length);
}
const {stdout:commit}=await run('git',['rev-parse','HEAD']);
await writeFile(`${dir}/manifest.json`,JSON.stringify({app,environment:'online',exportedAt:new Date().toISOString(),commit:commit.trim(),tables},null,2));
console.log('Snapshot complete');
