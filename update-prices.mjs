import {PriceService} from './lib/prices.mjs';
const service=new PriceService();await service.init();clearTimeout(service.timer);await service.refresh();clearTimeout(service.timer);console.log(service.state.message);console.log(`Products: ${service.state.products.length}`);
