import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CLASS_METADATA,
  type LocalProgress,
  type PlayerProfile
} from "@wuland/shared";

interface UISceneData {
  profile: PlayerProfile;
  progress: LocalProgress;
}

export class UIScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private profile!: PlayerProfile;
  private progress!: LocalProgress;

  constructor() {
    super("UIScene");
  }

  create(data: UISceneData): void {
    this.profile = data.profile;
    this.progress = data.progress;
    this.mount();
    this.render();

    this.game.events.on("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private mount(): void {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("WULAND UI root is missing.");
    }

    this.root = document.createElement("div");
    this.root.className = "wuland-hud";
    this.root.innerHTML = `
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
    `;
    uiRoot.appendChild(this.root);

    this.root
      .querySelector('[data-action="edit-character"]')
      ?.addEventListener("click", () => {
        this.game.events.emit("wuland:editCharacter");
      });
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    const classMeta = CLASS_METADATA[this.profile.class];
    const visited = new Set(this.progress.visitedBuildings);
    const buildingList = this.root.querySelector("[data-hud-buildings]");

    this.setText("[data-hud-name]", this.profile.name);
    this.setText(
      "[data-hud-class]",
      `${classMeta.iconText} ${classMeta.displayName} | ${classMeta.futureRole}`
    );
    this.setText(
      "[data-hud-position]",
      `x:${Math.round(this.progress.lastPosition.x)} y:${Math.round(this.progress.lastPosition.y)}`
    );
    this.setText("[data-hud-save]", `saved ${new Date(this.progress.updatedAt).toLocaleTimeString()}`);

    if (buildingList) {
      buildingList.innerHTML = BUILDING_NAMES.map((building) => {
        const marker = visited.has(building) ? "[x]" : "[ ]";
        const className = visited.has(building) ? "visited" : "";
        return `<li class="${className}"><span>${marker}</span>${building}</li>`;
      }).join("");
    }
  }

  private handleProgressUpdated(progress: LocalProgress): void {
    this.progress = progress;
    this.render();
  }

  private setText(selector: string, text: string): void {
    const element = this.root?.querySelector(selector);

    if (element) {
      element.textContent = text;
    }
  }

  private cleanup(): void {
    this.game.events.off("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.root?.remove();
    this.root = undefined;
  }
}
