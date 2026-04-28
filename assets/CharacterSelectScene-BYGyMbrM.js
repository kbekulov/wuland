import{P as u}from"./phaser-CeIIdTfV.js";import{P as p,C as h,G as v,a as r,c as m,S,H as f,O as y,A as g,b as E,D as C}from"./index-G45GATVm.js";import{l as P,c as b,g as w,b as T,s as A,a as L,d as $,e as V}from"./localSave-C6dRACz7.js";class R extends u.Scene{root;savedProfile=null;editMode=!0;formState=this.createEmptyFormState();constructor(){super("CharacterSelectScene")}create(t={}){this.cameras.main.setBackgroundColor("#123133"),this.savedProfile=P()??t.profile??null,this.editMode=this.savedProfile===null,this.formState=this.createFormState(this.savedProfile),this.mount(),this.events.once(u.Scenes.Events.SHUTDOWN,this.unmount,this)}mount(){this.unmount();const t=document.getElementById("ui-root");if(!t)throw new Error("WULAND UI root is missing.");const e=document.createElement("div");e.className="character-screen",e.innerHTML=this.template(),t.appendChild(e),this.root=e,this.bindFormControls(),this.bindActionButtons(),this.setFormDisabled(!this.editMode),this.updatePreview(),this.updateValidationStatus()}unmount(){this.root?.remove(),this.root=void 0}template(){return`
      <section class="character-panel">
        <div class="character-copy">
          <p class="eyebrow">WULAND Phase 1</p>
          <h1>Enter WULAND</h1>
          ${this.savedProfile?`<div class="saved-actions">
          <div>
            <span class="eyebrow">Saved Character</span>
            <strong data-saved-name></strong>
          </div>
          <div class="action-row">
            <button type="button" class="primary small" data-action="continue">Continue</button>
            <button type="button" class="secondary small" data-action="edit">Edit Character</button>
            <button type="button" class="danger small" data-action="reset">Clear Save</button>
          </div>
        </div>`:`<div class="saved-actions empty">
          <span class="eyebrow">New Character</span>
          <button type="button" class="danger small" data-action="reset">Reset Character</button>
        </div>`}
          <form class="character-form" novalidate>
            <label>
              <span>Name</span>
              <input data-field="name" name="name" maxlength="24" autocomplete="off" placeholder="RPA hero" />
            </label>
            <label>
              <span>Class</span>
              <select data-field="class" name="class">
                <option value="">Select class</option>
                ${p.map(e=>`<option value="${e}">${h[e].displayName}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Gender</span>
              <select data-field="gender" name="gender">
                <option value="">Select gender</option>
                ${v.map(e=>`<option value="${e}">${I(e)}</option>`).join("")}
              </select>
            </label>
            <div class="control-grid">
              ${this.selectTemplate("skinTone","Skin Tone",r.skinTones)}
              ${this.selectTemplate("hairStyle","Hair Style",r.hairStyles)}
              ${this.selectTemplate("hairColor","Hair Color",r.hairColors)}
              ${this.selectTemplate("outfitColor","Outfit Color",r.outfitColors)}
              ${this.selectTemplate("accessory","Accessory",r.accessories)}
              ${this.selectTemplate("spriteVariant","Sprite Variant",r.spriteVariants)}
            </div>
            <p class="form-status" data-status></p>
            <button type="button" class="primary enter-button" data-action="enter">Enter WULAND</button>
          </form>
        </div>
        <aside class="preview-panel" aria-label="Character preview">
          <div class="preview-card">
            <div class="class-chip" data-preview-class-chip></div>
            <div class="preview-sprite" data-preview-sprite>
              <span class="preview-shadow"></span>
              <span class="preview-legs"></span>
              <span class="preview-body"></span>
              <span class="preview-accent"></span>
              <span class="preview-head"></span>
              <span class="preview-hair"></span>
              <span class="preview-accessory"></span>
            </div>
            <h2 data-preview-name></h2>
            <p data-preview-role></p>
          </div>
        </aside>
      </section>
    `}selectTemplate(t,e,s){return`
      <label>
        <span>${e}</span>
        <select data-field="${t}" name="${t}">
          ${s.map(a=>`<option value="${a.id}">${a.label}</option>`).join("")}
        </select>
      </label>
    `}bindFormControls(){const t=this.getElement('[data-field="name"]'),e=this.getElement('[data-field="class"]'),s=this.getElement('[data-field="gender"]'),a=this.getElement('[data-field="skinTone"]'),o=this.getElement('[data-field="hairStyle"]'),i=this.getElement('[data-field="hairColor"]'),l=this.getElement('[data-field="outfitColor"]'),c=this.getElement('[data-field="accessory"]'),d=this.getElement('[data-field="spriteVariant"]');t.value=this.formState.name,e.value=this.formState.class,s.value=this.formState.gender,a.value=this.formState.cosmetics.skinTone,o.value=this.formState.cosmetics.hairStyle,i.value=this.formState.cosmetics.hairColor,l.value=this.formState.cosmetics.outfitColor,c.value=this.formState.cosmetics.accessory,d.value=this.formState.cosmetics.spriteVariant,t.addEventListener("input",()=>{this.formState.name=t.value,this.updatePreview(),this.updateValidationStatus()}),e.addEventListener("change",()=>{this.formState.class=e.value,this.updatePreview(),this.updateValidationStatus()}),s.addEventListener("change",()=>{this.formState.gender=s.value,this.updatePreview(),this.updateValidationStatus()}),a.addEventListener("change",()=>{this.formState.cosmetics.skinTone=a.value,this.updatePreview(),this.updateValidationStatus()}),o.addEventListener("change",()=>{this.formState.cosmetics.hairStyle=o.value,this.updatePreview(),this.updateValidationStatus()}),i.addEventListener("change",()=>{this.formState.cosmetics.hairColor=i.value,this.updatePreview(),this.updateValidationStatus()}),l.addEventListener("change",()=>{this.formState.cosmetics.outfitColor=l.value,this.updatePreview(),this.updateValidationStatus()}),c.addEventListener("change",()=>{this.formState.cosmetics.accessory=c.value,this.updatePreview(),this.updateValidationStatus()}),d.addEventListener("change",()=>{this.formState.cosmetics.spriteVariant=d.value,this.updatePreview(),this.updateValidationStatus()})}bindActionButtons(){this.root?.querySelector('[data-action="continue"]')?.addEventListener("click",()=>{this.savedProfile&&this.startWuland(this.savedProfile)}),this.root?.querySelector('[data-action="edit"]')?.addEventListener("click",()=>{this.editMode=!0,this.mount(),this.getElement('[data-field="name"]').focus()}),this.root?.querySelector('[data-action="reset"]')?.addEventListener("click",()=>{b(),this.savedProfile=null,this.editMode=!0,this.formState=this.createEmptyFormState(),this.mount()}),this.root?.querySelector('[data-action="enter"]')?.addEventListener("click",()=>{this.handleEnter()}),this.savedProfile&&(this.getElement("[data-saved-name]").textContent=`${this.savedProfile.name} (${h[this.savedProfile.class].shortLabel})`)}handleEnter(){const t=this.validationErrors();if(!this.editMode||t.length>0){this.updateValidationStatus(t);return}const e=this.savedProfile?.playerId??w(),s=T({playerId:e,name:this.formState.name.trim(),class:this.formState.class,gender:this.formState.gender,cosmetics:{...this.formState.cosmetics}},this.savedProfile);A(s),this.savedProfile=s,this.startWuland(s)}startWuland(t){const e=L(),s=e?.playerId===t.playerId?e:$(t.playerId);V(s),this.unmount(),this.scene.start("WulandScene",{profile:t,progress:s})}updatePreview(){const t=this.getElement("[data-preview-sprite]"),e=this.getElement("[data-preview-name]"),s=this.getElement("[data-preview-role]"),a=this.getElement("[data-preview-class-chip]"),o=this.formState.class||"developer",i=h[o];t.style.setProperty("--skin",m(S,this.formState.cosmetics.skinTone)),t.style.setProperty("--hair",m(f,this.formState.cosmetics.hairColor)),t.style.setProperty("--outfit",m(y,this.formState.cosmetics.outfitColor)),t.style.setProperty("--class-color",i.color),t.dataset.gender=this.formState.gender||"male",t.dataset.hairStyle=this.formState.cosmetics.hairStyle,t.dataset.accessory=this.formState.cosmetics.accessory,t.dataset.variant=this.formState.cosmetics.spriteVariant,e.textContent=this.formState.name.trim()||"Unnamed",s.textContent=this.formState.class?`${i.displayName} - ${i.futureRole}`:"Choose a class",a.textContent=`${i.iconText} ${i.shortLabel}`,a.style.background=i.color}updateValidationStatus(t=this.validationErrors()){const e=this.getElement("[data-status]"),s=this.getElement('[data-action="enter"]'),a=t.length>0;if(s.disabled=!this.editMode||a,!this.editMode){e.textContent="Continue with the saved character or edit it first.";return}e.textContent=a?t[0]:"Ready to enter WULAND."}validationErrors(){const t=[];return this.formState.name.trim().length===0&&t.push("Name is required."),p.includes(this.formState.class)||t.push("Class is required."),v.includes(this.formState.gender)||t.push("Gender is required."),S.some(e=>e.id===this.formState.cosmetics.skinTone)||t.push("Skin tone is invalid."),f.some(e=>e.id===this.formState.cosmetics.hairColor)||t.push("Hair color is invalid."),r.hairStyles.some(e=>e.id===this.formState.cosmetics.hairStyle)||t.push("Hair style is invalid."),y.some(e=>e.id===this.formState.cosmetics.outfitColor)||t.push("Outfit color is invalid."),g.some(e=>e.id===this.formState.cosmetics.accessory)||t.push("Accessory is invalid."),E.some(e=>e.id===this.formState.cosmetics.spriteVariant)||t.push("Sprite variant is invalid."),t}setFormDisabled(t){this.root?.querySelectorAll(".character-form input, .character-form select").forEach(e=>{e.disabled=t})}createFormState(t){return t?{name:t.name,class:t.class,gender:t.gender,cosmetics:{...t.cosmetics}}:this.createEmptyFormState()}createEmptyFormState(){return{name:"",class:"",gender:"",cosmetics:{...C}}}getElement(t){const e=this.root?.querySelector(t);if(!e)throw new Error(`Missing CharacterSelectScene element: ${t}`);return e}}const I=n=>n.charAt(0).toUpperCase()+n.slice(1);export{R as CharacterSelectScene};
