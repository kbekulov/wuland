import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CLASS_METADATA,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  WULAND_MERCHANT_STOCK,
  isCakeItemDefinitionId,
  type InventorySlotState,
  type ItemDefinitionId,
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
  private shopOpen = false;
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
    inventory: Array.from({ length: HOTBAR_SLOT_COUNT }, (_value, slotIndex) => ({
      slotIndex,
      itemDefinitionId: "",
      itemInstanceId: "",
      quantity: 0
    })),
    selectedHotbarSlot: 0,
    activeItemName: "No item",
    nearbyPickupName: "",
    nearMerchant: false,
    nearbyGiftPlayerName: "",
    totalDroppedItems: 0
  };
  private hotbarDrag?: { slotIndex: number; startX: number; startY: number; moved: boolean };

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
    this.game.events.on("wuland:openMerchantShop", this.openMerchantShop, this);
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
    this.root
      .querySelector('[data-action="close-shop"]')
      ?.addEventListener("click", () => this.openMerchantShop(false));
    this.root
      .querySelector("[data-merchant-stock]")
      ?.addEventListener("click", (event) => this.handleShopClick(event));
    this.root
      .querySelector("[data-hotbar-slots]")
      ?.addEventListener("pointerdown", (event) => this.handleHotbarPointerDown(event as PointerEvent));
    window.addEventListener("pointermove", this.handleHotbarPointerMove);
    window.addEventListener("pointerup", this.handleHotbarPointerUp);
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
    this.setText("[data-hud-active-item]", this.connection.activeItemName);
    this.setText("[data-hud-pickup-hint]", this.interactionHint());
    this.setText("[data-hud-enemies]", String(this.connection.totalEnemies));
    this.setText("[data-hud-alive-enemies]", String(this.connection.aliveEnemies));
    this.setText("[data-hud-shield]", String(this.connection.localShield));
    this.setMeter("[data-hud-hp-fill]", this.hpPercent());
    this.root.dataset.connectionStatus = this.connection.status;
    this.root.dataset.helpOpen = String(this.helpOpen);
    this.root.dataset.debugOpen = String(this.debugOpen);
    this.root.dataset.shopOpen = String(this.shopOpen);
    this.renderHotbar();
    this.renderMerchantStock();

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

  private openMerchantShop(force = true): void {
    this.shopOpen = force;
    this.render();
  }

  private interactionHint(): string {
    const hints: string[] = [];

    if (this.connection.nearMerchant) {
      hints.push("F: shop");
    } else if (this.connection.nearbyPickupName) {
      hints.push(`F: pick up ${this.connection.nearbyPickupName}`);
    }

    if (this.connection.nearbyGiftPlayerName) {
      hints.push(`G: gift to ${this.connection.nearbyGiftPlayerName}`);
    }

    return hints.join(" | ");
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

  private renderHotbar(): void {
    const slots = this.root?.querySelector("[data-hotbar-slots]");

    if (!slots) {
      return;
    }

    slots.innerHTML = this.connection.inventory.map((slot) => {
      const definition = slot.itemDefinitionId ? ITEM_DEFINITIONS[slot.itemDefinitionId] : null;
      const selected = slot.slotIndex === this.connection.selectedHotbarSlot;
      const count = definition?.stackable && slot.quantity > 1 ? `<span class="hotbar-count">${slot.quantity}</span>` : "";
      const tooltip = definition
        ? `${definition.displayName} (${definition.itemType}): ${definition.description} ${tooltipActionForItem(definition.itemDefinitionId)}`
        : `Empty slot ${slot.slotIndex + 1}`;
      return `
        <button
          type="button"
          class="hotbar-slot${selected ? " selected" : ""}"
          data-hotbar-slot="${slot.slotIndex}"
          title="${escapeAttribute(tooltip)}"
        >
          <span class="hotbar-number">${slot.slotIndex + 1}</span>
          <strong>${definition?.iconText ?? ""}</strong>
          <small>${definition?.displayName ?? "Empty"}</small>
          ${count}
        </button>
      `;
    }).join("");
  }

  private renderMerchantStock(): void {
    const stock = this.root?.querySelector("[data-merchant-stock]");

    if (!stock) {
      return;
    }

    stock.innerHTML = WULAND_MERCHANT_STOCK.map((stockItem) => {
      const definition = ITEM_DEFINITIONS[stockItem.itemDefinitionId];
      return `
        <article class="merchant-item">
          <strong class="merchant-icon">${definition.iconText}</strong>
          <div>
            <h3>${definition.displayName}</h3>
            <span>${definition.itemType} | ${stockItem.priceLabel}</span>
            <p>${definition.description}</p>
          </div>
          <button type="button" class="primary small" data-buy-item="${definition.itemDefinitionId}">Buy</button>
        </article>
      `;
    }).join("");
  }

  private handleShopClick(event: Event): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-buy-item]");
    const itemDefinitionId = target?.dataset.buyItem as ItemDefinitionId | undefined;

    if (!itemDefinitionId || !(itemDefinitionId in ITEM_DEFINITIONS)) {
      return;
    }

    this.game.events.emit("wuland:buyMerchantItem", itemDefinitionId);
  }

  private readonly handleHotbarPointerMove = (event: PointerEvent): void => {
    if (!this.hotbarDrag) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - this.hotbarDrag.startX,
      event.clientY - this.hotbarDrag.startY
    );
    this.hotbarDrag.moved = this.hotbarDrag.moved || distance > 8;
  };

  private readonly handleHotbarPointerUp = (event: PointerEvent): void => {
    const drag = this.hotbarDrag;

    if (!drag) {
      return;
    }

    this.hotbarDrag = undefined;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-hotbar-slot]");

    if (!drag.moved) {
      this.game.events.emit("wuland:selectHotbarSlot", drag.slotIndex);
      return;
    }

    if (!target) {
      this.game.events.emit("wuland:discardHotbarItem", drag.slotIndex);
      return;
    }

    const toSlotIndex = Number.parseInt(target.dataset.hotbarSlot ?? "", 10);

    if (Number.isInteger(toSlotIndex)) {
      this.game.events.emit("wuland:moveHotbarItem", {
        fromSlotIndex: drag.slotIndex,
        toSlotIndex
      });
    }
  };

  private handleHotbarPointerDown(event: PointerEvent): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-hotbar-slot]");

    if (!target) {
      return;
    }

    event.preventDefault();
    const slotIndex = Number.parseInt(target.dataset.hotbarSlot ?? "", 10);

    if (!Number.isInteger(slotIndex)) {
      return;
    }

    this.hotbarDrag = {
      slotIndex,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
  }

  private cleanup(): void {
    this.game.events.off("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.game.events.off("wuland:connectionUpdated", this.handleConnectionUpdated, this);
    this.game.events.off("wuland:toggleHelp", this.toggleHelp, this);
    this.game.events.off("wuland:toggleDebug", this.toggleDebug, this);
    this.game.events.off("wuland:openMerchantShop", this.openMerchantShop, this);
    window.removeEventListener("pointermove", this.handleHotbarPointerMove);
    window.removeEventListener("pointerup", this.handleHotbarPointerUp);
    this.root?.remove();
    this.root = undefined;
  }
}

const tooltipActionForItem = (itemDefinitionId: ItemDefinitionId): string => {
  const definition = ITEM_DEFINITIONS[itemDefinitionId];

  if (definition.itemType === "weapon") {
    return "Press Space to attack.";
  }

  if (isCakeItemDefinitionId(itemDefinitionId)) {
    return "Press E to eat. Press G near another player to gift.";
  }

  if (definition.itemType === "consumable") {
    return "Press E to use.";
  }

  return "";
};

const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
