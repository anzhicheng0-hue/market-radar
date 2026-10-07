import {createMap} from './map-view.mjs';
import {searchGooglePlaces} from './google-places.mjs';
import {searchLocations} from './location-search.mjs';
import {t,language,setLanguage,translatePage,localeFor} from './i18n.mjs';
const $=id=>document.getElementById(id);
let center=null,radius=3,stores=[],selected=null,markers=new Map(),prices=null,meat='all',requestVersion=0,queryController=null,map=null;
let locationKind='none',locationName='',locationAccuracy=null,locationResults=[],locationVersion=0,locationBusy=false;
let queryState={mode:'idle'},mapStatus={key:'mapLoading'},config={apiKey:'',mapId:'',storeSource:'osm'};
const groupColors={s:'#128254',k:'#d56813',lidl:'#1b5aeb',other:'#65748d'},groupSymbols={s:'S',k:'K',lidl:'L',other:'M'};
const time=value=>new Date(value).toLocaleString(localeFor(language),{timeZone:'Europe/Kiev'});
const offerDate=value=>new Date(value).toLocaleDateString(localeFor(language),{timeZone:'Europe/Helsinki'});
const groupName=group=>t(group==='other'?'otherStore':group);
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function link(text,url){const a=element('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6500);}
translatePage();
$('language').addEventListener('change',e=>{setLanguage(e.target.value);translatePage();for(const marker of markers.values())marker.remove();markers.clear();drawCircle();renderAll();});
$('map-settings').addEventListener('click',()=>$('map-dialog').showModal());
$('source-button').addEventListener('click',()=>$('source-dialog').showModal());
for(const id of ['source-dialog','map-dialog'])$(id).addEventListener('click',e=>{if(e.target===$(id))$(id).close();});
$('google-config-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=$('save-map-config');button.disabled=true;
  try{const response=await fetch('/api/map-config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:$('google-key').value.trim()||config.apiKey,mapId:$('google-map-id').value.trim(),storeSource:$('store-source').value})});if(!response.ok)throw new Error();$('map-config-status').textContent=t('configSaved');location.reload();}catch{$('map-config-status').textContent=t('configInvalid');button.disabled=false;}
});
try{const response=await fetch('/api/map-config');if(!response.ok)throw new Error();config=await response.json();}catch{$('map-config-status').textContent=t('configError');}
$('google-map-id').value=config.mapId||'';$('store-source').value=config.storeSource||'osm';
map=await createMap($('map'),config,(lat,lon)=>setCenter(lat,lon),status=>{mapStatus=status;renderMapStatus();});
function renderMapStatus(){$('map-provider').textContent=t(mapStatus.key,mapStatus.errorKey?{error:t(mapStatus.errorKey)}:mapStatus.values);}
function renderLocation(){
  $('location-label').textContent=locationKind==='city'?locationName:t(locationKind==='gps'?'yourLocation':locationKind==='map'?'mapPoint':'unlocated');
  $('google-key').placeholder=t(config.apiKey?'configuredKey':'keyPlaceholder');
  $('find-location').textContent=t(locationBusy?'searchingLocation':'findLocation');
}
function renderLocations(){const container=$('location-results');container.replaceChildren();container.hidden=!locationResults.length;if(!locationResults.length)return;container.append(element('h3',t('chooseLocation')));for(const place of locationResults){const button=element('button',place.name,'location-choice');button.type='button';button.addEventListener('click',()=>{locationResults=[];renderLocations();setCenter(place.lat,place.lon,null,{kind:'city',name:place.name});});container.append(button);for(const a of place.attributions||[])if(a.provider)container.append(a.url.startsWith('https://')?link(a.provider,a.url):element('span',a.provider));}}
$('location-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!map)return;const token=++locationVersion;locationBusy=true;locationResults=[];renderLocations();renderLocation();$('find-location').disabled=true;
  try{const results=await searchLocations($('place-query').value,$('place-country').value,language,map.provider);if(token!==locationVersion)return;if(!results.length){toast(t('noLocation'));return;}if(results.length===1){const place=results[0];await setCenter(place.lat,place.lon,null,{kind:'city',name:place.name});}else{locationResults=results;renderLocations();}}catch{if(token===locationVersion)toast(t('locationError'));}finally{if(token===locationVersion){locationBusy=false;$('find-location').disabled=false;renderLocation();}}
});
function setCenter(lat,lon,accuracy=null,label={kind:'map'}){
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw new Error(t('invalidCoordinates'));
  center={lat,lon};locationKind=label.kind;locationName=label.name||'';locationAccuracy=accuracy;renderLocation();drawCircle();map.fitRadius();if(accuracy>radius*1000)toast(t('lowAccuracy'));return findStores();
}
function drawCircle(){if(center&&map)map.setCenter(center,radius);}
function renderQuery(){const status=$('query-status');status.hidden=queryState.mode==='idle';status.classList.toggle('query-error',queryState.mode==='error'||!!queryState.stale);if(queryState.mode==='success'){status.textContent=t('found',{count:stores.length,radius})+(queryState.source==='Google Maps'?' · '+t('googleLimit'):'')+(queryState.stale?' · '+t('oldLocations'):'');}else status.textContent=t(queryState.mode==='searching'?'searchingStores':queryState.mode==='error'?queryState.error:'start');}
async function findStores(){
  if(!center||!map){toast(t('chooseFirst'));return;}
  const token=++requestVersion;queryController?.abort();queryController=new AbortController();clearStores();queryState={mode:'searching'};renderQuery();$('count').textContent='…';
  try{
    let data;
    if(config.storeSource==='google'){
      if(map.provider!=='google')throw new Error('googleRequired');
      try{data=await searchGooglePlaces({...center},radius);}catch{throw new Error('googleSearchError');}
    }else{const r=await fetch(`/api/stores?${new URLSearchParams({...center,radius})}`,{signal:queryController.signal});if(!r.ok)throw new Error('retry');data=await r.json();}
    if(token!==requestVersion)return;stores=data.stores;queryState={mode:'success',source:data.source,stale:!!data.stale};$('count').textContent=stores.length;renderQuery();renderStores();if(!stores.length)showEmptyStores('noStores','tryRadius');return {count:stores.length};
  }catch(e){if(token!==requestVersion||e.name==='AbortError')return;queryState={mode:'error',error:['googleRequired','googleSearchError'].includes(e.message)?e.message:'retry'};$('count').textContent='—';renderQuery();showEmptyStores('unavailable','retry');return {error:t(queryState.error)};}
}
function showEmptyStores(heading,description){const empty=element('div',undefined,'empty-state');empty.append(element('h3',t(heading)),element('p',t(description)));$('store-list').replaceChildren(empty);}
function clearStores(){for(const marker of markers.values())marker.remove();markers.clear();stores=[];selected=null;$('store-list').replaceChildren();renderPrices();}
function navigation(store){const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',`${store.lat},${store.lon}`);url.searchParams.set('travelmode','driving');if(center)url.searchParams.set('origin',`${center.lat},${center.lon}`);return url.href;}
function matchesStore(p,store){if(p.brandGroup){if(p.brandGroup!==store.brandGroup)return false;}else if(!(p.chainKeys||[p.chainKey]).includes(store.chainKey))return false;if(p.country){if(p.country!==store.country)return false;}else if(!p.storeIds&&!p.coverageBounds)return false;if(p.storeIds&&!p.storeIds.includes(store.id))return false;if(p.coverageBounds){const [south,west,north,east]=p.coverageBounds;if(store.lat<south||store.lat>north||store.lon<west||store.lon>east)return false;}return true;}
function hasPrices(store){return !!prices?.products?.some(p=>matchesStore(p,store));}
function renderStores(){
  if(!stores.length){showEmptyStores(queryState.mode==='error'?'unavailable':queryState.mode==='success'?'noStores':'stores',queryState.mode==='error'?'retry':queryState.mode==='success'?'tryRadius':'start');return;}
  const fragment=document.createDocumentFragment();
  for(const store of stores){
    const group=store.brandGroup||'other',card=element('div',undefined,'store-card'+(selected?.id===store.id?' selected':''));
    const pick=element('button',undefined,'store-top');pick.style.cssText='background:none;padding:0;width:100%;text-align:left;display:flex';
    pick.append(element('h3',store.name),element('span',store.distanceKm<1?`${Math.round(store.distanceKm*1000)} m`:`${store.distanceKm.toFixed(1)} km`,'distance'));pick.addEventListener('click',()=>selectStore(store));
    card.append(pick,element('p',store.address||store.brand||t('unknownAddress')));const label=element('span',groupName(group),'brand-group');label.style.color=groupColors[group];card.append(label);
    const meta=element('div',undefined,'store-meta');if(hasPrices(store))meta.append(element('span',t('pricesAvailable'),'price-availability'));meta.append(link(t('navigate'),navigation(store)));card.append(meta);fragment.append(card);
    for(const a of store.attributions||[]){const note=element('span',a.provider,'store-attribution');if(a.url.startsWith('https://'))note.replaceChildren(link(a.provider,a.url));card.append(note);}
    if(!markers.has(store.id)&&map){const popup=element('div');popup.append(element('strong',store.name),element('div',store.address||''));const priceButton=element('button',t('viewPrices'));priceButton.addEventListener('click',()=>selectStore(store));popup.append(priceButton,link(t('navigate'),navigation(store)));markers.set(store.id,map.addStore(store,popup,()=>{selected=store;renderStores();renderPrices();},groupColors[group],groupSymbols[group]));}
  }
  $('store-list').replaceChildren(fragment);
}
function selectStore(store){selected=store;renderStores();map.panTo([store.lat,store.lon]);markers.get(store.id)?.openPopup();renderPrices();$('prices-title').scrollIntoView({behavior:'smooth',block:'nearest'});}
function priceSuffix(suffix=''){if(suffix.includes('件组合'))return t('bundle',{count:suffix.match(/\d+/)?.[0]||''});if(suffix.includes('商家组合'))return t('merchantBundle');if(suffix.includes('约重'))return t('approx');if(suffix.includes('件'))return t('perPack');return suffix;}
function renderPrices(){
  const grid=$('price-grid');grid.replaceChildren();$('prices-title').textContent=selected?t('storePrices',{name:selected.name}):t('priceTitle');
  if(!selected){const empty=element('div',undefined,'price-empty');empty.append(element('h3',t('selectStore')));grid.append(empty);return;}
  const source=selected.country==='FI'?prices?.sources?.find(s=>s.brandGroup===selected.brandGroup):null;
  const rows=(prices?.products||[]).filter(p=>matchesStore(p,selected)&&(meat==='all'||(p.meats||[p.meat]).includes(meat))).sort((a,b)=>({published:0,upcoming:1,expired:2}[a.offerState]??0)-({published:0,upcoming:1,expired:2}[b.offerState]??0));
  if(!rows.length){const empty=element('div',undefined,'price-empty');empty.append(element('h3',t('noPrices')));if(source)empty.append(link(t('officialStore'),source.url));grid.append(empty);return;}
  for(const p of rows){
    const card=element('article',undefined,'product-card'+(p.offerState==='expired'?' expired':''));
    if(p.imageUrl){const image=element('img');image.src=p.imageUrl;image.alt=p.name;image.loading='lazy';image.referrerPolicy='no-referrer';card.append(image);}
    const body=element('div',undefined,'product-body');body.append(element('span',(p.meats||[p.meat]).map(m=>t(m)).join(' + '),'meat-label'));
    if(p.memberRequired)body.append(element('p',t('member'),'offer-status upcoming'));
    body.append(element('p',p.offerState==='upcoming'?t('upcoming',{date:offerDate(p.validFrom)}):t(p.offerState==='expired'?'expired':'valid'),'offer-status'+(p.offerState==='upcoming'?' upcoming':p.offerState==='expired'?' expired':'')));
    body.append(element('h3',p.name),element('div',p.unitLabel,'product-spec'));
    const price=element('div',p.price.toFixed(2),'product-price');price.append(element('span',p.currency+priceSuffix(p.priceSuffix)));body.append(price);
    if(p.pricePerKg)body.append(element('div',`${p.pricePerKg.toFixed(2)} ${p.currency} / kg`,'unit-price'));
    if(p.validFrom||p.validUntil)body.append(element('p',t('validity',{from:p.validFrom?offerDate(p.validFrom):t('unspecified'),to:p.validUntil?offerDate(p.validUntil):t('unspecified')}),'source-condition'));
    if(p.stale)body.append(element('p',t('stale'),'stale-price'));
    const details=element('details',undefined,'offer-details');details.append(element('summary',t('details')),element('p',t('scope')));
    if(p.condition){const condition=p.condition.replace('会员价：需要 Lidl Plus App',t('member')).replace('具体库存、组合购买条件和实际售价请向门店确认。',t('storeConditions')).replaceAll('Myymälässä',t('inStore')).replaceAll('Uusi',t('newProduct')).replaceAll('SUPERHINTA',t('specialPrice')).replaceAll('ERÄ',t('limitedBatch')).replace(/(\d+)\s+KPL/g,(_,count)=>t('items',{count}));details.append(element('p',condition));}
    details.append(element('p',t('captured',{date:time(p.fetchedAt)})));body.append(details,link(t('originalOffer'),p.sourceUrl));card.append(body);grid.append(card);
  }
}
function renderSourceStatus(){
  if(!prices)return;
  $('updated-label').textContent=prices.lastSuccessAt?t('updated',{date:time(prices.lastSuccessAt)}):t('noPriceUpdate');$('schedule-label').textContent=prices.nextRunAt?t('nextUpdate',{date:time(prices.nextRunAt)}):'';
  const list=$('source-list');list.replaceChildren();
  for(const s of prices.sources||[]){const p=element('p');const count=prices.products.filter(item=>item.sourceId===s.id).length;p.append(link(groupName(s.brandGroup),s.url),document.createTextNode(' · '+(count?t('sourceSuccess',{count}):t('sourceUnavailable'))));for(const error of s.errors||[])p.append(element('span',t(error.includes('429')?'source429':error.includes('403')?'source403':'sourceStoreRequired'),'source-error'));list.append(p);}
}
async function loadPrices(){try{const response=await fetch('/api/prices');if(!response.ok)throw new Error();prices=await response.json();renderSourceStatus();if(stores.length)renderStores();renderPrices();}catch{$('updated-label').textContent=t('priceError');}}
function renderAll(){renderLocation();renderLocations();renderMapStatus();renderQuery();renderStores();renderPrices();renderSourceStatus();}
$('locate').addEventListener('click',()=>{
  if(!window.isSecureContext)return toast(t('secureLocation'));if(!navigator.geolocation)return toast(t('locateRetry'));if(!map)return;
  $('locate').disabled=true;$('location-label').textContent=t('locating');
  navigator.geolocation.getCurrentPosition(p=>{$('locate').disabled=false;setCenter(p.coords.latitude,p.coords.longitude,p.coords.accuracy,{kind:'gps'});},e=>{$('locate').disabled=false;$('location-label').textContent=t('locateFailed');toast(t(e.code===1?'locateDenied':'locateRetry'));},{enableHighAccuracy:true,timeout:20000,maximumAge:60000});
});
$('search-stores').addEventListener('click',findStores);
$('zoom-in').addEventListener('click',()=>map.zoomBy(1));$('zoom-out').addEventListener('click',()=>map.zoomBy(-1));
if(map.provider!=='google')document.querySelector('.map-type-controls').hidden=true;
for(const [id,type] of [['road-map','roadmap'],['satellite-map','satellite']])$(id).addEventListener('click',()=>{map.setType?.(type);$('road-map').setAttribute('aria-pressed',String(type==='roadmap'));$('satellite-map').setAttribute('aria-pressed',String(type==='satellite'));});
$('recenter').addEventListener('click',()=>{if(center)map.fitRadius();else toast(t('chooseFirst'));});
document.querySelectorAll('[data-radius]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.radius==='3'));b.addEventListener('click',()=>{radius=Number(b.dataset.radius);document.querySelectorAll('[data-radius]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});$('radius-label').textContent=radius+' km';drawCircle();if(center)map.fitRadius();if(locationAccuracy>radius*1000)toast(t('lowAccuracy'));findStores();});});
document.querySelectorAll('[data-meat]').forEach(b=>b.addEventListener('click',()=>{meat=b.dataset.meat;document.querySelectorAll('[data-meat]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderPrices();}));
$('refresh-prices').addEventListener('click',async()=>{const button=$('refresh-prices');button.disabled=true;try{const response=await fetch('/api/prices/refresh',{method:'POST'});toast(t(response.ok?'refreshStarted':response.status===429?'minuteLimit':'priceError'));await loadPrices();if(response.ok){setTimeout(loadPrices,5000);setTimeout(loadPrices,25000);}}catch{toast(t('priceError'));}finally{button.disabled=false;}});
renderAll();loadPrices();setInterval(loadPrices,60000);
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController(),state=()=>({center,radius,language,locationLabel:$('location-label').textContent,mapProvider:map.provider,storeSource:config.storeSource||'osm',stores:stores.map(s=>({id:s.id,name:s.name,distanceKm:s.distanceKm,hasPublishedPrices:hasPrices(s)})),selectedStore:selected?.id||null,priceUpdatedAt:prices?.lastSuccessAt||null,status:$('query-status').textContent});
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_market_state',title:'Read supermarket map state',description:'Read displayed search results and language. Does not request device location or issue new searches.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).length)throw new Error('Invalid input');return state();}});
  register({name:'search_nearby_supermarkets',title:'Search nearby supermarkets',description:'Search a user-specified PUBLIC or explicitly authorized coordinate using the configured provider. Coordinates are sent to Google or OpenStreetMap; Google may charge. Does not request device geolocation.',inputSchema:{type:'object',properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},radiusKm:{type:'number',enum:[1,3,5,10,20,50]}},required:['latitude','longitude','radiusKm'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||Object.keys(input).some(k=>!['latitude','longitude','radiusKm'].includes(k))||!Number.isFinite(input.latitude)||Math.abs(input.latitude)>90||!Number.isFinite(input.longitude)||Math.abs(input.longitude)>180||![1,3,5,10,20,50].includes(input.radiusKm))throw new Error('Invalid input');radius=input.radiusKm;document.querySelectorAll('[data-radius]').forEach(b=>{const active=Number(b.dataset.radius)===radius;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('radius-label').textContent=radius+' km';await setCenter(input.latitude,input.longitude);return state();}});
  register({name:'select_supermarket',title:'View supermarket prices',description:'Select a store already present in the current search results. Does not open navigation.',inputSchema:{type:'object',properties:{storeId:{type:'string'}},required:['storeId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||Object.keys(input).some(k=>k!=='storeId'))throw new Error('Invalid input');const store=stores.find(s=>s.id===input.storeId);if(!store)throw new Error('Store not found');selectStore(store);return state();}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
