import{P as c}from"./phaser-CeIIdTfV.js";import{W as h,g as l,d as u,e as p,C as g,B as m,I as n,f as v,i as b}from"./index-CsfbnjdM.js";class w extends c.Scene{root;profile;progress;helpOpen=!1;debugOpen=!1;shopOpen=!1;connection={status:"connecting",message:"Connecting to WULAND server",totalPlayers:0,onlinePlayers:0,sleepingPlayers:0,totalEnemies:0,aliveEnemies:0,localHp:0,localMaxHp:0,localShield:0,defeated:!1,inventory:Array.from({length:u},(t,e)=>({slotIndex:e,itemDefinitionId:"",itemInstanceId:"",quantity:0})),selectedHotbarSlot:0,activeItemName:"No item",nearbyPickupName:"",nearMerchant:!1,nearbyPortalId:"",portalPrompt:"",nearbyGiftPlayerName:"",currentMapId:h,currentMapName:l(h),totalDroppedItems:0,godModeAvailable:!1,godModeCodeRequired:!1,godModeActive:!1,serverProtocolVersion:0,serverProtocolOk:!1};hotbarDrag;chatMessages=[];chatCollapsed=!1;godModeCode="";constructor(){super("UIScene")}create(t){this.profile=t.profile,this.progress=t.progress,this.connection=t.connection??this.connection,this.mount(),this.render(),this.game.events.on("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.on("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.on("wuland:toggleHelp",this.toggleHelp,this),this.game.events.on("wuland:toggleDebug",this.toggleDebug,this),this.game.events.on("wuland:openMerchantShop",this.openMerchantShop,this),this.game.events.on("wuland:chatMessage",this.handleChatMessage,this),this.events.once(c.Scenes.Events.SHUTDOWN,this.cleanup,this)}mount(){const t=document.getElementById("ui-root");if(!t)throw new Error("WULAND UI root is missing.");this.root=document.createElement("div"),this.root.className="wuland-hud",this.root.innerHTML=`
      <section class="hud-card">
        <div class="hud-header">
          <div>
            <span class="eyebrow">Local Player</span>
            <strong data-hud-name></strong>
          </div>
          <div class="hud-actions">
            <button type="button" class="secondary icon-button" data-action="help">Help</button>
            <button type="button" class="secondary icon-button god-button" data-action="god-mode">God Mode</button>
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
        <div class="hud-hint">1-9 select | Space attack | E use | F interact/shop | G gift</div>
        <div class="hud-active-item">
          <span class="eyebrow">Selected</span>
          <strong data-hud-active-item>No item</strong>
          <span data-hud-pickup-hint></span>
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
          <strong>Chat</strong>
          <button type="button" class="secondary small" data-action="toggle-chat">Min</button>
        </header>
        <div class="chat-messages" data-chat-messages></div>
        <form class="chat-form" data-chat-form>
          <input data-chat-input maxlength="${p}" autocomplete="off" placeholder="Enter to chat" />
          <button type="submit" class="primary small">Send</button>
        </form>
      </section>
      <section class="help-overlay" data-help-overlay>
        <div>
          <button type="button" class="secondary small" data-action="close-help">Close</button>
          <h2>Controls</h2>
          <p>WASD / arrows move. Click or tap the map to move there. Click or tap an enemy to select it.</p>
          <p>1-9 selects a hotbar slot. Space attacks with the selected weapon. E uses a selected consumable. F uses doors, picks up nearby drops, or opens the shop near the merchant. G gifts selected cakes to nearby players.</p>
          <p>Enter focuses chat. Enter again sends. Escape leaves chat input.</p>
          <p>Drag hotbar items to swap slots. Drag outside the hotbar to drop an item on the map. Sleeping players stay visible but do not fight.</p>
          <p>God Mode is a prototype admin tool: when active, click a dropped item to delete it or another player to delete that character.</p>
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
          <p class="shop-note">Currency is infinite for this prototype. Prices are flavor.</p>
          <div class="merchant-stock" data-merchant-stock></div>
        </div>
      </section>
    `,t.appendChild(this.root),this.root.querySelector('[data-action="edit-character"]')?.addEventListener("click",()=>{this.game.events.emit("wuland:editCharacter")}),this.root.querySelector('[data-action="help"]')?.addEventListener("click",()=>this.toggleHelp()),this.root.querySelector('[data-action="god-mode"]')?.addEventListener("click",()=>this.toggleGodMode()),this.root.querySelector('[data-action="close-help"]')?.addEventListener("click",()=>this.toggleHelp(!1)),this.root.querySelector('[data-action="toggle-chat"]')?.addEventListener("click",()=>this.toggleChat()),this.root.querySelector("[data-chat-form]")?.addEventListener("submit",e=>this.handleChatSubmit(e)),this.root.querySelector("[data-chat-input]")?.addEventListener("keydown",e=>this.handleChatInputKeydown(e)),this.root.querySelector('[data-action="close-shop"]')?.addEventListener("click",()=>this.openMerchantShop(!1)),this.root.querySelector("[data-merchant-stock]")?.addEventListener("click",e=>this.handleShopClick(e)),this.root.querySelector("[data-hotbar-slots]")?.addEventListener("pointerdown",e=>this.handleHotbarPointerDown(e)),window.addEventListener("pointermove",this.handleHotbarPointerMove),window.addEventListener("pointerup",this.handleHotbarPointerUp),window.addEventListener("keydown",this.handleWindowKeydown,!0)}render(){if(!this.root)return;const t=g[this.profile.class],e=new Set(this.progress.visitedBuildings),a=this.root.querySelector("[data-hud-buildings]");this.setText("[data-hud-name]",this.profile.name),this.setText("[data-hud-class]",`${t.iconText} ${t.displayName} | ${t.futureRole}`),this.setText("[data-hud-location]",this.connection.currentMapName),this.setText("[data-hud-position]",`x:${Math.round(this.progress.lastPosition.x)} y:${Math.round(this.progress.lastPosition.y)}`),this.setText("[data-hud-save]",`saved ${new Date(this.progress.updatedAt).toLocaleTimeString()}`),this.setText("[data-hud-connection]",this.connection.message),this.setText("[data-hud-total]",String(this.connection.totalPlayers)),this.setText("[data-hud-online]",String(this.connection.onlinePlayers)),this.setText("[data-hud-sleeping]",String(this.connection.sleepingPlayers)),this.setText("[data-hud-hp]",`${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated?" respawning":""}`),this.setText("[data-hud-active-item]",this.connection.activeItemName),this.setText("[data-hud-pickup-hint]",this.interactionHint()),this.setText("[data-hud-enemies]",String(this.connection.totalEnemies)),this.setText("[data-hud-alive-enemies]",String(this.connection.aliveEnemies)),this.setText("[data-hud-shield]",String(this.connection.localShield)),this.setMeter("[data-hud-hp-fill]",this.hpPercent()),this.root.dataset.connectionStatus=this.connection.status,this.root.dataset.helpOpen=String(this.helpOpen),this.root.dataset.debugOpen=String(this.debugOpen),this.root.dataset.shopOpen=String(this.shopOpen),this.root.dataset.chatCollapsed=String(this.chatCollapsed),this.root.dataset.godModeActive=String(this.connection.godModeActive),this.setGodModeButton(),this.setChatButton(),this.renderHotbar(),this.renderMerchantStock(),this.renderChatMessages(),a&&(a.innerHTML=m.map(s=>{const i=e.has(s)?"[x]":"[ ]";return`<li class="${e.has(s)?"visited":""}"><span>${i}</span>${s}</li>`}).join(""))}handleProgressUpdated(t){this.progress=t,this.render()}handleConnectionUpdated(t){this.connection=t,this.render()}toggleHelp(t){this.helpOpen=t??!this.helpOpen,this.render()}toggleDebug(){this.debugOpen=!this.debugOpen,this.render()}openMerchantShop(t=!0){this.shopOpen=t,this.render()}toggleChat(t){this.chatCollapsed=t??!this.chatCollapsed,this.chatCollapsed&&this.root?.querySelector("[data-chat-input]")?.blur(),this.render()}toggleGodMode(){if(!this.connection.godModeAvailable)return;const t=!this.connection.godModeActive;if(t&&this.connection.godModeCodeRequired&&!this.godModeCode){const e=window.prompt("Enter God Mode code");if(!e)return;this.godModeCode=e}this.game.events.emit("wuland:setGodMode",{active:t,code:this.godModeCode})}setGodModeButton(){const t=this.root?.querySelector('[data-action="god-mode"]');t&&(t.disabled=!this.connection.godModeAvailable,t.textContent=this.connection.godModeActive?"God: On":"God Mode",t.title=this.connection.godModeActive?"God Mode: click a dropped item to delete it, or another player to delete their account.":"Prototype admin cleanup tool.")}setChatButton(){const t=this.root?.querySelector('[data-action="toggle-chat"]');t&&(t.textContent=this.chatCollapsed?"Open":"Min")}handleChatMessage(t){this.chatMessages=[...this.chatMessages,t].slice(-50),this.render()}handleChatSubmit(t){t.preventDefault();const e=this.root?.querySelector("[data-chat-input]"),a=e?.value.trim()??"";!e||a.length===0||(this.game.events.emit("wuland:sendChat",{text:a.slice(0,p)}),e.value="",e.blur(),this.chatCollapsed=!0,this.render())}handleChatInputKeydown(t){t.stopPropagation(),t.key==="Escape"&&(t.preventDefault(),this.root?.querySelector("[data-chat-input]")?.blur())}handleWindowKeydown=t=>{if(t.key!=="Enter"&&t.key!=="Escape")return;const e=this.root?.querySelector("[data-chat-input]");if(e){if(t.key==="Escape"&&document.activeElement===e){t.preventDefault(),t.stopPropagation(),e.blur();return}t.key==="Enter"&&document.activeElement!==e&&(t.preventDefault(),t.stopPropagation(),this.chatCollapsed=!1,this.render(),e.focus())}};interactionHint(){const t=[];return this.connection.nearMerchant?t.push("F: shop"):this.connection.portalPrompt?t.push(this.connection.portalPrompt):this.connection.nearbyPickupName&&t.push(`F: pick up ${this.connection.nearbyPickupName}`),this.connection.nearbyGiftPlayerName&&t.push(`G: gift to ${this.connection.nearbyGiftPlayerName}`),t.join(" | ")}setText(t,e){const a=this.root?.querySelector(t);a&&(a.textContent=e)}setMeter(t,e){const a=this.root?.querySelector(t);a&&(a.style.width=`${Math.round(e*100)}%`)}hpPercent(){return this.connection.localMaxHp<=0?0:Math.max(0,Math.min(1,this.connection.localHp/this.connection.localMaxHp))}renderHotbar(){const t=this.root?.querySelector("[data-hotbar-slots]");t&&(t.innerHTML=this.connection.inventory.map(e=>{const a=e.itemDefinitionId?n[e.itemDefinitionId]:null,s=e.slotIndex===this.connection.selectedHotbarSlot,i=a?.stackable&&e.quantity>1?`<span class="hotbar-count">${e.quantity}</span>`:"",d=a?`${a.displayName} (${a.itemType}): ${a.description} ${y(a.itemDefinitionId)}`:`Empty slot ${e.slotIndex+1}`;return`
        <button
          type="button"
          class="hotbar-slot${s?" selected":""}"
          data-hotbar-slot="${e.slotIndex}"
          title="${f(d)}"
        >
          <span class="hotbar-number">${e.slotIndex+1}</span>
          <strong>${a?.iconText??""}</strong>
          <small>${a?.displayName??"Empty"}</small>
          ${i}
        </button>
      `}).join(""))}renderMerchantStock(){const t=this.root?.querySelector("[data-merchant-stock]");t&&(t.innerHTML=v.map(e=>{const a=n[e.itemDefinitionId];return`
        <article class="merchant-item">
          <strong class="merchant-icon">${a.iconText}</strong>
          <div>
            <h3>${a.displayName}</h3>
            <span>${a.itemType} | ${e.priceLabel}</span>
            <p>${a.description}</p>
          </div>
          <button type="button" class="primary small" data-buy-item="${a.itemDefinitionId}">Buy</button>
        </article>
      `}).join(""))}renderChatMessages(){const t=this.root?.querySelector("[data-chat-messages]");t&&(t.innerHTML=this.chatMessages.map(e=>`
        <p>
          ${e.mapId===this.connection.currentMapId?"":`<span class="chat-map">[${r(l(e.mapId))}]</span>`}
          <strong>${r(e.playerName)}</strong>
          <span>${r(e.text)}</span>
        </p>
      `).join(""),t.scrollTop=t.scrollHeight)}handleShopClick(t){const a=t.target?.closest("[data-buy-item]")?.dataset.buyItem;!a||!(a in n)||this.game.events.emit("wuland:buyMerchantItem",a)}handleHotbarPointerMove=t=>{if(!this.hotbarDrag)return;const e=Math.hypot(t.clientX-this.hotbarDrag.startX,t.clientY-this.hotbarDrag.startY);this.hotbarDrag.moved=this.hotbarDrag.moved||e>8};handleHotbarPointerUp=t=>{const e=this.hotbarDrag;if(!e)return;this.hotbarDrag=void 0;const a=document.elementFromPoint(t.clientX,t.clientY)?.closest("[data-hotbar-slot]");if(!e.moved){this.game.events.emit("wuland:selectHotbarSlot",e.slotIndex);return}if(!a){this.game.events.emit("wuland:discardHotbarItem",e.slotIndex);return}const s=Number.parseInt(a.dataset.hotbarSlot??"",10);Number.isInteger(s)&&this.game.events.emit("wuland:moveHotbarItem",{fromSlotIndex:e.slotIndex,toSlotIndex:s})};handleHotbarPointerDown(t){const e=t.target?.closest("[data-hotbar-slot]");if(!e)return;t.preventDefault();const a=Number.parseInt(e.dataset.hotbarSlot??"",10);Number.isInteger(a)&&(this.hotbarDrag={slotIndex:a,startX:t.clientX,startY:t.clientY,moved:!1})}cleanup(){this.game.events.off("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.off("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.off("wuland:toggleHelp",this.toggleHelp,this),this.game.events.off("wuland:toggleDebug",this.toggleDebug,this),this.game.events.off("wuland:openMerchantShop",this.openMerchantShop,this),this.game.events.off("wuland:chatMessage",this.handleChatMessage,this),window.removeEventListener("pointermove",this.handleHotbarPointerMove),window.removeEventListener("pointerup",this.handleHotbarPointerUp),window.removeEventListener("keydown",this.handleWindowKeydown,!0),this.root?.remove(),this.root=void 0}}const y=o=>{const t=n[o];return t.itemType==="weapon"?"Press Space to attack.":b(o)?"Press E to eat. Press G near another player to gift.":t.itemType==="consumable"?"Press E to use.":""},f=o=>o.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),r=o=>o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");export{w as UIScene};
