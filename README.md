# 附近超市 · 肉价地图

这只是一个随便搞出来的网站，目前只能完全显示芬兰境内的LIDL超市，仅供参考

本机地址：[http://localhost:5180](http://localhost:5180)。项目与数据保存在 **F:\LocalSites\market-radar**。

## 下载后启动

1. 安装 [Node.js](https://nodejs.org/) 22 或更高版本。
2. 将仓库下载并解压到任意目录，或使用 Git 克隆。无需安装第三方依赖。
3. 在项目目录运行 `npm start`，然后打开 [http://localhost:5180](http://localhost:5180)；终端需要保持运行。Windows 也可以双击“启动网站.cmd”在后台运行，并用“停止网站.cmd”停止。
4. 首次启动会自动创建 `data` 目录并检查价格来源。采集完成前，页面可能暂时没有报价。
5. Google 密钥需要在本机网页的地图设置中自行配置。仓库只包含空白配置示例，不包含原电脑的密钥、价格缓存、日志或运行进程信息。

这是需要 Node.js 后端的本机网站。上传到 GitHub 保存的是源代码，GitHub Pages 不能直接运行价格采集和查询后端。

## 使用

1. 启动：双击项目目录内的“启动网站.cmd”，或在 PowerShell 中运行 `& 'F:\LocalSites\market-radar\Start-Website.ps1'`。后台运行，关闭浏览器不会停止网站。
2. 用本机浏览器打开上面的地址，输入城市名或邮编（例如 `Helsinki`、`00100`）并查找位置；默认搜索芬兰，其他国家选择“所有国家”并补充国家或城市名。若有多个匹配地点，选择正确的一项。也可以使用浏览器定位或直接点选地图。
3. 选择 1、3、5、10、20、50 km 半径。列表按直线距离排列。
4. 选择门店查看已经接入的商家公开肉价。点击“Google Maps 导航”进入导航。
5. 停止：运行 `& 'F:\LocalSites\market-radar\Stop-Website.ps1'`。

右上角支持 English、中文、Suomi，选择保存在当前浏览器中。按钮、提示、设置、价格状态和肉类分类随语言切换；门店、商品名称及来源规格保留原文。定位输入不再要求经纬度，页面只显示选择的位置名称。主页面不显示重复的灰色说明；数据来源、采集状态和帮助集中在“数据来源”窗口，商品采集时间和详细条件在“报价详情”中，会员要求、有效期和过期提示保留。

城市与邮编搜索使用现有 Google Places API (New) 的 Text Search，无需另外启用 Geocoding API。Google 地图未启用时使用 Nominatim 的本机转发服务：只在提交表单时查询，不做输入联想或批量采集，外部请求至少间隔 1.1 秒，内存缓存 24 小时并保留 OSM 署名。搜索文字发送给相应地图服务，不写入服务器定位历史文件。

重启电脑后需要再次启动。程序启动时补做到期的价格检查，运行期间每 12 小时检查一次。电脑关机、休眠或无网络时无法采集；价格页显示实际采集时间，超过 12 小时标为旧报价。

目前仅允许本机访问。手机通过普通局域网 HTTP 地址访问无法使用浏览器定位，需要另行配置 HTTPS 服务和访问范围。

## 当前价格接入状态

**使用地区：芬兰。主要品牌：S 集团（Prisma、S-market、Alepa、Sale）、K 集团（K-Citymarket、K-Supermarket、K-Market）、Lidl。**

Lidl 的 [公开肉类目录](https://www.lidl.fi/h/lihat/h10095752)已接入自动采集，每 12 小时从官方商品数据重新获取报价。当前成功采集 26 项公布报价；这是本次采集数量，目录更新后会变化。含鸡肉、牛肉、猪肉和肉制品，不保证覆盖完整肉类库存。公开价格不等于所选门店实时货架价。

保留来源商品规格、商家标注的每公斤价格、组合购买数量、Lidl Plus 会员条件、约重包装参考价、促销条件和芬兰当地有效期。按公斤出售的商品明确显示 `/ kg`；4 件组合价不会被当成一件价格。预告价和已结束优惠分别标注，即使后台尚未到下一次采集时间，也按当前时间判断有效状态。

此前本机检查中，S-kaupat 自动访问返回 HTTP 429，K-Ruoka 商品页返回 HTTP 403。当前 S / K 适配器只检查来源可用性，尚未实现门店价格采集；即使来源返回 HTTP 200，也不会生成门店报价。每 12 小时检查一次可用性。地图上仍显示这两家集团的门店，选择后可通过“前往官方选店查价”到各家的肉类目录。K 和 S 的价格依赖具体门店，不能将官网默认门店报价套用于所有分店；接入自动门店价需要可用并获准使用的来源接口。

商家接入文件：`config/sources.json`。支持 Lidl 官网商品目录适配器、商家公开单商品 JSON-LD Offer，以及需要选店的来源可用性检查。遵守 robots 排除规则，不绕过验证。

来源字段：`id`、`name`、`url`、`host`、`chainKey`（与 OSM 品牌键一致）、`chainKeys`（可选别名）、`coverageBounds`（南、西、北、东坐标）或 `storeIds`（准确 OSM 门店 ID）、`scopeLabel`、`products`。每个商品填写实际公开 `url`、肉类 `meat`、已经核实的计价重量 `grams`、`unitLabel` 和促销条件 `condition`。未核实重量时不填写 `grams`，不计算每公斤价格。

**网上报价不等于所选实体门店货架价。** 仅有线上价格时必须在 `scopeLabel` 中明确注明；不能承诺覆盖所有超市或所有肉类。

数据文件 `data/prices.json`；更新记录 `data/updates.log`；服务日志 `data/server-output.log` 与 `data/server-error.log`。位置查询仅在内存中缓存 30 分钟，不保存用户定位历史。

## Google 地图配置

新下载的项目打开网站后，点击顶部 **Google 地图设置**。未配置密钥时临时使用 OpenStreetMap；原电脑保存的本地配置不随仓库上传。

1. 首次测试：打开 [Google 免费测试密钥说明](https://developers.google.com/maps/documentation/javascript/demo-key)，点击 Get a Demo Key，用自己的 Google 账号登录并阅读、接受条款。测试密钥无需付款信息，但每日有额度，仅用于测试。
2. 在本机网站设置窗口粘贴密钥，Map ID 可留空（使用官方 `DEMO_MAP_ID`）。
3. 若希望同时用 Google 搜索附近超市，把“超市查询来源”改为 **Google Places**，再点击“保存并启用 Google 地图”。Google 查询单次最多返回 20 个匹配地点，不表示范围内全部超市。Google 结果只显示在 Google 地图上，地图加载失败时不会混用到 OSM 底图。
4. 正式长期使用：在自己的 Google Cloud 项目开启计费、Maps JavaScript API；需要 Google 地点查询时再开启 Places API (New)。限制 API 密钥允许的网站为 `http://localhost:5180/*` 与 `http://127.0.0.1:5180/*`，并限制到上述 API。创建自己的 Map ID 后填写。正式服务可能产生费用，按 Google 的实际定价与配额执行。

密钥存放在 `config/google-maps.local.json`，已排除版本控制；不要把密钥发到聊天中。浏览器地图密钥必须发送给 Google，不能视为服务器秘密；通过来源网站和 API 限制保护它。示例格式在 `config/google-maps.example.json`。

## 搜不到超市时

先确认所选城市或邮编是否正确；电脑定位可能精度不足，精度大于半径时页面会提示。可输入城市名或邮编重新查找，或在地图点选实际位置，再点击 **搜索附近超市**。未选择位置时搜索会提示，连接失败与真正的空结果分别显示。

已去掉原来芬兰行政边界对地点查询的限制。芬兰以外也能查询超市，但不会套用芬兰的肉价。Overpass 主服务失败时依次尝试 Private.coffee；扩大查询后缩小半径可复用覆盖该范围的近期缓存。公共服务仍可能不可用，此时可配置 Google 密钥并改用 Google Places。

## 地图来源

- [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/get-api-key)：配置密钥后的交互底图、品牌标记、搜索中心与半径圆。可选 [Google Nearby Search](https://developers.google.com/maps/documentation/javascript/nearby-search) 获取最多 20 个附近超市与食品店。
- [OpenStreetMap](https://www.openstreetmap.org/copyright) / [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)：查询实际坐标附近的 `shop=supermarket`，并包括 S、K、Lidl 标记为 `convenience` 的小型食品门店，使用点、建筑与关系中心点。通过芬兰行政边界确认店铺的芬兰报价覆盖，边界不限制位置查询。地图中 S 为绿色、K 为橙色、Lidl 为蓝色，其他超市为灰色。并非所有实际门店均已收录；未收录、已闭店或坐标偏差可能影响结果。50 km 范围也按直线距离计算。
- [地图瓦片使用政策](https://operations.osmfoundation.org/policies/tiles/)：正常按需加载，保留署名，不做离线批量下载。
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)：按坐标生成到店路线，无需 Maps API 密钥。
- 搜索坐标会发送到选择的查询服务：Overpass 主服务 `https://overpass-api.de/api/interpreter` 或备用 `https://overpass.private.coffee/api/interpreter`；选择 Google Places 时发送到 Google。启用 Google 底图后地图视野、搜索中心与标记会发送给 Google；临时 OSM 底图按需请求 OSM 瓦片。点击导航后起终点坐标会发送给 Google Maps。

公共 Overpass 用于个人本机部署，按顺序发起请求并缓存 30 分钟；收到 429/406 后至少暂停该服务 30 秒。主、备服务单次连接与查询限时 27 秒；失败清楚提示，不用不完整响应冒充完整结果。扩展为多人高频服务时，需要适合该规模的地图查询服务。

## 开发验证

Node.js 22+；无需安装第三方依赖。`node --test` 检查距离筛选、参数边界、报价与计量转换、robots 排除规则。Leaflet 使用 BSD-2-Clause，许可在 `public/vendor/leaflet-LICENSE.txt`。

