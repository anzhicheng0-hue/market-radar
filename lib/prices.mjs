import {readFile,writeFile,rename,mkdir,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {lidlRecords,normalizeLidl,offerState} from './lidl.mjs';
export const INTERVAL=12*60*60*1000;
const base=resolve(import.meta.dirname,'..'),file=resolve(base,'data/prices.json');
export function extractProducts(html){
  const result=[];
  function walk(x){if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object')return;if([x['@type']].flat().includes('Product'))result.push(x);if(x['@graph'])walk(x['@graph']);if(x.itemListElement)walk(x.itemListElement);if(x.item)walk(x.item);}
  for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
  return result;
}
export function normalizeProduct(product,source,item,now){
  const offers=[product.offers].flat().filter(Boolean);
  const offer=offers.find(o=>o['@type']==='Offer'&&o.price!==undefined)||offers.find(o=>o.price!==undefined);
  if(!offer||offer['@type']==='AggregateOffer')throw new Error('无明确的单商品报价。');
  const price=Number(offer.price),currency=offer.priceCurrency;if(!Number.isFinite(price)||price<=0||! /^[A-Z]{3}$/.test(currency||''))throw new Error('价格或币种无法核实。');
  if(!product.name)throw new Error('商品名称缺失。');
  const grams=item.grams;const image=[product.image].flat()[0];
  return {id:source.id+':'+item.url,chainKey:source.chainKey,chainKeys:source.chainKeys||[source.chainKey],meat:item.meat,name:product.name,price,currency,unitLabel:item.unitLabel||'请查看原始商品规格',pricePerKg:Number.isFinite(grams)&&grams>0?Math.round(price*1000/grams*100)/100:null,sourceUrl:item.url,imageUrl:typeof image==='string'&&image.startsWith('https://')?image:null,scopeLabel:source.scopeLabel||'商家网上报价；未核实所选门店售价',condition:item.condition||'价格和库存以商家结算页面及门店为准',fetchedAt:now,sourceId:source.id,storeIds:source.storeIds||null,coverageBounds:source.coverageBounds||null};
}
function safeUrl(value,host){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!==host||url.username||url.password||url.port)throw new Error('来源必须为配置的商家 HTTPS 域名。');return url;}
async function getPage(url){const r=await fetch(url,{headers:{'User-Agent':'LocalMarketRadar/1.0 (+local personal price comparison)','Accept':'text/html'},signal:AbortSignal.timeout(20000),redirect:'error'});if(!r.ok)throw new Error(`商家返回 ${r.status}；不绕过登录或反爬验证。`);const text=await r.text();if(text.length>5000000)throw new Error('商家页面过大。');return text;}
export function robotsAllowed(text,path){
  const groups=[];let group=null;
  for(const line of text.split('\n')){const clean=line.split('#')[0].trim(),i=clean.indexOf(':');if(i<0)continue;const name=clean.slice(0,i).toLowerCase(),value=clean.slice(i+1).trim();if(name==='user-agent'){if(!group||group.rules.length){group={agents:[],rules:[]};groups.push(group);}group.agents.push(value.toLowerCase());}else if(group&&['allow','disallow'].includes(name)&&value)group.rules.push({allow:name==='allow',path:value});}
  const exact=groups.filter(g=>g.agents.some(a=>'localmarketradar'.includes(a)&&a!=='*'));const active=exact.length?exact:groups.filter(g=>g.agents.includes('*'));let winner=null;
  for(const rule of active.flatMap(g=>g.rules)){const end=rule.path.endsWith('$'),pattern=rule.path.replace(/\$$/,'').split('*').map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');if(new RegExp('^'+pattern+(end?'$':'')).test(path)&&(!winner||rule.path.length>winner.path.length||(rule.path.length===winner.path.length&&rule.allow)))winner=rule;}return !winner||winner.allow;
}
export class PriceService{
  constructor(){this.state={products:[],sources:[],nextRunAt:null,message:'价格来源待地区与商家确认后接入。'};this.running=null;this.timer=null;}
  async init(){await mkdir(resolve(base,'data'),{recursive:true});try{this.state=JSON.parse(await readFile(file,'utf8'));}catch{}this.schedule();}
  schedule(){clearTimeout(this.timer);const due=Date.parse(this.state.nextRunAt||'')||Date.now();this.timer=setTimeout(()=>this.refresh().catch(()=>{}),Math.min(Math.max(0,due-Date.now()),INTERVAL));this.timer.unref();}
  async refresh(){if(this.running)return this.running;this.running=this.update().finally(()=>{this.running=null;this.schedule();});return this.running;}
  async update(){
    const config=JSON.parse(await readFile(resolve(base,'config/sources.json'),'utf8')),now=new Date().toISOString(),nextRunAt=new Date(Date.now()+INTERVAL).toISOString();let products=[...this.state.products],sources=[],success=0;
    for(const source of config.sources){let fresh=[],errors=[];
      const previous=this.state.sources.find(s=>s.id===source.id);
      // A denied or rate-limited source is tried again at the next 12-hour cycle.
      if(previous?.errors?.some(e=>/\b(?:403|429)\b/.test(e))&&Date.now()-Date.parse(previous.lastAttemptAt)<INTERVAL){sources.push(previous);continue;}
      try{
        const root=safeUrl(source.url,source.host),robotsUrl=new URL('/robots.txt',root);let rules='';
        try{rules=await getPage(robotsUrl);}catch(e){throw new Error('无法核查商家 robots.txt：'+e.message);}
        if(source.adapter==='lidl-grid'){
          if(!robotsAllowed(rules,root.pathname+root.search))throw new Error('商家禁止采集该页面。');
          fresh=lidlRecords(await getPage(root)).map(r=>normalizeLidl(r,source,now)).filter(Boolean);
          if(!fresh.length)throw new Error('官网未提供可核实的商品报价。');
        }else if(source.adapter==='store-required'){
          const item=source.products[0],url=safeUrl(item.url,source.host);
          if(!robotsAllowed(rules,url.pathname+url.search))throw new Error('商家禁止采集该页面。');
          await getPage(url);throw new Error('商家报价依赖所选门店，尚无获准自动使用的门店价格接口。请前往官网选店查价。');
        }else for(const item of source.products||[]){try{const url=safeUrl(item.url,source.host);if(!robotsAllowed(rules,url.pathname+url.search))throw new Error('商家禁止采集该页面。');const html=await getPage(url);const candidates=extractProducts(html);if(candidates.length!==1)throw new Error('商品结构不明确，需更新来源解析器。');fresh.push(normalizeProduct(candidates[0],source,item,now));}catch(e){errors.push(e.message);}await new Promise(r=>setTimeout(r,1200));}
      }catch(e){errors.push(e.message);}
      const ids=new Set(fresh.map(p=>p.id));products=products.filter(p=>p.sourceId!==source.id||(source.adapter!=='lidl-grid'||!fresh.length)&&!ids.has(p.id));products.push(...fresh);if(fresh.length)success++;
      sources.push({id:source.id,brandGroup:source.brandGroup,name:source.name,url:source.url,status:fresh.length?`成功更新 ${fresh.length} 项公开报价${errors.length?'，部分失败':''}`:'尚未获取自动报价',errors,lastAttemptAt:now,lastSuccessAt:fresh.length?now:this.state.sources.find(s=>s.id===source.id)?.lastSuccessAt||null});
    }
    products=products.filter(p=>config.sources.some(s=>s.id===p.sourceId)).map(p=>({...p,stale:Date.now()-Date.parse(p.fetchedAt)>INTERVAL,offerState:offerState(p)}));
    this.state={products,sources,regionLabel:config.regionLabel,lastAttemptAt:now,lastSuccessAt:success?now:this.state.lastSuccessAt||null,nextRunAt,message:!sources.length?'尚未配置地区与商家。':sources.some(s=>s.errors.length)?'Lidl 显示官网公布价；S、K 自动报价暂不可用，可前往官网选店查价。预告价及已结束优惠均单独标注。':'已更新商家公开报价；门店实际售价与库存可能不同。'};
    const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(this.state,null,2));await rename(tmp,file);await appendFile(resolve(base,'data/updates.log'),JSON.stringify({at:now,success,sources:sources.map(s=>({name:s.name,status:s.status,errors:s.errors}))})+'\n');return this.state;
  }
}

