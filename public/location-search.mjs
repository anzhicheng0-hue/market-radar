export function locationRequest(text,country,language){const q=text.trim();if(!q||q.length>120||!['','fi'].includes(country)||!['en','zh','fi'].includes(language))throw new Error('Invalid location query');return {q,country,language};}
export async function searchLocations(text,country,language,provider){
  const query=locationRequest(text,country,language);
  if(provider==='google'){
    const {Place}=await google.maps.importLibrary('places');
    const {places}=await Place.searchByText({textQuery:country==='fi'?`${query.q}, Finland`:query.q,fields:['id','displayName','formattedAddress','location','addressComponents','attributions'],language:country==='fi'?'fi':{en:'en',zh:'zh-CN',fi:'fi'}[language],...(country?{region:country}:{}),maxResultCount:5});
    return places.filter(p=>p.location&&(!country||p.addressComponents?.some(c=>c.types.includes('country')&&c.shortText?.toLowerCase()===country))).map(p=>({id:p.id,name:p.formattedAddress||p.displayName,lat:p.location.lat(),lon:p.location.lng(),provider:'Google Maps',attributions:(p.attributions||[]).map(a=>({provider:a.provider||'',url:a.providerURI||''}))}));
  }
  const response=await fetch('/api/locations?'+new URLSearchParams(query));if(!response.ok)throw new Error('Location service unavailable');return (await response.json()).locations;
}
