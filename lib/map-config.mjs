import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
const file=resolve(import.meta.dirname,'../config/google-maps.local.json');
export function validateMapConfig(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['apiKey','mapId','storeSource'].includes(k)))throw new Error('地图设置格式不正确。');
  const apiKey=String(input.apiKey||'').trim(),mapId=String(input.mapId||'').trim();
  if(apiKey&&!/^[A-Za-z0-9_-]{20,150}$/.test(apiKey))throw new Error('请粘贴完整的 Google Maps API 密钥。');
  if(mapId&&!/^[A-Za-z0-9_-]{1,100}$/.test(mapId))throw new Error('Map ID 格式不正确。');
  const storeSource=input.storeSource||'osm';if(!['osm','google'].includes(storeSource)||storeSource==='google'&&!apiKey)throw new Error('Google 地点查询需要密钥。');
  return {apiKey,mapId,storeSource};
}
export async function readMapConfig(){try{return validateMapConfig(JSON.parse(await readFile(file,'utf8')));}catch(e){if(e.code==='ENOENT')return {apiKey:'',mapId:'',storeSource:'osm'};throw e;}}
export async function saveMapConfig(input){const config=validateMapConfig(input);await writeFile(file+'.tmp',JSON.stringify(config,null,2),'utf8');await rename(file+'.tmp',file);}
