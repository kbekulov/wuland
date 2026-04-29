import Phaser from "phaser";
import {
  ACCESSORY_OPTIONS,
  CHARACTER_COSMETICS,
  CLASS_METADATA,
  DEFAULT_COSMETICS,
  GENDERS,
  HAIR_COLORS,
  OUTFIT_COLORS,
  PLAYER_CLASSES,
  SKIN_TONES,
  SPRITE_VARIANTS,
  colorForOption,
  type AccessoryOption,
  type CharacterCosmetics,
  type Gender,
  type HairColor,
  type HairStyle,
  type LocalProgress,
  type OutfitColor,
  type PlayerClass,
  type PlayerProfile,
  type SkinTone,
  type SpriteVariant
} from "@wuland/shared";
import {
  buildPlayerProfile,
  clearAllSaveData,
  createInitialProgress,
  getOrCreatePlayerId,
  loadPlayerProfile,
  loadProgress,
  savePlayerProfile,
  saveProgress
} from "../../persistence/localSave.ts";

interface CharacterSelectData {
  profile?: PlayerProfile | null;
  progress?: LocalProgress | null;
  message?: string;
}

interface CharacterFormState {
  name: string;
  class: PlayerClass | "";
  gender: Gender | "";
  cosmetics: CharacterCosmetics;
}

