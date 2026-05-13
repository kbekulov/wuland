import{P as u}from"./phaser-CeIIdTfV.js";import{W as m,g,d as M,e as y,C as w,B as S,I as r,f as C,i as I}from"./index-BdFBk034.js";class H extends u.Scene{root;profile;progress;helpOpen=!1;debugOpen=!1;shopOpen=!1;connection={status:"connecting",message:"Connecting to WULAND server",totalPlayers:0,onlinePlayers:0,sleepingPlayers:0,totalEnemies:0,aliveEnemies:0,localHp:0,localMaxHp:0,localShield:0,defeated:!1,inventory:Array.from({length:M},(t,e)=>({slotIndex:e,itemDefinitionId:"",itemInstanceId:"",quantity:0})),selectedHotbarSlot:0,money:0,activeItemName:"No item",nearbyPickupName:"",nearMerchant:!1,nearbyPortalId:"",portalPrompt:"",nearbyGiftPlayerName:"",nearbyPetNpcId:"",nearbyPetName:"",currentMapId:m,currentMapName:g(m),totalDroppedItems:0,godModeAvailable:!1,godModeCodeRequired:!1,godModeActive:!1,serverProtocolVersion:0,serverProtocolOk:!1};hotbarDrag;chatMessages=[];chatCollapsed=!1;godModeCode="";shopFeedback="";lastBuyIntent=null;hotbarRenderKey="";merchantRenderKey="";constructor(){super("UIScene")}create(t){this.profile=t.profile,this.progress=t.progress,this.connection=t.connection??this.connection,this.chatCollapsed=i()&&!$(),this.mount(),this.render(),this.game.events.on("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.on("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.on("wuland:toggleHelp",this.toggleHelp,this),this.game.events.on("wuland:toggleDebug",this.toggleDebug,this),this.game.events.on("wuland:openMerchantShop",this.openMerchantShop,this),this.game.events.on("wuland:chatHistory",this.handleChatHistory,this),this.game.events.on("wuland:chatMessage",this.handleChatMessage,this),this.game.events.on("wuland:chatCleared",this.handleChatCleared,this),this.game.events.on("wuland:shopFeedback",this.handleShopFeedback,this),this.game.events.on("wuland:focusChat",this.focusChatInput,this),this.events.once(u.Scenes.Events.SHUTDOWN,this.cleanup,this)}mount(){const t=document.getElementById("ui-root");if(!t)throw new Error("WULAND UI root is missing.");this.root=document.createElement("div"),this.root.className="wuland-hud",this.hotbarRenderKey="",this.merchantRenderKey="",this.root.innerHTML=`
      <section class="hud-card">
        <div class="hud-header">
          <div>
            <span class="eyebrow">Local Player</span>
            <strong data-hud-name></strong>
          </div>
          <div class="hud-actions">
            <button type="button" class="secondary icon-button" data-action="help">Help</button>
            <button type="button" class="secondary icon-button god-button" data-action="god-mode">God Mode</button>
            <button type="button" class="secondary icon-button god-clear-chat-button" data-action="clear-chat">Clear Chat</button>
            <button type="button" class="secondary icon-button" data-action="edit-character">Edit</button>
          </div>
        </div>
        <div class="hud-class" data-hud-class></div>
        <div class="hud-location">
          <span class="eyebrow">Location</span>
          <strong data-hud-location>WULAND</strong>
        </div>
        <div class="hud-combat">
          <div class="hud-meter">
            <span class="eyebrow">HP</span>
            <strong data-hud-hp></strong>
            <span class="meter-track"><span data-hud-hp-fill></span></span>
          </div>
        </div>
        <div class="hud-hint">Tap the map to move | Tap a target then Attack | Use the joystick for tight spaces</div>
        <div class="hud-active-item">
          <span class="eyebrow">Selected</span>
          <strong data-hud-active-item>No item</strong>
          <span data-hud-pickup-hint></span>
        </div>
        <div class="hud-money">
          <span class="eyebrow">Money</span>
          <strong data-hud-money>0</strong>
        </div>
        <div class="hud-network">
          <span class="status-dot"></span>
          <span data-hud-connection></span>
        </div>
        <div class="hud-counts">
          <span><strong data-hud-total>0</strong>Total</span>
          <span><strong data-hud-online>0</strong>Online</span>
          <span><strong data-hud-sleeping>0</strong>Sleeping</span>
        </div>
        <div class="hud-counts enemy-counts">
          <span><strong data-hud-enemies>0</strong>Enemies</span>
          <span><strong data-hud-alive-enemies>0</strong>Active</span>
          <span><strong data-hud-shield>0</strong>Shield</span>
        </div>
        <div class="hud-section">
          <span class="eyebrow">Visited Buildings</span>
          <ul data-hud-buildings></ul>
        </div>
        <div class="hud-debug">
          <span data-hud-position></span>
          <span data-hud-save></span>
        </div>
      </section>
      <section class="hotbar-panel" data-hotbar-panel aria-label="Inventory hotbar">
        <div class="hotbar-slots" data-hotbar-slots></div>
      </section>
      <section class="chat-window" data-chat-window>
        <header>
          <button type="button" class="secondary small" data-action="toggle-chat">Min</button>
        </header>
        <div class="chat-messages" data-chat-messages></div>
        <form class="chat-form" data-chat-form>
          <input data-chat-input maxlength="${y}" autocomplete="off" placeholder="Enter to chat" />
          <button type="submit" class="primary small">Send</button>
        </form>
      </section>
      <section class="help-overlay" data-help-overlay>
        <div>
          <button type="button" class="secondary small" data-action="close-help">Close</button>
          <section class="settings-status">
            <span class="eyebrow">Status</span>
            <strong data-settings-name></strong>
            <div class="settings-status-grid">
              <span><b data-settings-hp></b>HP</span>
              <span><b data-settings-location></b>Location</span>
              <span><b data-settings-money></b>Coins</span>
              <span><b data-settings-item></b>Selected</span>
            </div>
            <p data-settings-connection></p>
            <p data-settings-counts></p>
          </section>
          <h2>Controls</h2>
          <p>Phone first: tap the map to travel, use the joystick for tight spaces, tap a target, then press Attack.</p>
          <p>Tap a hotbar slot to select it. Attack uses the selected weapon. Use eats selected cakes. Interact uses doors, picks up nearby drops, or opens the merchant shop. Gift sends selected cake to a nearby player.</p>
          <p>Desktop still works: WASD / arrows move, Space attacks, E uses, F interacts, G gifts, and 1-9 select hotbar slots.</p>
          <p>Enter focuses chat. Enter again sends. Escape leaves chat input.</p>
          <p>Drag hotbar items to swap slots. Drag outside the hotbar to drop one item from that slot on the map. Sleeping players stay visible and can be targeted in prototype combat.</p>
          <p>God Mode is a prototype admin tool: when active, click a dropped item to delete it, click another player to delete that character, or use Clear Chat to remove persisted chat history.</p>
        </div>
      </section>
      <section class="merchant-shop" data-merchant-shop>
        <div>
          <header>
            <div>
              <span class="eyebrow">Traveling Merchant</span>
              <h2>Odd Cart Supplies</h2>
            </div>
            <button type="button" class="secondary small" data-action="close-shop">Close</button>
          </header>
          <p class="shop-note">Prototype test funds: <strong data-shop-money>0</strong></p>
          <p class="shop-feedback" data-shop-feedback></p>
          <div class="merchant-stock" data-merchant-stock></div>
        </div>
      </section>
    `,t.appendChild(this.root),this.root.querySelector('[data-action="edit-character"]')?.addEventListener("click",()=>{this.game.events.emit("wuland:editCharacter")}),this.root.querySelector('[data-action="help"]')?.addEventListener("click",()=>this.toggleHelp()),this.root.querySelector('[data-action="god-mode"]')?.addEventListener("click",()=>this.toggleGodMode()),this.root.querySelector('[data-action="clear-chat"]')?.addEventListener("click",()=>this.clearChatHistory()),this.root.querySelector('[data-action="close-help"]')?.addEventListener("click",()=>this.toggleHelp(!1)),this.root.querySelector('[data-action="toggle-chat"]')?.addEventListener("click",()=>this.toggleChat()),this.root.querySelector("[data-chat-form]")?.addEventListener("submit",e=>this.handleChatSubmit(e)),this.root.querySelector("[data-chat-input]")?.addEventListener("keydown",e=>this.handleChatInputKeydown(e)),this.root.querySelector('[data-action="close-shop"]')?.addEventListener("click",()=>this.openMerchantShop(!1)),this.root.querySelector("[data-merchant-stock]")?.addEventListener("pointerup",e=>this.handleShopBuyIntent(e)),this.root.querySelector("[data-merchant-stock]")?.addEventListener("click",e=>this.handleShopBuyIntent(e)),this.root.querySelector("[data-hotbar-slots]")?.addEventListener("pointerdown",e=>this.handleHotbarPointerDown(e)),window.addEventListener("pointermove",this.handleHotbarPointerMove),window.addEventListener("pointerup",this.handleHotbarPointerUp),window.addEventListener("keydown",this.handleWindowKeydown,!0)}render(){if(!this.root)return;const t=w[this.profile.class],e=new Set(this.progress.visitedBuildings),n=this.root.querySelector("[data-hud-buildings]");this.setText("[data-hud-name]",this.profile.name),this.setText("[data-settings-name]",this.profile.name),this.setText("[data-hud-class]",`${t.iconText} ${t.displayName} | ${t.futureRole}`),this.setText("[data-hud-location]",this.connection.currentMapName),this.setText("[data-settings-location]",this.connection.currentMapName),this.setText("[data-hud-position]",`x:${Math.round(this.progress.lastPosition.x)} y:${Math.round(this.progress.lastPosition.y)}`),this.setText("[data-hud-save]",`saved ${new Date(this.progress.updatedAt).toLocaleTimeString()}`),this.setText("[data-hud-connection]",this.connection.message),this.setText("[data-hud-total]",String(this.connection.totalPlayers)),this.setText("[data-hud-online]",String(this.connection.onlinePlayers)),this.setText("[data-hud-sleeping]",String(this.connection.sleepingPlayers)),this.setText("[data-hud-hp]",`${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated?" respawning":""}`),this.setText("[data-settings-hp]",`${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated?" respawning":""}`),this.setText("[data-hud-active-item]",this.connection.activeItemName),this.setText("[data-settings-item]",this.connection.activeItemName),this.setText("[data-hud-money]",`${p(this.connection.money)} coins`),this.setText("[data-settings-money]",p(this.connection.money)),this.setText("[data-settings-connection]",this.connection.message),this.setText("[data-settings-counts]",`${this.connection.onlinePlayers} online | ${this.connection.sleepingPlayers} sleeping | ${this.connection.aliveEnemies}/${this.connection.totalEnemies} enemies active`),this.setText("[data-shop-money]",`${p(this.connection.money)} WULAND coins`),this.setText("[data-shop-feedback]",this.shopFeedback),this.setText("[data-hud-pickup-hint]",this.interactionHint()),this.setText("[data-hud-enemies]",String(this.connection.totalEnemies)),this.setText("[data-hud-alive-enemies]",String(this.connection.aliveEnemies)),this.setText("[data-hud-shield]",String(this.connection.localShield)),this.setMeter("[data-hud-hp-fill]",this.hpPercent()),this.root.dataset.connectionStatus=this.connection.status,this.root.dataset.helpOpen=String(this.helpOpen),this.root.dataset.debugOpen=String(this.debugOpen),this.root.dataset.shopOpen=String(this.shopOpen),this.root.dataset.chatCollapsed=String(this.chatCollapsed),this.root.dataset.godModeActive=String(this.connection.godModeActive),this.root.dataset.touchLayout=String(i()),this.setGodModeButton(),this.setClearChatButton(),this.setChatButton(),this.renderHotbar(),this.renderMerchantStock(),this.renderChatMessages(),n&&(n.innerHTML=S.map(s=>{const o=e.has(s)?"[x]":"[ ]";return`<li class="${e.has(s)?"visited":""}"><span>${o}</span>${s}</li>`}).join(""))}handleProgressUpdated(t){this.progress=t,this.render()}handleConnectionUpdated(t){this.connection=t,this.render()}toggleHelp(t){this.helpOpen=t??!this.helpOpen,this.render()}toggleDebug(){this.debugOpen=!this.debugOpen,this.render()}openMerchantShop(t=!0){this.shopOpen=t,t&&(this.shopFeedback="",this.merchantRenderKey=""),this.render()}toggleChat(t){this.chatCollapsed=t??!this.chatCollapsed,this.chatCollapsed?this.root?.querySelector("[data-chat-input]")?.blur():i()&&window.setTimeout(()=>this.focusChatInput(),0),this.render()}focusChatInput(){this.chatCollapsed=!1,this.render(),this.root?.querySelector("[data-chat-input]")?.focus()}toggleGodMode(){if(!this.connection.godModeAvailable)return;const t=!this.connection.godModeActive;if(t&&this.connection.godModeCodeRequired&&!this.godModeCode){const e=window.prompt("Enter God Mode code");if(!e)return;this.godModeCode=e}this.game.events.emit("wuland:setGodMode",{active:t,code:this.godModeCode})}clearChatHistory(){if(!(!this.connection.godModeAvailable||!this.connection.godModeActive)){if(this.connection.godModeCodeRequired&&!this.godModeCode){const t=window.prompt("Enter God Mode code");if(!t)return;this.godModeCode=t}window.confirm("Clear all persisted WULAND chat messages for every player?")&&this.game.events.emit("wuland:clearChat",{code:this.godModeCode})}}setGodModeButton(){const t=this.root?.querySelector('[data-action="god-mode"]');t&&(t.disabled=!this.connection.godModeAvailable,t.textContent=this.connection.godModeActive?"God: On":"God Mode",t.title=this.connection.godModeActive?"God Mode: click a dropped item to delete it, or another player to delete their account.":"Prototype admin cleanup tool.")}setClearChatButton(){const t=this.root?.querySelector('[data-action="clear-chat"]');t&&(t.disabled=!this.connection.godModeAvailable||!this.connection.godModeActive,t.title=this.connection.godModeActive?"Clear persisted chat messages for everyone.":"Turn on God Mode to clear chat.")}setChatButton(){const t=this.root?.querySelector('[data-action="toggle-chat"]');t&&(t.textContent=this.chatCollapsed?"Open":"Min")}handleChatMessage(t){this.chatMessages=b(this.chatMessages,[t]),this.render()}handleChatHistory(t){this.chatMessages=b(this.chatMessages,t),this.render()}handleChatCleared(){this.chatMessages=[],this.render()}handleShopFeedback(t){this.shopFeedback=t,this.render()}handleChatSubmit(t){t.preventDefault();const e=this.root?.querySelector("[data-chat-input]"),n=e?.value.trim()??"";if(e){if(n.length===0){e.blur();return}this.game.events.emit("wuland:sendChat",{text:n.slice(0,y)}),e.value="",e.blur(),document.activeElement instanceof HTMLElement&&document.activeElement.blur(),this.render()}}handleChatInputKeydown(t){t.stopPropagation(),t.key==="Escape"&&(t.preventDefault(),this.root?.querySelector("[data-chat-input]")?.blur())}handleWindowKeydown=t=>{if(t.key!=="Enter"&&t.key!=="Escape")return;const e=this.root?.querySelector("[data-chat-input]");if(e){if(t.key==="Escape"&&document.activeElement===e){t.preventDefault(),t.stopPropagation(),e.blur();return}t.key==="Enter"&&document.activeElement!==e&&(t.preventDefault(),t.stopPropagation(),this.chatCollapsed=!1,this.render(),e.focus())}};interactionHint(){const t=[];return this.connection.nearMerchant?t.push(i()?"Interact: shop":"F: shop"):this.connection.portalPrompt?t.push(i()?P(this.connection.portalPrompt):this.connection.portalPrompt):this.connection.nearbyPickupName&&t.push(i()?`Interact: pick up ${this.connection.nearbyPickupName}`:`F: pick up ${this.connection.nearbyPickupName}`),this.connection.nearbyGiftPlayerName&&t.push(i()?`Gift: ${this.connection.nearbyGiftPlayerName}`:`G: gift to ${this.connection.nearbyGiftPlayerName}`),this.connection.nearbyPetName&&t.push(i()?`Pet: ${this.connection.nearbyPetName}`:`F: pet ${this.connection.nearbyPetName}`),t.join(" | ")}setText(t,e){const n=this.root?.querySelector(t);n&&(n.textContent=e)}setMeter(t,e){const n=this.root?.querySelector(t);n&&(n.style.width=`${Math.round(e*100)}%`)}hpPercent(){return this.connection.localMaxHp<=0?0:Math.max(0,Math.min(1,this.connection.localHp/this.connection.localMaxHp))}renderHotbar(){const t=this.root?.querySelector("[data-hotbar-slots]");if(!t)return;const e=this.connection.inventory.map(n=>`${n.slotIndex}:${n.itemDefinitionId}:${n.itemInstanceId}:${n.quantity}`).join("|")+`|selected:${this.connection.selectedHotbarSlot}`;e!==this.hotbarRenderKey&&(this.hotbarRenderKey=e,t.innerHTML=this.connection.inventory.map(n=>{const s=n.itemDefinitionId?r[n.itemDefinitionId]:null,o=n.slotIndex===this.connection.selectedHotbarSlot,c=s?.stackable&&n.quantity>1?`<span class="hotbar-count">${n.quantity}</span>`:"",l=s?`${s.displayName} (${s.itemType}): ${s.description} ${T(s.itemDefinitionId)}`:`Empty slot ${n.slotIndex+1}`;return`
        <button
          type="button"
          class="hotbar-slot${o?" selected":""}"
          data-hotbar-slot="${n.slotIndex}"
          title="${v(l)}"
        >
          <span class="hotbar-number">${n.slotIndex+1}</span>
          ${f(s)}
          <small>${s?.displayName??"Empty"}</small>
          ${c}
        </button>
      `}).join(""))}renderMerchantStock(){const t=this.root?.querySelector("[data-merchant-stock]");if(!t||!this.shopOpen)return;const e=[this.connection.money,...this.connection.inventory.map(s=>`${s.slotIndex}:${s.itemDefinitionId}:${s.itemInstanceId}:${s.quantity}`)].join("|");if(e===this.merchantRenderKey)return;const n=t.scrollTop;this.merchantRenderKey=e,t.innerHTML=C.map(s=>{const o=r[s.itemDefinitionId],c=k(this.connection.inventory,s.itemDefinitionId),l=this.connection.money>=s.price,d=c?l?"":"Need more coins":"Inventory full";return`
        <article class="merchant-item${d?" blocked":""}">
          <span class="merchant-icon">${f(o)}</span>
          <div>
            <h3>${o.displayName}</h3>
            <span>${o.itemType} | ${s.priceLabel}</span>
            <p>${o.description}</p>
          </div>
          <button
            type="button"
            class="primary small"
            data-buy-item="${o.itemDefinitionId}"
            ${d?"disabled":""}
            title="${d||`Buy ${o.displayName}`}"
          >${d||"Buy"}</button>
        </article>
      `}).join(""),t.scrollTop=n}renderChatMessages(){const t=this.root?.querySelector("[data-chat-messages]");t&&(t.innerHTML=this.chatMessages.map(e=>`
        <p>
          ${e.mapId===this.connection.currentMapId?"":`<span class="chat-map">[${h(g(e.mapId))}]</span>`}
          <strong>${h(e.playerName)}</strong>
          <span>${h(e.text)}</span>
        </p>
      `).join(""),t.scrollTop=t.scrollHeight)}handleShopBuyIntent(t){const e=t.target?.closest("[data-buy-item]"),n=e?.dataset.buyItem;if(e&&(t.preventDefault(),t.stopPropagation()),!n||!(n in r)||e?.disabled)return;const s=Date.now();this.lastBuyIntent?.itemDefinitionId===n&&s-this.lastBuyIntent.sentAt<350||(this.lastBuyIntent={itemDefinitionId:n,sentAt:s},this.shopFeedback=`Buying ${r[n].displayName}...`,this.render(),this.game.events.emit("wuland:buyMerchantItem",n))}handleHotbarPointerMove=t=>{if(!this.hotbarDrag)return;const e=Math.hypot(t.clientX-this.hotbarDrag.startX,t.clientY-this.hotbarDrag.startY);this.hotbarDrag.moved=this.hotbarDrag.moved||e>8};handleHotbarPointerUp=t=>{const e=this.hotbarDrag;if(!e)return;this.hotbarDrag=void 0;const n=document.elementFromPoint(t.clientX,t.clientY)?.closest("[data-hotbar-slot]");if(!e.moved){this.game.events.emit("wuland:selectHotbarSlot",e.slotIndex);return}if(!n){this.game.events.emit("wuland:discardHotbarItem",e.slotIndex);return}const s=Number.parseInt(n.dataset.hotbarSlot??"",10);Number.isInteger(s)&&this.game.events.emit("wuland:moveHotbarItem",{fromSlotIndex:e.slotIndex,toSlotIndex:s})};handleHotbarPointerDown(t){const e=t.target?.closest("[data-hotbar-slot]");if(!e)return;t.preventDefault();const n=Number.parseInt(e.dataset.hotbarSlot??"",10);Number.isInteger(n)&&(this.hotbarDrag={slotIndex:n,startX:t.clientX,startY:t.clientY,moved:!1})}cleanup(){this.game.events.off("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.off("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.off("wuland:toggleHelp",this.toggleHelp,this),this.game.events.off("wuland:toggleDebug",this.toggleDebug,this),this.game.events.off("wuland:openMerchantShop",this.openMerchantShop,this),this.game.events.off("wuland:chatHistory",this.handleChatHistory,this),this.game.events.off("wuland:chatMessage",this.handleChatMessage,this),this.game.events.off("wuland:chatCleared",this.handleChatCleared,this),this.game.events.off("wuland:shopFeedback",this.handleShopFeedback,this),this.game.events.off("wuland:focusChat",this.focusChatInput,this),window.removeEventListener("pointermove",this.handleHotbarPointerMove),window.removeEventListener("pointerup",this.handleHotbarPointerUp),window.removeEventListener("keydown",this.handleWindowKeydown,!0),this.root?.remove(),this.root=void 0}}const b=(a,t)=>{const e=new Map;return[...a,...t].forEach(n=>{e.set(n.messageId,n)}),[...e.values()].sort((n,s)=>Date.parse(n.sentAt)-Date.parse(s.sentAt)).slice(-100)},k=(a,t)=>{const e=r[t];return e.stackable&&a.find(s=>s.itemDefinitionId===t&&s.quantity>0&&s.quantity<e.maxStack)?!0:a.some(n=>!n.itemDefinitionId||n.quantity<=0)},p=a=>Math.max(0,Math.floor(a)).toLocaleString("en-US"),i=()=>window.matchMedia("(pointer: coarse)").matches||window.innerWidth<=860,$=()=>i()&&window.matchMedia("(orientation: portrait)").matches,P=a=>a.replace(/^Press F to /,"Interact: "),f=a=>a?a.iconAsset?`
    <img
      class="item-icon-image"
      src="${v(a.iconAsset)}"
      alt=""
      loading="eager"
      decoding="async"
      draggable="false"
    />
  `:`<strong class="item-icon-fallback">${h(a.iconText)}</strong>`:'<strong class="item-icon-fallback"></strong>',T=a=>{const t=r[a];return a==="flashlight"?"Select it in The Cave to light the way.":t.itemType==="weapon"?"Press Space to attack.":I(a)?"Press E to eat. Press G near another player to gift.":t.itemType==="consumable"?"Press E to use.":""},v=a=>a.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),h=a=>a.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");export{H as UIScene};
