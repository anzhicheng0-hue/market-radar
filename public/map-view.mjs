import {t,language,localeFor} from './i18n.mjs';
function loadGoogle(apiKey){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve();};
    const timer=setTimeout(()=>finish(new Error('mapTimeout')),20000);
    window.gm_authFailure=()=>finish(new Error('mapAuth'));
    window.marketGoogleReady=()=>finish();
    const script=document.createElement('script'),url=new URL('https://maps.googleapis.com/maps/api/js');
    url.search=new URLSearchParams({key:apiKey,loading:'async',callback:'marketGoogleReady',libraries:'maps,marker',v:'weekly',language:localeFor(language),region:'FI'});
    script.src=url.href;script.async=true;script.onerror=()=>finish(new Error('mapNetwork'));document.head.append(script);
  });
}
export async function createMap(container,config,onPoint,onStatus){
  if(config.apiKey){
    onStatus({key:'mapLoading'});
    try{
      await loadGoogle(config.apiKey);
      const g=window.google.maps,map=new g.Map(container,{center:{lat:64.5,lng:26},zoom:5,mapId:config.mapId||'DEMO_MAP_ID',disableDefaultUI:true,clickableIcons:false}),popup=new g.InfoWindow();
      let circle,position;
      map.addListener('click',e=>{if(e.latLng)onPoint(e.latLng.lat(),e.latLng.lng());});
      // Authentication can fail after the SDK callback. Keep the failure visible.
      window.gm_authFailure=()=>onStatus({key:'mapAuth'});
      onStatus({key:'mapReady',values:{source:config.storeSource==='google'?'Google Places':'OpenStreetMap'}});
      return {
        provider:'google',
        setType(type){map.setMapTypeId(type);},
        zoomBy(delta){map.setZoom((map.getZoom()||5)+delta);},
        setCenter(center,radius){const c={lat:center.lat,lng:center.lon};if(!position)position=new g.marker.AdvancedMarkerElement({map,position:c,title:t('searchCenter')});else{position.position=c;position.title=t('searchCenter');}if(!circle)circle=new g.Circle({map,strokeColor:'#1b5aeb',strokeWeight:1.5,fillColor:'#1b5aeb',fillOpacity:.05});circle.setCenter(c);circle.setRadius(radius*1000);},
        fitRadius(){if(circle)map.fitBounds(circle.getBounds(),28);},
        panTo(pos){map.panTo({lat:pos[0],lng:pos[1]});},
        addStore(store,content,onSelect,color,symbol){const pin=document.createElement('span');pin.className='google-shop-pin';pin.style.background=color;pin.textContent=symbol;const marker=new g.marker.AdvancedMarkerElement({map,position:{lat:store.lat,lng:store.lon},title:store.name,content:pin});const openPopup=()=>{popup.setContent(content);popup.open({map,anchor:marker});};marker.addListener('click',()=>{onSelect();openPopup();});return {remove(){marker.map=null;popup.close();},openPopup};}
      };
    }catch(e){onStatus({key:'mapFallback',errorKey:['mapTimeout','mapAuth','mapNetwork'].includes(e.message)?e.message:'mapNetwork'});container.replaceChildren();}
  }else onStatus({key:'mapMissing'});
  const map=L.map(container,{center:[64.5,26],zoom:5,zoomControl:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).addTo(map);
  let circle,position;
  map.on('click',e=>onPoint(e.latlng.lat,e.latlng.lng));
  return {
    provider:'osm',
    zoomBy(delta){map.setZoom(map.getZoom()+delta);},
    setCenter(center,radius){if(position)position.remove();position=L.circleMarker([center.lat,center.lon],{radius:7,color:'#fff',weight:3,fillColor:'#1b5aeb',fillOpacity:1}).addTo(map);if(circle)circle.remove();circle=L.circle([center.lat,center.lon],{radius:radius*1000,color:'#1b5aeb',weight:1.5,fillOpacity:.05}).addTo(map);},
    fitRadius(){if(circle)map.fitBounds(circle.getBounds(),{padding:[28,28]});},
    panTo(pos){map.panTo(pos);},
    addStore(store,content,onSelect,color,symbol){const pin=document.createElement('span');pin.style.background=color;pin.textContent=symbol;const marker=L.marker([store.lat,store.lon],{icon:L.divIcon({className:'shop-pin',html:pin,iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map).bindPopup(content);marker.on('click',onSelect);return marker;}
  };
}
