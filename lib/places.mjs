export const RADII=[1,3,5,10,20,50];
export function parseQuery(params){
  for(const name of ['lat','lon','radius'])if(!params.has(name)||params.get(name).trim()==='')throw new Error('缺少位置或半径。');
  const lat=Number(params.get('lat')),lon=Number(params.get('lon')),radius=Number(params.get('radius'));
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180||!RADII.includes(radius))throw new Error('位置或半径不正确。');
  return {lat,lon,radius};
}
export function distanceKm(a,b){const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;return 6371.0088*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function chainKey(tags){return (tags['brand:wikidata']||tags.brand||tags.name||'').normalize('NFKC').toLowerCase().replace(/[\s’'"«»]/g,'');}
export function brandGroup(tags){const text=[tags.brand,tags.name,tags.operator].filter(Boolean).join(' ').toLowerCase();if(/\blidl\b/.test(text))return 'lidl';if(/\b(?:prisma|s[ -]?market|sale|alepa|sok|s-ryhmä)\b/.test(text))return 's';if(/\bk[ -]?(?:market|supermarket|citymarket)\b|\bcitymarket\b/.test(text))return 'k';return 'other';}
export function normalizePlaces(data,center,radius){
  const finnishIds=new Set((data.elements||[]).filter(e=>!e.tags).map(e=>`${e.type}/${e.id}`));
  const stores=[];
  for(const e of data.elements||[]){const t=e.tags||{},pos=e.center||e;if(t.shop!=='supermarket'&&!(t.shop==='convenience'&&brandGroup(t)!=='other')||!Number.isFinite(pos.lat)||!Number.isFinite(pos.lon))continue;const distance=distanceKm(center,pos);if(distance>radius)continue;
    const id=`${e.type}/${e.id}`;
    stores.push({id,name:t.name||t.brand||'未命名超市',brand:t.brand||'',chainKey:chainKey(t),brandGroup:brandGroup(t),country:finnishIds.has(id)?'FI':(t['addr:country']||'').toUpperCase(),lat:pos.lat,lon:pos.lon,distanceKm:distance,address:[t['addr:city'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' ')});
  }
  // A shop can be mapped both as a point and its building. Merge only matching names within 15 metres.
  const dedup=[];for(const s of stores.sort((a,b)=>a.distanceKm-b.distanceKm)){if(!dedup.some(x=>x.name===s.name&&distanceKm(x,s)<.015))dedup.push(s);}return dedup;
}
export function placesQuery({lat,lon,radius}){
  // Fetch all nearby shops first. A second IDs-only output identifies Finnish shops
  // without excluding results when the user's location is outside Finland.
  return `[out:json][timeout:20][maxsize:33554432];area["ISO3166-1"="FI"]["admin_level"="2"]->.finland;nwr["shop"~"^(supermarket|convenience)$"](around:${radius*1000},${lat},${lon})->.shops;.shops out center tags;nwr.shops(area.finland);out ids;`;
}
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter'];
const cache=new Map(),inflight=new Map(),cooldown=new Map();let lastRequest=0,queue=Promise.resolve();
export function lookupPlaces(query){
  const key=JSON.stringify(query),previous=cache.get(key);if(previous&&Date.now()-previous.time<30*60*1000)return Promise.resolve({...previous.data,cached:true});if(inflight.has(key))return inflight.get(key);
  for(const entry of cache.values())if(Date.now()-entry.time<30*60*1000&&distanceKm(query,entry.query)+query.radius<=entry.query.radius){return Promise.resolve({...entry.data,stores:entry.data.stores.map(s=>({...s,distanceKm:distanceKm(query,s)})).filter(s=>s.distanceKm<=query.radius).sort((a,b)=>a.distanceKm-b.distanceKm),cached:true});}
  const task=queue.then(async()=>{
    const wait=Math.max(0,1200-(Date.now()-lastRequest));if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();
    try{
      let raw,sourceEndpoint;
      for(const endpoint of endpoints){
        if((cooldown.get(endpoint)||0)>Date.now())continue;
        try{
          const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'LocalMarketRadar/1.1 (+http://localhost:5180; personal Finland supermarket map)'},body:new URLSearchParams({data:placesQuery(query)}),signal:AbortSignal.timeout(27000)});
          if(!response.ok){if([429,406].includes(response.status))cooldown.set(endpoint,Date.now()+30000);throw new Error(`HTTP ${response.status}`);}
          const candidate=await response.json();if(candidate.remark||!Array.isArray(candidate.elements))throw new Error('Incomplete map response');raw=candidate;sourceEndpoint=endpoint;break;
        }catch{cooldown.set(endpoint,Math.max(cooldown.get(endpoint)||0,Date.now()+30000)); /* Pause failed instances; never treat errors as zero shops. */ }
      }
      if(!raw)throw new Error('两个地点查询服务均暂时无法连接。请检查网络后点击“搜索附近超市”重试。');
      const data={stores:normalizePlaces(raw,query,query.radius),retrievedAt:new Date().toISOString(),sourceUpdatedAt:raw.osm3s?.timestamp_osm_base,source:'OpenStreetMap / Overpass',sourceEndpoint,cached:false};cache.set(key,{time:Date.now(),data,query:{...query}});if(cache.size>50)cache.delete(cache.keys().next().value);return data;
    }catch(e){if(previous)return {...previous.data,cached:true,stale:true,warning:'地点查询失败，显示上次缓存，门店可能已变化。'};throw e;}
  });queue=task.catch(()=>{});inflight.set(key,task);task.finally(()=>inflight.delete(key)).catch(()=>{});return task;
}
