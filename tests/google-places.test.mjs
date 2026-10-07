import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeGooglePlaces} from '../public/google-places.mjs';
test('Google store results preserve country and exclude outside radius before matching prices',()=>{
  const place=(id,name,lat,lon,country)=>({id,displayName:name,location:{lat:()=>lat,lng:()=>lon},addressComponents:[{types:['country'],shortText:country}]});
  const results=normalizeGooglePlaces([place('fi','Lidl Helsinki',60,25,'FI'),place('se','Lidl Other',60,25.001,'SE'),place('far','K-Market',61,25,'FI'),{id:'missing'}],{lat:60,lon:25},1);
  assert.equal(results.length,2);assert.equal(results[0].brandGroup,'lidl');assert.equal(results[0].country,'FI');assert.equal(results[1].country,'SE');assert.equal(results[1].id,'google/se');
});
