import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';
import {lookupPlaces,parseQuery} from './lib/places.mjs';import {PriceService} from './lib/prices.mjs';
import {offerState} from './lib/lidl.mjs';
import {readMapConfig,saveMapConfig} from './lib/map-config.mjs';
import {parseLocationQuery,geocodeLocation} from './lib/geocode.mjs';
const root=resolve(import.meta.dirname,'public');const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const prices=new PriceService();await prices.init();let refreshRequestedAt=0;
function json(res,status,data){res.writeHead(status,{'Content-Type':types['.json'],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const server=createServer(async(req,res)=>{try{
  if(!['localhost:5180','127.0.0.1:5180'].includes(req.headers.host)){json(res,403,{error:'仅允许本机访问。'});return;}
  const url=new URL(req.url,'http://localhost:5180');
  if(url.pathname==='/api/locations'&&req.method==='GET'){let query;try{query=parseLocationQuery(url.searchParams);}catch{json(res,400,{error:'Invalid location query'});return;}try{json(res,200,{locations:await geocodeLocation(query)});}catch{json(res,503,{error:'Location service unavailable'});}return;}
  if(url.pathname==='/api/map-config'&&req.method==='GET'){json(res,200,await readMapConfig());return;}
  if(url.pathname==='/api/map-config'&&req.method==='POST'){
    if(!['http://localhost:5180','http://127.0.0.1:5180'].includes(req.headers.origin)){json(res,403,{error:'请在本机网站内保存设置。'});return;}
    let body='',length=0;
    for await(const chunk of req){length+=chunk.length;if(length>2048){json(res,413,{error:'设置内容过长。'});return;}body+=chunk.toString('utf8');}
    try{await saveMapConfig(JSON.parse(body));json(res,200,{message:'已保存到本机，正在重新载入地图。'});}catch{json(res,400,{error:'密钥或 Map ID 格式不正确，请检查后重试。'});}return;
  }
  if(url.pathname==='/api/prices'&&req.method==='GET'){json(res,200,{...prices.state,updating:!!prices.running,products:prices.state.products.map(p=>({...p,offerState:offerState(p),stale:Date.now()-Date.parse(p.fetchedAt)>12*60*60*1000}))});return;}
  if(url.pathname==='/api/prices/refresh'&&req.method==='POST'){if(req.headers.origin!=='http://localhost:5180'&&req.headers.origin!=='http://127.0.0.1:5180'){json(res,403,{error:'请在网站内更新。'});return;}if(Date.now()-refreshRequestedAt<60000){json(res,429,{error:'一分钟内只检查一次。'});return;}refreshRequestedAt=Date.now();prices.refresh().catch(e=>console.error('Price update failed:',e.message));json(res,202,{message:'正在检查商家价格，请稍后查看。'});return;}
  if(url.pathname==='/api/stores'&&req.method==='GET'){let query;try{query=parseQuery(url.searchParams);}catch(e){json(res,400,{error:e.message});return;}try{json(res,200,await lookupPlaces(query));}catch(e){json(res,503,{error:e.name==='TimeoutError'?'地点查询超时，请稍后重试。':e.message});}return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'不支持此请求。'});return;}
  const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});res.end(req.method==='HEAD'?undefined:content);
}catch(e){if(urlIsApi(req.url))json(res,500,{error:'服务暂不可用。'});else{res.writeHead(e.code==='ENOENT'?404:500);res.end('暂时无法加载。');}}});
function urlIsApi(url){return url?.startsWith('/api/');}
server.listen(5180,'127.0.0.1',()=>console.log('Local URL: http://localhost:5180'));
