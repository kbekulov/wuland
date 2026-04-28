import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CLASS_METADATA,
  type LocalProgress,
  type PlayerProfile
} from "@wuland/shared";
import type { WulandConnectionState } from "./WulandScene.ts";

interface UISceneData {
  profile: PlayerProfile;
  progress: LocalProgress;
  connection?: WulandConnectionState;
}

export class UIScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private profile!: PlayerProfile;
  private progress!: LocalProgress;
  private helpOpen = false;
  private debugOpen = false;
  private connection: WulandConnectionState = {
    status: "connecting",
    message: "Connecting to WULAND server",
    totalPlayers: 0,
    onlinePlayers: 0,
    sleepingPlayers: 0,
    totalEnemies: 0,
    aliveEnemies: 0,
    localHp: 0,
    localMaxHp: 0,
    localShield: 0,
    defeated: false,
    specialCooldownUntil: 0,
    specialName: ""
  };

  constructor() {
    super("UIScene");
  }

  create(data: UISceneData): void {
    this.profile = data.profile;
    this.progress = data.progress;
    this.connection = data.connection ?? this.connection;
    this.mount();
    this.render();

    this.game.events.on("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.game.events.on("wuland:connectionUpdated", this.handleConnectionUpdated, this);
    this.game.events.on("wuland:toggleHelp", this.toggleHelp, this);
    this.game.events.on("wuland:toggleDebug", this.toggleDebug, this);
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
          <div class="hud-meter">
            <span class="eyebrow">Special</span>
            <strong data-hud-special></strong>
            <span class="meter-track special"><span data-hud-special-fill></span></span>
          </div>
        </div>
        <div class="hud-hint">J attack | click enemy | K / Space special</div>
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
      <section class="help-overlay" data-help-overlay>
        <div>
          <button type="button" class="secondary small" data-action="close-help">Close</button>
          <h2>Controls</h2>
          <p>WASD / arrows move. Click or tap the map to move there. Click or tap an enemy to attack.</p>
          <p>J attacks. K or Space uses your special. On phones, use the D-pad plus Attack and Special buttons.</p>
          <p>F3 toggles the debug line. Sleeping players stay visible but do not fight.</p>
        </div>
      </section>
    `;
    uiRoot.appendChild(this.root);

    this.root
      .querySelector('[data-action="edit-character"]')
      ?.addEventListener("click", () => {
        this.game.events.emit("wuland:editCharacter");
      });
    this.root
      .querySelector('[data-action="help"]')
      ?.addEventListener("click", () => this.toggleHelp());
    this.root
      .querySelector('[data-action="close-help"]')
      ?.addEventListener("click", () => this.toggleHelp(false));
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
    this.setText("[data-hud-connection]", this.connection.message);
    this.setText("[data-hud-total]", String(this.connection.totalPlayers));
    this.setText("[data-hud-online]", String(this.connection.onlinePlayers));
    this.setText("[data-hud-sleeping]", String(this.connection.sleepingPlayers));
    this.setText(
      "[data-hud-hp]",
      `${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated ? " respawning" : ""}`
    );
    this.setText("[data-hud-special]", this.specialText());
    this.setText("[data-hud-enemies]", String(this.connection.totalEnemies));
    this.setText("[data-hud-alive-enemies]", String(this.connection.aliveEnemies));
    this.setText("[data-hud-shield]", String(this.connection.localShield));
    this.setMeter("[data-hud-hp-fill]", this.hpPercent());
    this.setMeter("[data-hud-special-fill]", this.specialPercent());
    this.root.dataset.connectionStatus = this.connection.status;
    this.root.dataset.helpOpen = String(this.helpOpen);
    this.root.dataset.debugOpen = String(this.debugOpen);

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

  private handleConnectionUpdated(connection: WulandConnectionState): void {
    this.connection = connection;
    this.render();
  }

  private toggleHelp(force?: boolean): void {
    this.helpOpen = force ?? !this.helpOpen;
    this.render();
  }

  private toggleDebug(): void {
    this.debugOpen = !this.debugOpen;
    this.render();
  }

  private setText(selector: string, text: string): void {
    const element = this.root?.querySelector(selector);

    if (element) {
      element.textContent = text;
    }
  }

  private setMeter(selector: string, value: number): void {
    const element = this.root?.querySelector<HTMLElement>(selector);

    if (element) {
      element.style.width = `${Math.round(value * 100)}%`;
    }
  }

  private hpPercent(): number {
    if (this.connection.localMaxHp <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(1, this.connection.localHp / this.connection.localMaxHp));
  }

  private specialPercent(): number {
    const remaining = this.connection.specialCooldownUntil - Date.now();

    if (remaining <= 0) {
      return 1;
    }

    return Math.max(0, Math.min(1, 1 - remaining / 10000));
  }

  private specialText(): string {
    const remaining = this.connection.specialCooldownUntil - Date.now();

    if (remaining <= 0) {
      return this.connection.specialName || "Ready";
    }

    return `${Math.ceil(remaining / 1000)}s`;
  }

  private cleanup(): void {
    this.game.events.off("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.game.events.off("wuland:connectionUpdated", this.handleConnectionUpdated, this);
    this.game.events.off("wuland:toggleHelp", this.toggleHelp, this);
    this.game.events.off("wuland:toggleDebug", this.toggleDebug, this);
    this.root?.remove();
    this.root = undefined;
  }
}
