export function normalizeGooglePlaces(places,center,radius){
  const radians=Math.PI/180;
  return places.flatMap(p=>{
    if(!p.location)return [];
    const lat=p.location.lat(),lon=p.location.lng();if(!Number.isFinite(lat)||!Number.isFinite(lon))return [];
    const h=Math.sin((lat-center.lat)*radians/2)**2+Math.cos(center.lat*radians)*Math.cos(lat*radians)*Math.sin((lon-center.lon)*radians/2)**2;
    const distanceKm=6371.0088*2*Math.asin(Math.sqrt(Math.min(1,h)));if(distanceKm>radius)return [];
    const name=p.displayName||'Supermarket',text=name.normalize('NFKC').toLowerCase().replace(/[‐‑‒–—−]/g,'-');
    const brandGroup=/\blidl\b/.test(text)?'lidl':/\b(?:prisma|s[ -]?market|sale|alepa)\b/.test(text)?'s':/\bk[ -]?(?:market|supermarket|citymarket)\b|\bcitymarket\b/.test(text)?'k':'other';
    const country=p.addressComponents?.find(c=>c.types.includes('country'))?.shortText?.toUpperCase()||'';
    return [{id:'google/'+p.id,name,brand:name,brandGroup,chainKey:name.toLowerCase().replace(/\s/g,''),country,lat,lon,distanceKm,address:p.formattedAddress||'',attributions:(p.attributions||[]).map(a=>({provider:a.provider||'',url:a.providerURI||''}))}];
  }).sort((a,b)=>a.distanceKm-b.distanceKm);
}
export async function searchGooglePlaces(center,radius){
  const {Place,SearchNearbyRankPreference}=await google.maps.importLibrary('places');
  const {places}=await Place.searchNearby({fields:['id','displayName','location','formattedAddress','addressComponents','attributions'],language:'fi',locationRestriction:{center:{lat:center.lat,lng:center.lon},radius:radius*1000},includedTypes:['supermarket','grocery_store'],maxResultCount:20,rankPreference:SearchNearbyRankPreference.DISTANCE});
  return {stores:normalizeGooglePlaces(places,center,radius),source:'Google Maps',retrievedAt:new Date().toISOString(),warning:'Google 单次最多返回 20 个匹配地点，不能表示该范围全部超市。'};
}
