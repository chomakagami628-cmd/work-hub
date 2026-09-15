const CONSOLE_HARDWARES=Object.keys(CONSOLE_INITIAL_DATA);
const GAME_HARDWARES=Object.keys(GAME_INITIAL_DATA);

let activeTab="console";
let shippingDb=[];
let shippingPrefecture="北海道";
let shippingSize="";
let shippingEndpoint="", shippingToken="";
let consoleDb=structuredClone(CONSOLE_INITIAL_DATA);
let gameDb=structuredClone(GAME_INITIAL_DATA);
let consoleHardware=CONSOLE_HARDWARES[0]||"";
let gameHardware=GAME_HARDWARES[0]||"";
let consoleSearch="", gameSearch="";
let consoleEndpoint="", consoleToken="";
let gameEndpoint="", gameToken="";
let yaEndpoint="", yaToken="";
let syncing={console:false,game:false,shipping:false};

function el(id){return document.getElementById(id);}
function requireEl(id){
  const node=el(id);
  if(!node) throw new Error(`画面の部品「#${id}」が見つかりません。拡張機能を再読み込みしてください。`);
  return node;
}
function normalize(s){return String(s??"").normalize("NFKC").toLowerCase()
  .replace(/[ぁ-ゖ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)+0x60))
  .replace(/[ァ-ヺ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60))
  .replace(/\s+/g,"");}
function setStatus(s,bad=false){
  const n=el("status");
  if(n){n.textContent=s;n.style.color=bad?"#b42318":"#777";}
  const sn=el("shippingStatus");
  if(sn&&activeTab==="shipping"){sn.textContent=s;sn.style.color=bad?"#b42318":"#777";}
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function copyText(text){
  if(!text)return;
  navigator.clipboard?.writeText(text).then(()=>setStatus(`コピーしました：${text}`)).catch(()=>{
    const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);
    ta.select();document.execCommand("copy");ta.remove();setStatus(`コピーしました：${text}`);
  });
}
function formatPrice(v){
  if(v===null||v===undefined||String(v).trim()==="")return "—";
  const n=Number(String(v).replace(/,/g,""));
  return Number.isFinite(n)?`¥${n.toLocaleString("ja-JP")}`:String(v);
}
function categoryName(v){
  let s=String(v??"").trim();
  s=s.replace(/^【+|】+$/g,"").trim();
  s=s.replace(/^\d+\s*[.．:：、-]?\s*/g,"").trim();
  if(s.includes("本体"))return "本体";
  if(s.includes("コントローラー"))return "コントローラー";
  if(s.includes("周辺機器"))return "周辺機器";
  return s||"その他";
}
function categoryOrder(v){
  const s=String(v??"");
  if(s.includes("本体"))return 1;
  if(s.includes("コントローラー"))return 2;
  if(s.includes("周辺機器"))return 3;
  return 99;
}
function getConfig(type){
  if(type==="console") return {endpoint:consoleEndpoint,token:consoleToken};
  if(type==="game") return {endpoint:gameEndpoint,token:gameToken};
  return {endpoint:shippingEndpoint,token:shippingToken};
}
function getState(type){
  return type==="console"
    ? {db:consoleDb,hardware:consoleHardware,search:consoleSearch}
    : {db:gameDb,hardware:gameHardware,search:gameSearch};
}
function setSearch(type,value){
  if(type==="console")consoleSearch=value;else gameSearch=value;
}
function getHardwareList(type){
  return type==="console"?CONSOLE_HARDWARES:GAME_HARDWARES;
}
function getCardTemplate(type){
  return el(type==="console"?"console-card-template":"game-card-template");
}
function getStorage(type){
  return type==="console"
    ? {endpoint:"consoleEndpoint",token:"consoleToken",hardware:"consoleHardware",db:"consoleDb"}
    : {endpoint:"gameEndpoint",token:"gameToken",hardware:"gameHardware",db:"gameDb"};
}

