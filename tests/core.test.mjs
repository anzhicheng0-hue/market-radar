import test from 'node:test';import assert from 'node:assert/strict';
import {parseQuery,distanceKm,normalizePlaces,placesQuery,lookupPlaces} from '../lib/places.mjs';
import {validateMapConfig} from '../lib/map-config.mjs';
import {extractProducts,normalizeProduct,robotsAllowed,INTERVAL} from '../lib/prices.mjs';
test('all six radii accepted; invalid coordinates and missing values rejected',()=>{for(const radius of [1,3,5,10,20,50])assert.equal(parseQuery(new URLSearchParams({lat:'50',lon:'30',radius})).radius,radius);for(const q of ['lat=NaN&lon=30&radius=3','lat=91&lon=30&radius=3','lat=&lon=30&radius=3','lat=50&lon=30&radius=2','lat=50&lon=-181&radius=3'])assert.throws(()=>parseQuery(new URLSearchParams(q)));});
test('distance filtering includes nodes and building centers, excludes outside range',()=>{const center={lat:0,lon:0};assert.ok(Math.abs(distanceKm(center,{lat:0,lon:1})-111.195)<.001);const data={elements:[{type:'node',id:1,lat:0,lon:.001,tags:{name:'A',shop:'supermarket'}},{type:'way',id:2,center:{lat:0,lon:.00101},tags:{name:'A',shop:'supermarket'}},{type:'node',id:3,lat:0,lon:.1,tags:{shop:'supermarket'}},{type:'node',id:4,lat:0,lon:0,tags:{shop:'butcher'}}]};const result=normalizePlaces(data,center,1);assert.equal(result.length,1);assert.equal(result[0].id,'node/1');assert.ok(result[0].distanceKm<1);});
test('nearby query is global and only Finnish IDs get Finnish price coverage',()=>{
  const q=placesQuery({lat:60,lon:25,radius:3});assert.match(q,/\(around:3000,60,25\)->\.shops/);assert.doesNotMatch(q,/\(area\.finland\)\(around/);
  const result=normalizePlaces({elements:[{type:'node',id:1,lat:60,lon:25,tags:{shop:'supermarket',name:'Lidl Finland'}},{type:'node',id:2,lat:60,lon:25.001,tags:{shop:'supermarket',name:'Lidl Other'}},{type:'node',id:1}]},{lat:60,lon:25},3);
  assert.equal(result.find(s=>s.id==='node/1').country,'FI');assert.equal(result.find(s=>s.id==='node/2').country,'');
});
test('map credentials reject oversized keys and injected URL parameters',()=>{
  assert.deepEqual(validateMapConfig({apiKey:'',mapId:''}),{apiKey:'',mapId:'',storeSource:'osm'});
  for(const input of [{apiKey:'key&callback=evil'},{apiKey:'a'.repeat(151)},{mapId:'<script>'},{unexpected:true},{storeSource:'google',apiKey:''}])assert.throws(()=>validateMapConfig(input));
});
test('failed primary uses backup; shrinking radius reuses records and failures remain errors',async()=>{
  const original=globalThis.fetch,calls=[];
  try{
    globalThis.fetch=async(endpoint,options)=>{calls.push(endpoint);assert.match(options.headers['User-Agent'],/LocalMarketRadar/);if(endpoint.includes('overpass-api.de'))throw new Error('connect timeout');return new Response(JSON.stringify({elements:[{type:'node',id:9001,lat:60,lon:25,tags:{shop:'supermarket',name:'Lidl test'}},{type:'node',id:9001}],osm3s:{timestamp_osm_base:'2026-10-07T00:00:00Z'}}),{status:200,headers:{'Content-Type':'application/json'}});};
    const result=await lookupPlaces({lat:60,lon:25,radius:3});assert.equal(calls.length,2);assert.match(result.sourceEndpoint,/private\.coffee/);assert.equal(result.stores[0].country,'FI');
    const smaller=await lookupPlaces({lat:60,lon:25,radius:1});assert.equal(calls.length,2);assert.equal(smaller.cached,true);assert.equal(smaller.stores.length,1);
    globalThis.fetch=async()=>new Response('server error',{status:500});
    await assert.rejects(lookupPlaces({lat:50,lon:30,radius:1}),/暂时无法连接/);
  }finally{globalThis.fetch=original;}
});
test('structured prices use actual currency, explicit weight, and reject ambiguous ranges',()=>{const html='<script type="application/ld+json">{"@graph":[{"@type":"Product","name":"Chicken 500g","offers":{"@type":"Offer","price":"4.50","priceCurrency":"EUR"}}]}</script>';const product=extractProducts(html)[0],source={id:'test',chainKey:'test'},item={url:'https://example.com/product',grams:500};const result=normalizeProduct(product,source,item,'2026-01-01');assert.equal(result.pricePerKg,9);assert.equal(result.currency,'EUR');assert.equal(normalizeProduct(product,source,{url:item.url},'2026-01-01').pricePerKg,null);assert.throws(()=>normalizeProduct({...product,offers:{'@type':'AggregateOffer',lowPrice:1,highPrice:5,priceCurrency:'EUR'}},source,item,''));assert.throws(()=>normalizeProduct({...product,offers:{price:'free',priceCurrency:'EUR'}},source,item,''));assert.equal(INTERVAL,43200000);});
test('robots exclusion and allow precedence prevent prohibited crawling',()=>{const robots='User-agent: *\nDisallow: /private/\nDisallow: /*?*\nAllow: /private/public\nUser-agent: OtherBot\nDisallow: /';assert.equal(robotsAllowed(robots,'/product/1'),true);assert.equal(robotsAllowed(robots,'/private/1'),false);assert.equal(robotsAllowed(robots,'/private/public'),true);assert.equal(robotsAllowed(robots,'/product?a=1'),false);assert.equal(robotsAllowed('User-agent: LocalMarketRadar\nDisallow: /\nUser-agent: *\nAllow: /','/product'),false);});