export class CharacterSelectScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private savedProfile: PlayerProfile | null = null;
  private editMode = true;
  private formState: CharacterFormState = this.createEmptyFormState();
  private screenMessage = "";

  constructor() {
    super("CharacterSelectScene");
  }

  create(data: CharacterSelectData = {}): void {
    this.cameras.main.setBackgroundColor("#123133");
    this.savedProfile = loadPlayerProfile() ?? data.profile ?? null;
    this.screenMessage = data.message ?? "";
    this.editMode = this.savedProfile === null;
    this.formState = this.createFormState(this.savedProfile);
    this.mount();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.unmount, this);
  }

  private mount(): void {
    this.unmount();

    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("WULAND UI root is missing.");
    }

    const root = document.createElement("div");
    root.className = "character-screen";
    root.innerHTML = this.template();
    uiRoot.appendChild(root);
    this.root = root;

    this.bindFormControls();
    this.bindActionButtons();
    this.setFormDisabled(!this.editMode);
    this.updatePreview();
    this.updateScreenMessage();
    this.updateValidationStatus();
  }

  private unmount(): void {
    this.root?.remove();
    this.root = undefined;
  }

  private template(): string {
    const savedActions = this.savedProfile
      ? `<div class="saved-actions">
          <div>
            <span class="eyebrow">Saved Character</span>
            <strong data-saved-name></strong>
          </div>
          <div class="action-row">
            <button type="button" class="primary small" data-action="continue">Continue</button>
            <button type="button" class="secondary small" data-action="edit">Edit Character</button>
            <button type="button" class="danger small" data-action="reset">Clear Save</button>
          </div>
        </div>`
      : `<div class="saved-actions empty">
          <span class="eyebrow">New Character</span>
          <button type="button" class="danger small" data-action="reset">Reset Character</button>
        </div>`;

    return `
      <section class="character-panel">
        <div class="character-copy">
          <p class="eyebrow">WULAND Phase 1</p>
          <h1>Enter WULAND</h1>
          ${savedActions}
          <p class="form-status character-message" data-screen-message></p>
          <form class="character-form" novalidate>
            <label>
              <span>Name</span>
              <input data-field="name" name="name" maxlength="24" autocomplete="off" placeholder="RPA hero" />
            </label>
            <label>
              <span>Class</span>
              <select data-field="class" name="class">
                <option value="">Select class</option>
                ${PLAYER_CLASSES.map(
                  (playerClass) =>
                    `<option value="${playerClass}">${CLASS_METADATA[playerClass].displayName}</option>`
                ).join("")}
              </select>
            </label>
            <label>
              <span>Gender</span>
              <select data-field="gender" name="gender">
                <option value="">Select gender</option>
                ${GENDERS.map((gender) => `<option value="${gender}">${capitalize(gender)}</option>`).join("")}
              </select>
            </label>
            <div class="control-grid">
              ${this.selectTemplate("skinTone", "Skin Tone", CHARACTER_COSMETICS.skinTones)}
              ${this.selectTemplate("hairStyle", "Hair Style", CHARACTER_COSMETICS.hairStyles)}
              ${this.selectTemplate("hairColor", "Hair Color", CHARACTER_COSMETICS.hairColors)}
              ${this.selectTemplate("outfitColor", "Outfit Color", CHARACTER_COSMETICS.outfitColors)}
              ${this.selectTemplate("accessory", "Accessory", CHARACTER_COSMETICS.accessories)}
              ${this.selectTemplate("spriteVariant", "Sprite Variant", CHARACTER_COSMETICS.spriteVariants)}
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
    `;
  }

  private selectTemplate(
    field: keyof CharacterCosmetics,
    label: string,
    options: readonly { readonly id: string; readonly label: string }[]
  ): string {
    return `
      <label>
        <span>${label}</span>
        <select data-field="${field}" name="${field}">
          ${options.map((option) => `<option value="${option.id}">${option.label}</option>`).join("")}
        </select>
      </label>
    `;
  }

  private bindFormControls(): void {
    const nameInput = this.getElement<HTMLInputElement>('[data-field="name"]');
    const classSelect = this.getElement<HTMLSelectElement>('[data-field="class"]');
    const genderSelect = this.getElement<HTMLSelectElement>('[data-field="gender"]');
    const skinToneSelect = this.getElement<HTMLSelectElement>('[data-field="skinTone"]');
    const hairStyleSelect = this.getElement<HTMLSelectElement>('[data-field="hairStyle"]');
    const hairColorSelect = this.getElement<HTMLSelectElement>('[data-field="hairColor"]');
    const outfitColorSelect = this.getElement<HTMLSelectElement>('[data-field="outfitColor"]');
    const accessorySelect = this.getElement<HTMLSelectElement>('[data-field="accessory"]');
    const spriteVariantSelect = this.getElement<HTMLSelectElement>('[data-field="spriteVariant"]');

    nameInput.value = this.formState.name;
    classSelect.value = this.formState.class;
    genderSelect.value = this.formState.gender;
    skinToneSelect.value = this.formState.cosmetics.skinTone;
    hairStyleSelect.value = this.formState.cosmetics.hairStyle;
    hairColorSelect.value = this.formState.cosmetics.hairColor;
    outfitColorSelect.value = this.formState.cosmetics.outfitColor;
    accessorySelect.value = this.formState.cosmetics.accessory;
    spriteVariantSelect.value = this.formState.cosmetics.spriteVariant;

    nameInput.addEventListener("input", () => {
      this.formState.name = nameInput.value;
      this.updatePreview();
      this.updateValidationStatus();
    });

    classSelect.addEventListener("change", () => {
      this.formState.class = classSelect.value as PlayerClass | "";
      this.updatePreview();
      this.updateValidationStatus();
    });

    genderSelect.addEventListener("change", () => {
      this.formState.gender = genderSelect.value as Gender | "";
      this.updatePreview();
      this.updateValidationStatus();
    });

    skinToneSelect.addEventListener("change", () => {
      this.formState.cosmetics.skinTone = skinToneSelect.value as SkinTone;
      this.updatePreview();
      this.updateValidationStatus();
    });

    hairStyleSelect.addEventListener("change", () => {
      this.formState.cosmetics.hairStyle = hairStyleSelect.value as HairStyle;
      this.updatePreview();
      this.updateValidationStatus();
    });

    hairColorSelect.addEventListener("change", () => {
      this.formState.cosmetics.hairColor = hairColorSelect.value as HairColor;
      this.updatePreview();
      this.updateValidationStatus();
    });

    outfitColorSelect.addEventListener("change", () => {
      this.formState.cosmetics.outfitColor = outfitColorSelect.value as OutfitColor;
      this.updatePreview();
      this.updateValidationStatus();
    });

    accessorySelect.addEventListener("change", () => {
      this.formState.cosmetics.accessory = accessorySelect.value as AccessoryOption;
      this.updatePreview();
      this.updateValidationStatus();
    });

    spriteVariantSelect.addEventListener("change", () => {
      this.formState.cosmetics.spriteVariant = spriteVariantSelect.value as SpriteVariant;
      this.updatePreview();
      this.updateValidationStatus();
    });
  }

  private bindActionButtons(): void {
    this.root?.querySelector('[data-action="continue"]')?.addEventListener("click", () => {
      if (this.savedProfile) {
        this.startWuland(this.savedProfile);
      }
    });

    this.root?.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      this.editMode = true;
      this.mount();
      this.getElement<HTMLInputElement>('[data-field="name"]').focus();
    });

    this.root?.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      clearAllSaveData();
      this.savedProfile = null;
      this.editMode = true;
      this.formState = this.createEmptyFormState();
      this.mount();
    });

    this.root?.querySelector('[data-action="enter"]')?.addEventListener("click", () => {
      this.handleEnter();
    });

    if (this.savedProfile) {
      this.getElement<HTMLElement>("[data-saved-name]").textContent =
        `${this.savedProfile.name} (${CLASS_METADATA[this.savedProfile.class].shortLabel})`;
    }
  }

  private handleEnter(): void {
    const errors = this.validationErrors();

    if (!this.editMode || errors.length > 0) {
      this.updateValidationStatus(errors);
      return;
    }

    const playerId = this.savedProfile?.playerId ?? getOrCreatePlayerId();
    const profile = buildPlayerProfile(
      {
        playerId,
        name: this.formState.name.trim(),
        class: this.formState.class as PlayerClass,
        gender: this.formState.gender as Gender,
        cosmetics: { ...this.formState.cosmetics }
      },
      this.savedProfile
    );

    savePlayerProfile(profile);
    this.savedProfile = profile;
    this.startWuland(profile);
  }

  private startWuland(profile: PlayerProfile): void {
    const savedProgress = loadProgress();
    const progress =
      savedProgress?.playerId === profile.playerId
        ? savedProgress
        : createInitialProgress(profile.playerId);

    saveProgress(progress);
    this.unmount();
    this.scene.start("WulandScene", { profile, progress });
  }

  private updatePreview(): void {
    const sprite = this.getElement<HTMLElement>("[data-preview-sprite]");
    const name = this.getElement<HTMLElement>("[data-preview-name]");
    const role = this.getElement<HTMLElement>("[data-preview-role]");
    const classChip = this.getElement<HTMLElement>("[data-preview-class-chip]");
    const playerClass = this.formState.class || "developer";
    const classMeta = CLASS_METADATA[playerClass];

    sprite.style.setProperty("--skin", colorForOption(SKIN_TONES, this.formState.cosmetics.skinTone));
    sprite.style.setProperty("--hair", colorForOption(HAIR_COLORS, this.formState.cosmetics.hairColor));
    sprite.style.setProperty("--outfit", colorForOption(OUTFIT_COLORS, this.formState.cosmetics.outfitColor));
    sprite.style.setProperty("--class-color", classMeta.color);
    sprite.dataset.gender = this.formState.gender || "male";
    sprite.dataset.hairStyle = this.formState.cosmetics.hairStyle;
    sprite.dataset.accessory = this.formState.cosmetics.accessory;
    sprite.dataset.variant = this.formState.cosmetics.spriteVariant;

    name.textContent = this.formState.name.trim() || "Unnamed";
    role.textContent = this.formState.class
      ? `${classMeta.displayName} - ${classMeta.futureRole}`
      : "Choose a class";
    classChip.textContent = `${classMeta.iconText} ${classMeta.shortLabel}`;
    classChip.style.background = classMeta.color;
  }

  private updateValidationStatus(errors = this.validationErrors()): void {
    const status = this.getElement<HTMLElement>("[data-status]");
    const enterButton = this.getElement<HTMLButtonElement>('[data-action="enter"]');
    const hasErrors = errors.length > 0;

    enterButton.disabled = !this.editMode || hasErrors;

    if (!this.editMode) {
      status.textContent = "Continue with the saved character or edit it first.";
      return;
    }

    status.textContent = hasErrors ? errors[0] : "Ready to enter WULAND.";
  }

  private updateScreenMessage(): void {
    const message = this.root?.querySelector<HTMLElement>("[data-screen-message]");

    if (message) {
      message.textContent = this.screenMessage;
    }
  }

  private validationErrors(): string[] {
    const errors: string[] = [];

    if (this.formState.name.trim().length === 0) {
      errors.push("Name is required.");
    }

    if (!PLAYER_CLASSES.includes(this.formState.class as PlayerClass)) {
      errors.push("Class is required.");
    }

    if (!GENDERS.includes(this.formState.gender as Gender)) {
      errors.push("Gender is required.");
    }

    if (!SKIN_TONES.some((option) => option.id === this.formState.cosmetics.skinTone)) {
      errors.push("Skin tone is invalid.");
    }

    if (!HAIR_COLORS.some((option) => option.id === this.formState.cosmetics.hairColor)) {
      errors.push("Hair color is invalid.");
    }

    if (!CHARACTER_COSMETICS.hairStyles.some((option) => option.id === this.formState.cosmetics.hairStyle)) {
      errors.push("Hair style is invalid.");
    }

    if (!OUTFIT_COLORS.some((option) => option.id === this.formState.cosmetics.outfitColor)) {
      errors.push("Outfit color is invalid.");
    }

    if (!ACCESSORY_OPTIONS.some((option) => option.id === this.formState.cosmetics.accessory)) {
      errors.push("Accessory is invalid.");
    }

    if (!SPRITE_VARIANTS.some((option) => option.id === this.formState.cosmetics.spriteVariant)) {
      errors.push("Sprite variant is invalid.");
    }

    return errors;
  }

  private setFormDisabled(disabled: boolean): void {
    this.root
      ?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".character-form input, .character-form select")
      .forEach((control) => {
        control.disabled = disabled;
      });
  }

  private createFormState(profile: PlayerProfile | null): CharacterFormState {
    if (!profile) {
      return this.createEmptyFormState();
    }

    return {
      name: profile.name,
      class: profile.class,
      gender: profile.gender,
      cosmetics: { ...profile.cosmetics }
    };
  }

  private createEmptyFormState(): CharacterFormState {
    return {
      name: "",
      class: "",
      gender: "",
      cosmetics: { ...DEFAULT_COSMETICS }
    };
  }

  private getElement<T extends HTMLElement>(selector: string): T {
    const element = this.root?.querySelector<T>(selector);

    if (!element) {
      throw new Error(`Missing CharacterSelectScene element: ${selector}`);
    }

    return element;
  }
}

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);
