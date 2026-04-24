import{P as i}from"./phaser-BzgIAAyK.js";import{C as r,B as n}from"./index-Vn9il1Ry.js";class u extends i.Scene{root;profile;progress;constructor(){super("UIScene")}create(s){this.profile=s.profile,this.progress=s.progress,this.mount(),this.render(),this.game.events.on("wuland:progressUpdated",this.handleProgressUpdated,this),this.events.once(i.Scenes.Events.SHUTDOWN,this.cleanup,this)}mount(){const s=document.getElementById("ui-root");if(!s)throw new Error("WULAND UI root is missing.");this.root=document.createElement("div"),this.root.className="wuland-hud",this.root.innerHTML=`
      <section class="hud-card">
        <div class="hud-header">
          <div>
            <span class="eyebrow">Local Player</span>
            <strong data-hud-name></strong>
          </div>
          <button type="button" class="secondary icon-button" data-action="edit-character">Edit Character</button>
        </div>
        <div class="hud-class" data-hud-class></div>
        <div class="hud-section">
          <span class="eyebrow">Visited Buildings</span>
          <ul data-hud-buildings></ul>
        </div>
        <div class="hud-debug">
          <span data-hud-position></span>
          <span data-hud-save></span>
        </div>
      </section>
    `,s.appendChild(this.root),this.root.querySelector('[data-action="edit-character"]')?.addEventListener("click",()=>{this.game.events.emit("wuland:editCharacter")})}render(){if(!this.root)return;const s=r[this.profile.class],e=new Set(this.progress.visitedBuildings),t=this.root.querySelector("[data-hud-buildings]");this.setText("[data-hud-name]",this.profile.name),this.setText("[data-hud-class]",`${s.iconText} ${s.displayName} | ${s.futureRole}`),this.setText("[data-hud-position]",`x:${Math.round(this.progress.lastPosition.x)} y:${Math.round(this.progress.lastPosition.y)}`),this.setText("[data-hud-save]",`saved ${new Date(this.progress.updatedAt).toLocaleTimeString()}`),t&&(t.innerHTML=n.map(a=>{const o=e.has(a)?"[x]":"[ ]";return`<li class="${e.has(a)?"visited":""}"><span>${o}</span>${a}</li>`}).join(""))}handleProgressUpdated(s){this.progress=s,this.render()}setText(s,e){const t=this.root?.querySelector(s);t&&(t.textContent=e)}cleanup(){this.game.events.off("wuland:progressUpdated",this.handleProgressUpdated,this),this.root?.remove(),this.root=void 0}}export{u as UIScene};
