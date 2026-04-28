import{P as h}from"./phaser-CeIIdTfV.js";import{d as c,C as d,B as l,I as o,W as p,i as u}from"./index-G45GATVm.js";class y extends h.Scene{root;profile;progress;helpOpen=!1;debugOpen=!1;shopOpen=!1;connection={status:"connecting",message:"Connecting to WULAND server",totalPlayers:0,onlinePlayers:0,sleepingPlayers:0,totalEnemies:0,aliveEnemies:0,localHp:0,localMaxHp:0,localShield:0,defeated:!1,inventory:Array.from({length:c},(t,e)=>({slotIndex:e,itemDefinitionId:"",itemInstanceId:"",quantity:0})),selectedHotbarSlot:0,activeItemName:"No item",nearbyPickupName:"",nearMerchant:!1,nearbyGiftPlayerName:"",totalDroppedItems:0};hotbarDrag;constructor(){super("UIScene")}create(t){this.profile=t.profile,this.progress=t.progress,this.connection=t.connection??this.connection,this.mount(),this.render(),this.game.events.on("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.on("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.on("wuland:toggleHelp",this.toggleHelp,this),this.game.events.on("wuland:toggleDebug",this.toggleDebug,this),this.game.events.on("wuland:openMerchantShop",this.openMerchantShop,this),this.events.once(h.Scenes.Events.SHUTDOWN,this.cleanup,this)}mount(){const t=document.getElementById("ui-root");if(!t)throw new Error("WULAND UI root is missing.");this.root=document.createElement("div"),this.root.className="wuland-hud",this.root.innerHTML=`
      <section class="hud-card">
        <div class="hud-header">
          <div>
            <span class="eyebrow">Local Player</span>
            <strong data-hud-name></strong>
          </div>
          <div class="hud-actions">
            <button type="button" class="secondary icon-button" data-action="help">Help</button>
            <button type="button" class="secondary icon-button" data-action="edit-character">Edit</button>
          </div>
        </div>
        <div class="hud-class" data-hud-class></div>
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
      <section class="help-overlay" data-help-overlay>
        <div>
          <button type="button" class="secondary small" data-action="close-help">Close</button>
          <h2>Controls</h2>
          <p>WASD / arrows move. Click or tap the map to move there. Click or tap an enemy to select it.</p>
          <p>1-9 selects a hotbar slot. Space attacks with the selected weapon. E uses a selected consumable. F picks up nearby drops or opens the shop near the merchant. G gifts selected cakes to nearby players.</p>
          <p>Drag hotbar items to swap slots. Drag outside the hotbar to drop an item on the map. Sleeping players stay visible but do not fight.</p>
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
    `,t.appendChild(this.root),this.root.querySelector('[data-action="edit-character"]')?.addEventListener("click",()=>{this.game.events.emit("wuland:editCharacter")}),this.root.querySelector('[data-action="help"]')?.addEventListener("click",()=>this.toggleHelp()),this.root.querySelector('[data-action="close-help"]')?.addEventListener("click",()=>this.toggleHelp(!1)),this.root.querySelector('[data-action="close-shop"]')?.addEventListener("click",()=>this.openMerchantShop(!1)),this.root.querySelector("[data-merchant-stock]")?.addEventListener("click",e=>this.handleShopClick(e)),this.root.querySelector("[data-hotbar-slots]")?.addEventListener("pointerdown",e=>this.handleHotbarPointerDown(e)),window.addEventListener("pointermove",this.handleHotbarPointerMove),window.addEventListener("pointerup",this.handleHotbarPointerUp)}render(){if(!this.root)return;const t=d[this.profile.class],e=new Set(this.progress.visitedBuildings),s=this.root.querySelector("[data-hud-buildings]");this.setText("[data-hud-name]",this.profile.name),this.setText("[data-hud-class]",`${t.iconText} ${t.displayName} | ${t.futureRole}`),this.setText("[data-hud-position]",`x:${Math.round(this.progress.lastPosition.x)} y:${Math.round(this.progress.lastPosition.y)}`),this.setText("[data-hud-save]",`saved ${new Date(this.progress.updatedAt).toLocaleTimeString()}`),this.setText("[data-hud-connection]",this.connection.message),this.setText("[data-hud-total]",String(this.connection.totalPlayers)),this.setText("[data-hud-online]",String(this.connection.onlinePlayers)),this.setText("[data-hud-sleeping]",String(this.connection.sleepingPlayers)),this.setText("[data-hud-hp]",`${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated?" respawning":""}`),this.setText("[data-hud-active-item]",this.connection.activeItemName),this.setText("[data-hud-pickup-hint]",this.interactionHint()),this.setText("[data-hud-enemies]",String(this.connection.totalEnemies)),this.setText("[data-hud-alive-enemies]",String(this.connection.aliveEnemies)),this.setText("[data-hud-shield]",String(this.connection.localShield)),this.setMeter("[data-hud-hp-fill]",this.hpPercent()),this.root.dataset.connectionStatus=this.connection.status,this.root.dataset.helpOpen=String(this.helpOpen),this.root.dataset.debugOpen=String(this.debugOpen),this.root.dataset.shopOpen=String(this.shopOpen),this.renderHotbar(),this.renderMerchantStock(),s&&(s.innerHTML=l.map(n=>{const i=e.has(n)?"[x]":"[ ]";return`<li class="${e.has(n)?"visited":""}"><span>${i}</span>${n}</li>`}).join(""))}handleProgressUpdated(t){this.progress=t,this.render()}handleConnectionUpdated(t){this.connection=t,this.render()}toggleHelp(t){this.helpOpen=t??!this.helpOpen,this.render()}toggleDebug(){this.debugOpen=!this.debugOpen,this.render()}openMerchantShop(t=!0){this.shopOpen=t,this.render()}interactionHint(){const t=[];return this.connection.nearMerchant?t.push("F: shop"):this.connection.nearbyPickupName&&t.push(`F: pick up ${this.connection.nearbyPickupName}`),this.connection.nearbyGiftPlayerName&&t.push(`G: gift to ${this.connection.nearbyGiftPlayerName}`),t.join(" | ")}setText(t,e){const s=this.root?.querySelector(t);s&&(s.textContent=e)}setMeter(t,e){const s=this.root?.querySelector(t);s&&(s.style.width=`${Math.round(e*100)}%`)}hpPercent(){return this.connection.localMaxHp<=0?0:Math.max(0,Math.min(1,this.connection.localHp/this.connection.localMaxHp))}renderHotbar(){const t=this.root?.querySelector("[data-hotbar-slots]");t&&(t.innerHTML=this.connection.inventory.map(e=>{const s=e.itemDefinitionId?o[e.itemDefinitionId]:null,n=e.slotIndex===this.connection.selectedHotbarSlot,i=s?.stackable&&e.quantity>1?`<span class="hotbar-count">${e.quantity}</span>`:"",r=s?`${s.displayName} (${s.itemType}): ${s.description} ${m(s.itemDefinitionId)}`:`Empty slot ${e.slotIndex+1}`;return`
        <button
          type="button"
          class="hotbar-slot${n?" selected":""}"
          data-hotbar-slot="${e.slotIndex}"
          title="${g(r)}"
        >
          <span class="hotbar-number">${e.slotIndex+1}</span>
          <strong>${s?.iconText??""}</strong>
          <small>${s?.displayName??"Empty"}</small>
          ${i}
        </button>
      `}).join(""))}renderMerchantStock(){const t=this.root?.querySelector("[data-merchant-stock]");t&&(t.innerHTML=p.map(e=>{const s=o[e.itemDefinitionId];return`
        <article class="merchant-item">
          <strong class="merchant-icon">${s.iconText}</strong>
          <div>
            <h3>${s.displayName}</h3>
            <span>${s.itemType} | ${e.priceLabel}</span>
            <p>${s.description}</p>
          </div>
          <button type="button" class="primary small" data-buy-item="${s.itemDefinitionId}">Buy</button>
        </article>
      `}).join(""))}handleShopClick(t){const s=t.target?.closest("[data-buy-item]")?.dataset.buyItem;!s||!(s in o)||this.game.events.emit("wuland:buyMerchantItem",s)}handleHotbarPointerMove=t=>{if(!this.hotbarDrag)return;const e=Math.hypot(t.clientX-this.hotbarDrag.startX,t.clientY-this.hotbarDrag.startY);this.hotbarDrag.moved=this.hotbarDrag.moved||e>8};handleHotbarPointerUp=t=>{const e=this.hotbarDrag;if(!e)return;this.hotbarDrag=void 0;const s=document.elementFromPoint(t.clientX,t.clientY)?.closest("[data-hotbar-slot]");if(!e.moved){this.game.events.emit("wuland:selectHotbarSlot",e.slotIndex);return}if(!s){this.game.events.emit("wuland:discardHotbarItem",e.slotIndex);return}const n=Number.parseInt(s.dataset.hotbarSlot??"",10);Number.isInteger(n)&&this.game.events.emit("wuland:moveHotbarItem",{fromSlotIndex:e.slotIndex,toSlotIndex:n})};handleHotbarPointerDown(t){const e=t.target?.closest("[data-hotbar-slot]");if(!e)return;t.preventDefault();const s=Number.parseInt(e.dataset.hotbarSlot??"",10);Number.isInteger(s)&&(this.hotbarDrag={slotIndex:s,startX:t.clientX,startY:t.clientY,moved:!1})}cleanup(){this.game.events.off("wuland:progressUpdated",this.handleProgressUpdated,this),this.game.events.off("wuland:connectionUpdated",this.handleConnectionUpdated,this),this.game.events.off("wuland:toggleHelp",this.toggleHelp,this),this.game.events.off("wuland:toggleDebug",this.toggleDebug,this),this.game.events.off("wuland:openMerchantShop",this.openMerchantShop,this),window.removeEventListener("pointermove",this.handleHotbarPointerMove),window.removeEventListener("pointerup",this.handleHotbarPointerUp),this.root?.remove(),this.root=void 0}}const m=a=>{const t=o[a];return t.itemType==="weapon"?"Press Space to attack.":u(a)?"Press E to eat. Press G near another player to gift.":t.itemType==="consumable"?"Press E to use.":""},g=a=>a.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");export{y as UIScene};