// 接続設定をlocalStorageだけに依存せずIndexedDBにも保存する。
// PWAをホーム画面に戻す／再起動しても設定を復元できるようにする。
const PERSIST_DB_NAME="WorkHubPersistent";
const PERSIST_DB_VERSION=1;
const PERSIST_STORE="settings";
let persistDbPromise=null;
function openPersistDb(){
  if(persistDbPromise)return persistDbPromise;
  persistDbPromise=new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){resolve(null);return;}
    const req=indexedDB.open(PERSIST_DB_NAME,PERSIST_DB_VERSION);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(PERSIST_STORE))req.result.createObjectStore(PERSIST_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
  });
  return persistDbPromise;
}
async function persistentSet(key,value){
  try{
    const db=await openPersistDb();
    if(db){
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(PERSIST_STORE,"readwrite");
        tx.objectStore(PERSIST_STORE).put(value,key);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
    }
  }catch(e){}
  try{localStorage.setItem(`workhub_${key}`,JSON.stringify(value));}catch(e){}
}
async function persistentGet(key){
  try{
    const db=await openPersistDb();
    if(db){
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction(PERSIST_STORE,"readonly");
        const req=tx.objectStore(PERSIST_STORE).get(key);
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
      if(value!==undefined&&value!==null)return value;
    }
  }catch(e){}
  try{
    const raw=localStorage.getItem(`workhub_${key}`);
    if(raw!==null){
      const value=JSON.parse(raw);
      // 旧版localStorageにしかない設定はIndexedDBへ移行
      persistentSet(key,value);
      return value;
    }
  }catch(e){}
  return null;
}
async function savePersistentState(type){
  const state=type==="console"
    ? {consoleEndpoint,consoleToken,consoleHardware,consoleDb}
    : type==="game"
      ? {gameEndpoint,gameToken,gameHardware,gameDb}
      : {shippingEndpoint,shippingToken,shippingPrefecture,shippingSize,shippingDb};
  await Promise.all(Object.entries(state).map(([k,v])=>persistentSet(k,v)));
}
async function api(type,action,payload={}){
  const {endpoint,token}=getConfig(type);
  if(!endpoint||!token)throw new Error("Google Sheets接続設定が未入力です");
  const params=new URLSearchParams({
    token,action,
    _ts: String(Date.now()),
    ...Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,typeof v==="object"?JSON.stringify(v):String(v)]))
  });
  const r=await fetch(endpoint+(endpoint.includes("?")?"&":"?")+params.toString(),{method:"GET",redirect:"follow"});
  const text=await r.text();let j;
  try{j=JSON.parse(text);}
  catch(e){throw new Error("Google Apps ScriptからJSONではない応答が返りました。URL/デプロイ設定を確認してください。");}
  if(!j.ok)throw new Error(j.error||"APIエラー");
  return j;
}
async function saveState(type){
  await savePersistentState(type);
}
function renderTabHeader(){
  const normal=activeTab!=="shipping";
  el("normalFilterBar").hidden=!normal;
  el("shippingFilterBar").hidden=normal;
  if(normal){
    const isConsole=activeTab==="console";
    el("hardwareLabel").textContent="ハード";
    el("search").placeholder=isConsole?"🔍 商品名・ASINを検索":"🔍 ソフト名・ASINを検索";
  }
}
function renderHardwareOptions(){
  if(activeTab==="shipping") return;
  const type=activeTab;
  const list=getHardwareList(type);
  const current=type==="console"?consoleHardware:gameHardware;
  const select=el("hardware");
  select.innerHTML=list.map(h=>`<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
  select.value=list.includes(current)?current:(list[0]||"");
}
function switchTab(type,{fetch=true}={}){
  activeTab=type==="game"?"game":type==="shipping"?"shipping":"console";
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===activeTab));
  renderTabHeader();
  renderHardwareOptions();
  if(activeTab!=="shipping") el("search").value=activeTab==="console"?consoleSearch:gameSearch;
  render();
  if(fetch)fetchSheet(activeTab);
  updateMenuForTab();
}
function setEditMode(card,editing){
  card.classList.toggle("editing",editing);
  const edit=card.querySelector(".edit");
  edit.textContent=editing?"✓":"✎";
  edit.title=editing?"編集を終了":"編集";
  if(editing){
    const input=card.querySelector(".title-edit")||card.querySelector(".title-input");
    if(input){input.focus();input.select?.();}
  }
}
async function openExternalTab(url){
  window.open(url,"_blank","noopener,noreferrer");
}
function renderConsole(){
  const resultsEl=el("results"),countEl=el("count");
  const all=consoleDb[consoleHardware]||[],q=normalize(consoleSearch);
  const filtered=q?all.filter(x=>normalize(x.title).includes(q)||normalize(x.asin).includes(q)):all;
  if(countEl)countEl.textContent=`${filtered.length}件 / ${all.length}件`;
  resultsEl.innerHTML="";
  if(!filtered.length){resultsEl.innerHTML='<div class="empty">該当する商品がありません</div>';return;}
  const groups=new Map();
  filtered.forEach(item=>{
    const key=String(item.category||"");const name=categoryName(key);
    if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);
  });
  [...groups.entries()].sort((a,b)=>categoryOrder(a[0])-categoryOrder(b[0])).forEach(([cat,items])=>{
    const h=document.createElement("div");h.className="categoryHeader";h.textContent=`【${cat}】`;resultsEl.appendChild(h);
    items.forEach(item=>{
      const idx=all.indexOf(item),n=getCardTemplate("console").content.cloneNode(true),card=n.querySelector(".card");
      card.dataset.row=String(item.row||idx+3);
      const titleDisplay=n.querySelector(".title-display"),titleEdit=n.querySelector(".title-edit");
      const asin=n.querySelector(".asin"),asinDisplay=n.querySelector(".asin-display");
      const save=n.querySelector(".save"),googleOpen=n.querySelector(".google-open"),open=n.querySelector(".amazon-open"),yahooOpen=n.querySelector(".yahoo-open");
      const del=n.querySelector(".delete"),edit=n.querySelector(".edit"),saved=n.querySelector(".saved");
      titleDisplay.textContent=item.title||"（商品名なし）";titleEdit.value=item.title||"";
      asin.value=item.asin||"";asinDisplay.textContent=item.asin||"ASINなし";
      titleDisplay.onclick=()=>copyText(titleDisplay.textContent.trim());
      asinDisplay.onclick=()=>{const a=asin.value.trim();if(a&&a!=="◎")copyText(a);};
      edit.onclick=()=>setEditMode(card,!card.classList.contains("editing"));
      googleOpen.onclick=async()=>{
        const q=[titleEdit.value.trim()||titleDisplay.textContent.trim(),"amazon"].filter(Boolean).join(" ");
        if(!q)return;try{await openExternalTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`);}catch(e){alert(e.message);}
      };
      open.onclick=async()=>{
        const a=asin.value.trim();if(!a||a==="◎"){alert("ASINを入力してください。");return;}
        try{await openExternalTab(`https://www.amazon.co.jp/dp/${encodeURIComponent(a)}?aod=1`);}catch(e){alert(e.message);}
      };
      yahooOpen.onclick=async()=>{
        const q=[titleEdit.value.trim()||titleDisplay.textContent.trim(),"ジャンク"].filter(Boolean).join(" ");
        if(!q)return;try{await openExternalTab(`https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(q)}&va=${encodeURIComponent(q)}&b=1&n=50`);}catch(e){alert(e.message);}
      };
      save.onclick=async()=>{
        const updated={title:titleEdit.value.trim(),asin:asin.value.trim(),category:item.category||"1.本体"};
        try{
          if(consoleEndpoint&&consoleToken)await api("console","update",{sheet:consoleHardware,row:item.row||idx+3,item:updated});
          Object.assign(item,updated);await saveState("console");
          saved.style.display="block";setTimeout(()=>saved.style.display="none",1200);
          titleDisplay.textContent=updated.title||"（商品名なし）";asinDisplay.textContent=updated.asin||"ASINなし";setEditMode(card,false);
        }catch(e){alert(e.message);}
      };
      del.onclick=async()=>{
        if(!confirm(`「${titleEdit.value||titleDisplay.textContent}」を削除しますか？`))return;
        try{
          if(consoleEndpoint&&consoleToken)await api("console","delete",{sheet:consoleHardware,row:item.row||idx+3});
          all.splice(idx,1);await saveState("console");render();
        }catch(e){alert(e.message);}
      };
      resultsEl.appendChild(n);
    });
  });
}
function renderGame(){
  const resultsEl=el("results"),countEl=el("count");
  const all=gameDb[gameHardware]||[],q=normalize(gameSearch);
  const filtered=q?all.filter(x=>normalize(x.title).includes(q)||normalize(x.asin).includes(q)):all;
  if(countEl)countEl.textContent=`${filtered.length}件 / ${all.length}件`;
  resultsEl.innerHTML="";
  if(!filtered.length){resultsEl.innerHTML='<div class="empty">該当するソフトがありません</div>';return;}
  const t=getCardTemplate("game");
  filtered.forEach(item=>{
    const idx=all.indexOf(item),n=t.content.cloneNode(true),card=n.querySelector(".card");
    const title=n.querySelector(".title-input"),titleDisplay=n.querySelector(".title-display");
    const amazon=n.querySelector(".amazon"),yahoo=n.querySelector(".yahoo"),asin=n.querySelector(".asin");
    const asinDisplay=n.querySelector(".asin-display"),amazonDisplay=n.querySelector(".amazon-display"),yahooDisplay=n.querySelector(".yahoo-display");
    const save=n.querySelector(".save"),open=n.querySelector(".amazon-open"),yahooOpen=n.querySelector(".yahoo-open"),googleOpen=n.querySelector(".google-open");
    const del=n.querySelector(".delete"),edit=n.querySelector(".edit"),saved=n.querySelector(".saved");
    title.value=item.title??"";titleDisplay.textContent=item.title??"";
    amazon.value=item.amazon??"";yahoo.value=item.yahoo??"";asin.value=item.asin??"";
    amazonDisplay.textContent=formatPrice(item.amazon);yahooDisplay.textContent=formatPrice(item.yahoo);asinDisplay.textContent=item.asin||"ASINなし";
    titleDisplay.onclick=()=>copyText(titleDisplay.textContent.trim());
    asinDisplay.onclick=()=>{const a=asin.value.trim();if(a&&a!=="◎")copyText(a);};
    edit.onclick=()=>setEditMode(card,!card.classList.contains("editing"));
    googleOpen.onclick=async()=>{
      const q=[title.value.trim()||titleDisplay.textContent.trim(),"amazon"].filter(Boolean).join(" ");
      if(!q)return;try{await openExternalTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`);}catch(e){alert(e.message);}
    };
    open.onclick=async()=>{
      const a=asin.value.trim();if(!a||a==="◎"){alert("ASINを入力してください。");return;}
      try{await openExternalTab(`https://www.amazon.co.jp/dp/${encodeURIComponent(a)}?aod=1`);}catch(e){alert(e.message);}
    };
    yahooOpen.onclick=async()=>{
      const q=[title.value.trim()||titleDisplay.textContent.trim(),gameHardware].filter(Boolean).join(" ");
      if(!q)return;try{await openExternalTab(`https://auctions.yahoo.co.jp/closedsearch/closedsearch?p=${encodeURIComponent(q)}&va=${encodeURIComponent(q)}&b=1&n=50`);}catch(e){alert(e.message);}
    };
    save.onclick=async()=>{
      const updated={title:title.value.trim(),amazon:amazon.value.trim(),yahoo:yahoo.value.trim(),asin:asin.value.trim()};
      try{
        if(gameEndpoint&&gameToken)await api("game","update",{sheet:gameHardware,row:idx+3,item:updated});
        gameDb[gameHardware][idx]=updated;await saveState("game");
        saved.style.display="block";setTimeout(()=>saved.style.display="none",1200);
        titleDisplay.textContent=updated.title;amazonDisplay.textContent=formatPrice(updated.amazon);yahooDisplay.textContent=formatPrice(updated.yahoo);asinDisplay.textContent=updated.asin||"ASINなし";setEditMode(card,false);
      }catch(e){alert(e.message);}
    };
    del.onclick=async()=>{
      if(!confirm(`「${title.value}」を削除しますか？`))return;
      try{
        if(gameEndpoint&&gameToken)await api("game","delete",{sheet:gameHardware,row:idx+3});
        gameDb[gameHardware].splice(idx,1);await saveState("game");render();
      }catch(e){alert(e.message);}
    };
    resultsEl.appendChild(n);
  });
}
function render(){
  const isShipping=activeTab==="shipping";
  el("shippingResults").hidden=!isShipping;
  el("results").hidden=isShipping;
  if(activeTab==="console")renderConsole();
  else if(activeTab==="game")renderGame();
  else renderShipping();
}
function populateShippingSelectors(){
  const prefEl=el("shippingPrefecture"), sizeEl=el("shippingSize");
  const prefs=[...new Set(shippingDb.map(x=>x.prefecture).filter(Boolean))];
  if(!prefs.length){prefEl.innerHTML="";sizeEl.innerHTML="";return;}
  if(!prefs.includes(shippingPrefecture))shippingPrefecture=prefs[0];
  prefEl.innerHTML=prefs.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  prefEl.value=shippingPrefecture;
  const sizes=[...new Set(shippingDb.filter(x=>x.prefecture===shippingPrefecture).map(x=>x.size).filter(Boolean))];
  sizes.sort((a,b)=>{
    if(a==="コンパクト")return -1;if(b==="コンパクト")return 1;
    const na=Number(String(a).replace(/\s*サイズ\s*$/u,""));
    const nb=Number(String(b).replace(/\s*サイズ\s*$/u,""));
    if(Number.isFinite(na)&&Number.isFinite(nb))return na-nb;
    return String(a).localeCompare(String(b),"ja");
  });
  if(!sizes.includes(shippingSize))shippingSize=sizes[0]||"";
  sizeEl.innerHTML=sizes.map(s=>{
    const display=String(s).replace(/\s*サイズ\s*$/u,"").trim();
    return `<option value="${escapeHtml(s)}">${escapeHtml(display)}</option>`;
  }).join("");
  sizeEl.value=shippingSize;
}
function normalizeShippingSize(v){
  return String(v??"").normalize("NFKC").replace(/\s*サイズ\s*$/u,"").trim();
}
function parseShippingPrice(v){
  if(v===null||v===undefined)return null;
  const s=String(v).trim();
  if(!s||s==="-"||s==="ー"||s==="－"||s==="取扱なし")return null;
  const n=Number(s.replace(/[¥￥,円\s]/g,""));
  return Number.isFinite(n)?n:null;
}
function setShippingPriceButton(button,price){
  const n=parseShippingPrice(price);
  button.className="shipping-price"+(n!==null?"":" unavailable");
  button.textContent=n!==null?formatPrice(n):"取扱なし";
  button.title=n!==null?"クリックで金額をコピー":"取扱なし";
  button.onclick=()=>{if(n!==null)copyText(String(n));};
}
function renderShipping(){
  const rowsEl=el("shippingRows");
  if(!shippingDb.length){
    rowsEl.innerHTML='<div class="empty">送料データがありません。<br>⚙️ → Google Sheets接続設定から接続してください。</div>';
    return;
  }
  const item=shippingDb.find(x=>String(x.prefecture??"").trim()===String(shippingPrefecture??"").trim()&&normalizeShippingSize(x.size)===normalizeShippingSize(shippingSize));
  if(!item){
    rowsEl.innerHTML='<div class="empty">発送元とサイズを選択してください。</div>';
    return;
  }
  // Apps Scriptの旧版/新版どちらのキー名でも表示できるようにする
  const pick=(obj, keys)=>{
    for(const k of keys){
      if(Object.prototype.hasOwnProperty.call(obj,k) && obj[k]!==null && obj[k]!==undefined && String(obj[k]).trim()!=="") return obj[k];
    }
    return null;
  };
  const companies=[
    ["ヤマト運輸",pick(item,["yamato","ヤマト運輸","yamatoPrice"])],
    ["佐川急便",pick(item,["sagawa","佐川急便","sagawaPrice"])],
    ["日本郵便(ゆうパック)",pick(item,["yuupack","日本郵便(ゆうパック)","ゆうパック","yuupackPrice"])],
    ["おてがる配送(日本郵便)",pick(item,["otegaruYuupost","おてがる配送(日本郵便)","おてがる配送(日本郵便）","otegaruYuupostPrice"])],
    ["おてがる配送(ヤマト運輸)",pick(item,["otegaruYamato","おてがる配送(ヤマト運輸)","おてがる配送(ヤマト運輸）","otegaruYamatoPrice"])]
  ];
  rowsEl.innerHTML="";
  companies.forEach(([name,price])=>{
    const row=document.createElement("div");row.className="shipping-row";
    const nameEl=document.createElement("span");nameEl.className="shipping-company";nameEl.textContent=name;
    const priceEl=document.createElement("button");setShippingPriceButton(priceEl,price);
    row.append(nameEl,priceEl);rowsEl.appendChild(row);
  });
}

async function fetchSheet(type,{silent=false}={}){
  if(syncing[type])return;
  const {endpoint,token}=getConfig(type);
  if(!endpoint||!token)return;
  syncing[type]=true;
  const isShipping=type==="shipping";
  const hardware=isShipping?null:(type==="console"?consoleHardware:gameHardware);
  if(activeTab===type)setStatus(isShipping?"送料データを取得中…":"Googleスプレッドシートを取得中…");
  try{
    const j=await api(type,"get",isShipping?{}:{sheet:hardware});
    if(type==="console")consoleDb[hardware]=j.rows||[];
    else if(type==="game")gameDb[hardware]=j.rows||[];
    else shippingDb=j.data||[];
    await saveState(type);
    if(activeTab===type){
      if(isShipping){
        populateShippingSelectors();
        if(j.updatedAt){
          el("shippingUpdated").textContent =
            "更新 " + new Date(j.updatedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
        }
      }
      render();
      setStatus(`${isShipping?"送料データ":"同期"}を取得済み · ${new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}`);
    }
  }catch(e){
    if(activeTab===type){
      setStatus("同期エラー（保存済みデータを表示中）",true);
      if(!silent)alert(e.message);
    }
  }finally{syncing[type]=false;}
}
async function loadSettings(){
  const keys=[
    "consoleEndpoint","consoleToken","consoleHardware","consoleDb",
    "gameEndpoint","gameToken","gameHardware","gameDb",
    "shippingEndpoint","shippingToken","shippingPrefecture","shippingSize","shippingDb",
    "yaEndpoint","yaToken"
  ];
  const values=await Promise.all(keys.map(k=>persistentGet(k)));
  const x={};
  keys.forEach((k,i)=>x[k]=values[i]);

  consoleEndpoint=x.consoleEndpoint||"";
  consoleToken=x.consoleToken||"";
  consoleHardware=x.consoleHardware||CONSOLE_HARDWARES[0]||"";
  if(x.consoleDb)consoleDb=x.consoleDb;
  gameEndpoint=x.gameEndpoint||"";
  gameToken=x.gameToken||"";
  gameHardware=x.gameHardware||GAME_HARDWARES[0]||"";
  if(x.gameDb)gameDb=x.gameDb;
  shippingEndpoint=x.shippingEndpoint||"";
  shippingToken=x.shippingToken||"";
  shippingPrefecture=x.shippingPrefecture||"北海道";
  shippingSize=x.shippingSize||"";
  if(Array.isArray(x.shippingDb))shippingDb=x.shippingDb;
  yaEndpoint=x.yaEndpoint||"";
  yaToken=x.yaToken||"";
  if(!CONSOLE_HARDWARES.includes(consoleHardware))consoleHardware=CONSOLE_HARDWARES[0]||"";
  if(!GAME_HARDWARES.includes(gameHardware))gameHardware=GAME_HARDWARES[0]||"";

  el("consoleEndpoint").value=consoleEndpoint;
  el("consoleToken").value=consoleToken;
  el("gameEndpoint").value=gameEndpoint;
  el("gameToken").value=gameToken;
  el("shippingEndpoint").value=shippingEndpoint;
  el("shippingToken").value=shippingToken;
  el("yaEndpoint").value=yaEndpoint;
  el("yaToken").value=yaToken;

  renderTabHeader();renderHardwareOptions();
  if(shippingDb.length)populateShippingSelectors();
  render();
  updateMenuForTab();

  // 保存済みの接続先があれば、起動直後にバックグラウンドで再接続。
  await reconnectSavedConnections(true);
}
async function reconnectSavedConnections(silent=true){
  const jobs=[];
  if(consoleEndpoint&&consoleToken)jobs.push(fetchSheet("console",{silent}));
  if(gameEndpoint&&gameToken)jobs.push(fetchSheet("game",{silent}));
  if(shippingEndpoint&&shippingToken)jobs.push(fetchSheet("shipping",{silent}));
  if(!jobs.length)return;
  setStatus("保存済みの接続設定で再接続中…");
  await Promise.allSettled(jobs);
  if(activeTab!=="shipping" && (consoleEndpoint&&consoleToken || gameEndpoint&&gameToken)){
    // fetchSheet成功時の表示を優先。失敗時は保存済みデータをそのまま表示。
    render();
  }
}

async function connectAll(){
  consoleEndpoint=el("consoleEndpoint").value.trim().replace(/\/+$/,"");
  consoleToken=el("consoleToken").value.trim();
  gameEndpoint=el("gameEndpoint").value.trim().replace(/\/+$/,"");
  gameToken=el("gameToken").value.trim();
  shippingEndpoint=el("shippingEndpoint").value.trim().replace(/\/+$/,"");
  shippingToken=el("shippingToken").value.trim();
  yaEndpoint=el("yaEndpoint").value.trim().replace(/\/+$/,"");
  yaToken=el("yaToken").value.trim();
  await saveState("console");await saveState("game");await saveState("shipping");
  await persistentSet("yaEndpoint",yaEndpoint);
  await persistentSet("yaToken",yaToken);
  const checks=[];
  if(consoleEndpoint&&consoleToken)checks.push(api("console","ping"));
  if(gameEndpoint&&gameToken)checks.push(api("game","ping"));
  if(shippingEndpoint&&shippingToken)checks.push(api("shipping","ping"));
  if(!checks.length)throw new Error("少なくとも1つの接続先と認証キーを入力してください。");
  await Promise.all(checks);
  if(consoleEndpoint&&consoleToken)await fetchSheet("console");
  if(gameEndpoint&&gameToken)await fetchSheet("game");
  if(shippingEndpoint&&shippingToken)await fetchSheet("shipping");
}
function updateMenuForTab(){
  const add=el("add"), exportBtn=el("export");
  if(add)add.style.display=activeTab==="shipping"?"none":"block";
  if(exportBtn)exportBtn.style.display=activeTab==="shipping"?"none":"block";
}
function toggleMenu(show){
  const menu=el("menu");menu.hidden=show===undefined?!menu.hidden:!show;
}
function exportBackup(type){
  if(type==="shipping")return;
  const db=type==="console"?consoleDb:gameDb;
  const name=type==="console"?"本体・周辺機器_バックアップ.json":"ゲームソフト_バックアップ.json";
  const u=URL.createObjectURL(new Blob([JSON.stringify(db,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
async function addItem(){
  const type=activeTab;toggleMenu(false);
  if(type==="shipping")return;
  if(type==="console"){
    const categories=[...new Set((consoleDb[consoleHardware]||[]).map(x=>x.category).filter(Boolean))];
    const category=categories[0]||"1.本体";
    const title=prompt("追加する商品名を入力してください");if(title===null)return;
    const item={category,title:title.trim(),asin:""};
    try{
      let newRow;
      if(consoleEndpoint&&consoleToken){
        const j=await api("console","append",{sheet:consoleHardware,item});
        consoleDb[consoleHardware]=j.rows||[];
        newRow=consoleDb[consoleHardware].length?consoleDb[consoleHardware][consoleDb[consoleHardware].length-1].row:null;
      }else{
        item.row=(consoleDb[consoleHardware]||[]).length+3;consoleDb[consoleHardware].unshift(item);newRow=item.row;
      }
      await saveState("console");render();
      const target=newRow!=null?el("results").querySelector(`.card[data-row="${CSS.escape(String(newRow))}"]`):null;
      if(target)setEditMode(target,true);
    }catch(e){alert(e.message);}
  }else{
    const item={title:"",amazon:"",yahoo:"",asin:""};
    try{
      if(gameEndpoint&&gameToken){
        const j=await api("game","append",{sheet:gameHardware,item});gameDb[gameHardware]=j.rows||[];
      }else gameDb[gameHardware].unshift(item);
      await saveState("game");render();
      const first=el("results").querySelector(".card");if(first)setEditMode(first,true);
    }catch(e){alert(e.message);}
  }
}

// PWA版YA Explorer：URL入力→専用YA Explorer API→同形式JSONをコピー



document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".tab").forEach(button=>{
    button.onclick=()=>switchTab(button.dataset.tab);
  });
  el("menuButton").onclick=()=>toggleMenu();
  el("settingsMenu").onclick=()=>{toggleMenu(false);el("settings").hidden=false;el(activeTab==="console"?"consoleEndpoint":activeTab==="game"?"gameEndpoint":"shippingEndpoint").focus();};
  el("closeSettings").onclick=()=>{el("settings").hidden=true;};
  el("connect").onclick=async()=>{
    try{await connectAll();el("settings").hidden=true;}
    catch(e){alert(e.message);}
  };

  // 入力した時点でも保存。接続ボタンを押す前にPWAを離れても設定を失わない。
  [
    ["consoleEndpoint","consoleEndpoint"],["consoleToken","consoleToken"],
    ["gameEndpoint","gameEndpoint"],["gameToken","gameToken"],
    ["shippingEndpoint","shippingEndpoint"],["shippingToken","shippingToken"],
    ["yaEndpoint","yaEndpoint"],["yaToken","yaToken"]
  ].forEach(([id,key])=>{
    const node=el(id);
    if(node)node.addEventListener("input",()=>persistentSet(key,node.value.trim()));
  });
  el("refresh").onclick=()=>{toggleMenu(false);fetchSheet(activeTab);};
  requireEl("hardware").onchange=async e=>{
    if(activeTab==="shipping")return;
    if(activeTab==="console"){
      consoleHardware=e.target.value;await saveState("console");
    }else{
      gameHardware=e.target.value;await saveState("game");
    }
    render();fetchSheet(activeTab);
  };
  requireEl("search").oninput=e=>{if(activeTab!=="shipping"){setSearch(activeTab,e.target.value);render();}};
  el("clearSearch").onclick=()=>{
    el("search").value="";setSearch(activeTab,"");render();el("search").focus();
  };
  el("add").onclick=addItem;
  el("export").onclick=()=>{toggleMenu(false);exportBackup(activeTab);};
  el("shippingPrefecture").onchange=async e=>{
    shippingPrefecture=e.target.value;
    shippingSize="";
    await saveState("shipping");
    populateShippingSelectors();
    renderShipping();
  };
  el("shippingSize").onchange=async e=>{
    shippingSize=e.target.value;
    await saveState("shipping");
    renderShipping();
  };
  document.addEventListener("click",e=>{
    const menu=el("menu"),button=el("menuButton");
    if(!menu.hidden&&!menu.contains(e.target)&&e.target!==button)menu.hidden=true;
  });

  // ホーム画面へ戻って再表示された場合も、保存済み設定で再接続。
  let reconnectTimer=null;
  window.addEventListener("pageshow",()=>{
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(()=>reconnectSavedConnections(true).catch(()=>{}),250);
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"){
      clearTimeout(reconnectTimer);
      reconnectTimer=setTimeout(()=>reconnectSavedConnections(true).catch(()=>{}),250);
    }
  });

  loadSettings().catch(e=>setStatus(e.message,true));
});
