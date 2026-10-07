export function decodeHtml(text){return String(text).replace(/&quot;/g,'"').replace(/&#(?:0*39|x0*27);/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));}
export function lidlRecords(html){const result=[];for(const m of html.matchAll(/\bdata-grid-data="([^"]+)"/g)){try{result.push(JSON.parse(decodeHtml(m[1])));}catch{}}if(!result.length)throw new Error('Lidl 商品列表结构已变更，未更新价格。');return result;}
export function offerState(product,at=Date.now()){if(product.validFrom&&Date.parse(product.validFrom)>at)return 'upcoming';if(product.validUntil&&Date.parse(product.validUntil)<at)return 'expired';return 'published';}
function kinds(record){const title=record.fullTitle.toLowerCase(),category=record.keyfacts?.wonCategoryPrimary||'';if(/nauta.*kana|kana.*nauta/.test(title))return ['beef','chicken'];if(/sika.*nauta|nauta.*sika/.test(title))return ['beef','pork'];if(/leikkeleet|makkarat/i.test(category))return ['processed'];if(/kalkkun/.test(title))return ['turkey'];if(/ankka/.test(title))return ['duck'];if(/karitsa|lammas|lampaan/.test(title))return ['lamb'];if(/naudanlihat|naudanliha/i.test(category))return ['beef'];if(/possunliha/i.test(category))return ['pork'];if(/kana ja siipikarja/i.test(category))return ['chicken'];return ['other'];}
export function normalizeLidl(record,source,fetchedAt){
  const member=record.lidlPlus?.length===1&&!Number.isFinite(record.price?.price)?record.lidlPlus[0]:null;
  const pricing=member?{...record.price,...member.price}:record.price;
  const price=pricing?.price,spec=pricing?.basePrice?.text,currency=pricing?.currencyCode;
  if(!Number.isFinite(price)||price<=0||currency!=='EUR'||!spec||!record.fullTitle)return null;
  if(pricing?.variantsHaveDifferentPrices||pricing?.discount?.showFrom||pricing?.discount?.showUpTo)return null;
  const sourceUrl=new URL(record.canonicalUrl,source.url);if(sourceUrl.hostname!==source.host||sourceUrl.protocol!=='https:')return null;
  const perKg=spec.match(/(\d+(?:[.,]\d+)?)\s*€\s*\/\s*kg/i);const pricedByKg=/hinta\s*\/\s*kg/i.test(spec)||pricing?.discount?.discountTitle==='€/kg';
  const quantity=/hinta yksittäin/i.test(spec)?(pricing?.discount?.discountText||record.fullTitle).match(/(\d+)\s*kpl/i)?.[1]:null;
  const priceSuffix=pricedByKg?' / kg':quantity?` / ${quantity} 件组合`:/hinta yksittäin/i.test(spec)?' / 商家组合报价':/^n\.\s/i.test(spec)?' / 约重包装参考价':' / 件';
  const windows=(record.stockAvailability?.badgeInfoV2||[]).filter(w=>Number.isFinite(w.validFrom)||Number.isFinite(w.validUntil));
  const now=Date.parse(fetchedAt)/1000;const window=windows.find(w=>(!w.validFrom||w.validFrom<=now)&&(!w.validUntil||w.validUntil>=now))||windows.find(w=>w.validFrom>now)||windows[0];
  const badges=(window?.badges||record.stockAvailability?.badgeInfo?.badges||[]).map(b=>b.text).filter(Boolean);
  const promotion=pricing.discount?.discountText;
  const meats=kinds(record);return {id:source.id+':'+record.productId,sourceId:source.id,brandGroup:source.brandGroup,chainKey:source.chainKey,chainKeys:source.chainKeys,country:'FI',name:record.fullTitle,meat:meats[0],meats,price,currency,priceSuffix,unitLabel:spec,pricePerKg:pricedByKg?price:perKg?Number(perKg[1].replace(',','.')):null,unitPriceOrigin:'merchant',memberRequired:!!member,condition:[member?'会员价：需要 Lidl Plus App':null,promotion,...badges,'具体库存、组合购买条件和实际售价请向门店确认。'].filter(Boolean).join(' · '),scopeLabel:source.scopeLabel,sourceUrl:sourceUrl.href,imageUrl:record.image?.startsWith('https://')?record.image:null,fetchedAt,validFrom:window?.validFrom?new Date(window.validFrom*1000).toISOString():null,validUntil:window?.validUntil?new Date(window.validUntil*1000).toISOString():null,storeIds:null};
}
