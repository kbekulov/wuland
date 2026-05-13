import Phaser from "phaser";
import {
  BUILDING_NAMES,
  CHAT_HISTORY_LIMIT,
  CHAT_MAX_MESSAGE_LENGTH,
  CLASS_METADATA,
  FLASHLIGHT_ITEM_ID,
  FLASHLIGHT_MAX_CHARGE_MS,
  HOTBAR_SLOT_COUNT,
  ITEM_DEFINITIONS,
  LIGHT_STICK_ITEM_ID,
  WULAND_MAP_ID,
  WULAND_MERCHANT_STOCK,
  getMapDisplayName,
  isCakeItemDefinitionId,
  type ChatMessage,
  type InventorySlotState,
  type ItemDefinition,
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
      quantity: 0,
      chargeRemainingMs: 0
    })),
    selectedHotbarSlot: 0,
    money: 0,
    activeItemName: "No item",
    nearbyPickupName: "",
    nearMerchant: false,
    nearbyPortalId: "",
    portalPrompt: "",
    nearbyGiftPlayerName: "",
    nearbyPetNpcId: "",
    nearbyPetName: "",
    currentMapId: WULAND_MAP_ID,
    currentMapName: getMapDisplayName(WULAND_MAP_ID),
    totalDroppedItems: 0,
    godModeAvailable: false,
    godModeCodeRequired: false,
    godModeActive: false,
    serverProtocolVersion: 0,
    serverProtocolOk: false
  };
  private hotbarDrag?: { slotIndex: number; startX: number; startY: number; moved: boolean };
  private chatMessages: ChatMessage[] = [];
  private chatCollapsed = false;
  private godModeCode = "";
  private shopFeedback = "";
  private lastBuyIntent: { itemDefinitionId: ItemDefinitionId; sentAt: number } | null = null;
  private hotbarRenderKey = "";
  private merchantRenderKey = "";

  constructor() {
    super("UIScene");
  }

  create(data: UISceneData): void {
    this.profile = data.profile;
    this.progress = data.progress;
    this.connection = data.connection ?? this.connection;
    this.chatCollapsed = prefersTouchLayout() && !prefersPortraitTouchLayout();
    this.mount();
    this.render();

    this.game.events.on("wuland:progressUpdated", this.handleProgressUpdated, this);
    this.game.events.on("wuland:connectionUpdated", this.handleConnectionUpdated, this);
    this.game.events.on("wuland:toggleHelp", this.toggleHelp, this);
    this.game.events.on("wuland:toggleDebug", this.toggleDebug, this);
    this.game.events.on("wuland:openMerchantShop", this.openMerchantShop, this);
    this.game.events.on("wuland:chatHistory", this.handleChatHistory, this);
    this.game.events.on("wuland:chatMessage", this.handleChatMessage, this);
    this.game.events.on("wuland:chatCleared", this.handleChatCleared, this);
    this.game.events.on("wuland:shopFeedback", this.handleShopFeedback, this);
    this.game.events.on("wuland:focusChat", this.focusChatInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private mount(): void {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("WULAND UI root is missing.");
    }

    this.root = document.createElement("div");
    this.root.className = "wuland-hud";
    this.hotbarRenderKey = "";
    this.merchantRenderKey = "";
    this.root.innerHTML = `
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
          <input data-chat-input maxlength="${CHAT_MAX_MESSAGE_LENGTH}" autocomplete="off" placeholder="Enter to chat" />
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
      .querySelector('[data-action="god-mode"]')
      ?.addEventListener("click", () => this.toggleGodMode());
    this.root
      .querySelector('[data-action="clear-chat"]')
      ?.addEventListener("click", () => this.clearChatHistory());
    this.root
      .querySelector('[data-action="close-help"]')
      ?.addEventListener("click", () => this.toggleHelp(false));
    this.root
      .querySelector('[data-action="toggle-chat"]')
      ?.addEventListener("click", () => this.toggleChat());
    this.root
      .querySelector<HTMLFormElement>("[data-chat-form]")
      ?.addEventListener("submit", (event) => this.handleChatSubmit(event));
    this.root
      .querySelector<HTMLInputElement>("[data-chat-input]")
      ?.addEventListener("keydown", (event) => this.handleChatInputKeydown(event));
    this.root
      .querySelector('[data-action="close-shop"]')
      ?.addEventListener("click", () => this.openMerchantShop(false));
    this.root
      .querySelector("[data-merchant-stock]")
      ?.addEventListener("pointerup", (event) => this.handleShopBuyIntent(event));
    this.root
      .querySelector("[data-merchant-stock]")
      ?.addEventListener("click", (event) => this.handleShopBuyIntent(event));
    this.root
      .querySelector("[data-hotbar-slots]")
      ?.addEventListener("pointerdown", (event) => this.handleHotbarPointerDown(event as PointerEvent));
    window.addEventListener("pointermove", this.handleHotbarPointerMove);
    window.addEventListener("pointerup", this.handleHotbarPointerUp);
    window.addEventListener("keydown", this.handleWindowKeydown, true);
  }

  private render(): void {
    if (!this.root) {
      return;
    }

    const classMeta = CLASS_METADATA[this.profile.class];
    const visited = new Set(this.progress.visitedBuildings);
    const buildingList = this.root.querySelector("[data-hud-buildings]");

    this.setText("[data-hud-name]", this.profile.name);
    this.setText("[data-settings-name]", this.profile.name);
    this.setText(
      "[data-hud-class]",
      `${classMeta.iconText} ${classMeta.displayName} | ${classMeta.futureRole}`
    );
    this.setText("[data-hud-location]", this.connection.currentMapName);
    this.setText("[data-settings-location]", this.connection.currentMapName);
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
    this.setText(
      "[data-settings-hp]",
      `${this.connection.localHp}/${this.connection.localMaxHp}${this.connection.defeated ? " respawning" : ""}`
    );
    this.setText("[data-hud-active-item]", this.connection.activeItemName);
    this.setText("[data-settings-item]", this.connection.activeItemName);
    this.setText("[data-hud-money]", `${formatMoney(this.connection.money)} coins`);
    this.setText("[data-settings-money]", formatMoney(this.connection.money));
    this.setText("[data-settings-connection]", this.connection.message);
    this.setText(
      "[data-settings-counts]",
      `${this.connection.onlinePlayers} online | ${this.connection.sleepingPlayers} sleeping | ${this.connection.aliveEnemies}/${this.connection.totalEnemies} enemies active`
    );
    this.setText("[data-shop-money]", `${formatMoney(this.connection.money)} WULAND coins`);
    this.setText("[data-shop-feedback]", this.shopFeedback);
    this.setText("[data-hud-pickup-hint]", this.interactionHint());
    this.setText("[data-hud-enemies]", String(this.connection.totalEnemies));
    this.setText("[data-hud-alive-enemies]", String(this.connection.aliveEnemies));
    this.setText("[data-hud-shield]", String(this.connection.localShield));
    this.setMeter("[data-hud-hp-fill]", this.hpPercent());
    this.root.dataset.connectionStatus = this.connection.status;
    this.root.dataset.helpOpen = String(this.helpOpen);
    this.root.dataset.debugOpen = String(this.debugOpen);
    this.root.dataset.shopOpen = String(this.shopOpen);
    this.root.dataset.chatCollapsed = String(this.chatCollapsed);
    this.root.dataset.godModeActive = String(this.connection.godModeActive);
    this.root.dataset.touchLayout = String(prefersTouchLayout());
    this.setGodModeButton();
    this.setClearChatButton();
    this.setChatButton();
    this.renderHotbar();
    this.renderMerchantStock();
    this.renderChatMessages();

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
    if (force) {
      this.shopFeedback = "";
      this.merchantRenderKey = "";
    }
    this.render();
  }

  private toggleChat(force?: boolean): void {
    this.chatCollapsed = force ?? !this.chatCollapsed;
    if (this.chatCollapsed) {
      this.root?.querySelector<HTMLInputElement>("[data-chat-input]")?.blur();
    } else if (prefersTouchLayout()) {
      window.setTimeout(() => this.focusChatInput(), 0);
    }
    this.render();
  }

  private focusChatInput(): void {
    this.chatCollapsed = false;
    this.render();
    const input = this.root?.querySelector<HTMLInputElement>("[data-chat-input]");
    input?.focus();
  }

  private toggleGodMode(): void {
    if (!this.connection.godModeAvailable) {
      return;
    }

    const nextActive = !this.connection.godModeActive;

    if (nextActive && this.connection.godModeCodeRequired && !this.godModeCode) {
      const code = window.prompt("Enter God Mode code");

      if (!code) {
        return;
      }

      this.godModeCode = code;
    }

    this.game.events.emit("wuland:setGodMode", {
      active: nextActive,
      code: this.godModeCode
    });
  }

  private clearChatHistory(): void {
    if (!this.connection.godModeAvailable || !this.connection.godModeActive) {
      return;
    }

    if (this.connection.godModeCodeRequired && !this.godModeCode) {
      const code = window.prompt("Enter God Mode code");

      if (!code) {
        return;
      }

      this.godModeCode = code;
    }

    if (!window.confirm("Clear all persisted WULAND chat messages for every player?")) {
      return;
    }

    this.game.events.emit("wuland:clearChat", {
      code: this.godModeCode
    });
  }

  private setGodModeButton(): void {
    const button = this.root?.querySelector<HTMLButtonElement>('[data-action="god-mode"]');

    if (!button) {
      return;
    }

    button.disabled = !this.connection.godModeAvailable;
    button.textContent = this.connection.godModeActive ? "God: On" : "God Mode";
    button.title = this.connection.godModeActive
      ? "God Mode: click a dropped item to delete it, or another player to delete their account."
      : "Prototype admin cleanup tool.";
  }

  private setClearChatButton(): void {
    const button = this.root?.querySelector<HTMLButtonElement>('[data-action="clear-chat"]');

    if (!button) {
      return;
    }

    button.disabled = !this.connection.godModeAvailable || !this.connection.godModeActive;
    button.title = this.connection.godModeActive
      ? "Clear persisted chat messages for everyone."
      : "Turn on God Mode to clear chat.";
  }

  private setChatButton(): void {
    const button = this.root?.querySelector<HTMLButtonElement>('[data-action="toggle-chat"]');

    if (button) {
      button.textContent = this.chatCollapsed ? "Open" : "Min";
    }
  }

  private handleChatMessage(message: ChatMessage): void {
    this.chatMessages = mergeChatMessages(this.chatMessages, [message]);
    this.render();
  }

  private handleChatHistory(messages: ChatMessage[]): void {
    this.chatMessages = mergeChatMessages(this.chatMessages, messages);
    this.render();
  }

  private handleChatCleared(): void {
    this.chatMessages = [];
    this.render();
  }

  private handleShopFeedback(message: string): void {
    this.shopFeedback = message;
    this.render();
  }

  private handleChatSubmit(event: Event): void {
    event.preventDefault();
    const input = this.root?.querySelector<HTMLInputElement>("[data-chat-input]");
    const text = input?.value.trim() ?? "";

    if (!input) {
      return;
    }

    if (text.length === 0) {
      input.blur();
      return;
    }

    this.game.events.emit("wuland:sendChat", {
      text: text.slice(0, CHAT_MAX_MESSAGE_LENGTH)
    });
    input.value = "";
    input.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.render();
  }

  private handleChatInputKeydown(event: KeyboardEvent): void {
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      this.root?.querySelector<HTMLInputElement>("[data-chat-input]")?.blur();
    }
  }

  private readonly handleWindowKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== "Escape") {
      return;
    }

    const input = this.root?.querySelector<HTMLInputElement>("[data-chat-input]");

    if (!input) {
      return;
    }

    if (event.key === "Escape" && document.activeElement === input) {
      event.preventDefault();
      event.stopPropagation();
      input.blur();
      return;
    }

    if (event.key === "Enter" && document.activeElement !== input) {
      event.preventDefault();
      event.stopPropagation();
      this.chatCollapsed = false;
      this.render();
      input.focus();
    }
  };

  private interactionHint(): string {
    const hints: string[] = [];

    if (this.connection.nearMerchant) {
      hints.push(prefersTouchLayout() ? "Interact: shop" : "F: shop");
    } else if (this.connection.portalPrompt) {
      hints.push(prefersTouchLayout() ? touchPortalPrompt(this.connection.portalPrompt) : this.connection.portalPrompt);
    } else if (this.connection.nearbyPickupName) {
      hints.push(prefersTouchLayout() ? `Interact: pick up ${this.connection.nearbyPickupName}` : `F: pick up ${this.connection.nearbyPickupName}`);
    }

    if (this.connection.nearbyGiftPlayerName) {
      hints.push(prefersTouchLayout() ? `Gift: ${this.connection.nearbyGiftPlayerName}` : `G: gift to ${this.connection.nearbyGiftPlayerName}`);
    }

    if (this.connection.nearbyPetName) {
      hints.push(prefersTouchLayout() ? `Pet: ${this.connection.nearbyPetName}` : `F: pet ${this.connection.nearbyPetName}`);
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

    const renderKey = this.connection.inventory.map((slot) =>
      `${slot.slotIndex}:${slot.itemDefinitionId}:${slot.itemInstanceId}:${slot.quantity}`
    ).join("|") + `|selected:${this.connection.selectedHotbarSlot}`;

    if (renderKey === this.hotbarRenderKey) {
      this.updateHotbarChargeBars();
      return;
    }

    this.hotbarRenderKey = renderKey;

    slots.innerHTML = this.connection.inventory.map((slot) => {
      const definition = slot.itemDefinitionId ? ITEM_DEFINITIONS[slot.itemDefinitionId] : null;
      const selected = slot.slotIndex === this.connection.selectedHotbarSlot;
      const count = definition?.stackable && slot.quantity > 1 ? `<span class="hotbar-count">${slot.quantity}</span>` : "";
      const charge = flashlightChargeMarkup(slot);
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
          ${itemIconMarkup(definition)}
          <small>${definition?.displayName ?? "Empty"}</small>
          ${count}
          ${charge}
        </button>
      `;
    }).join("");
    this.updateHotbarChargeBars();
  }

  private renderMerchantStock(): void {
    const stock = this.root?.querySelector("[data-merchant-stock]");

    if (!stock) {
      return;
    }

    if (!this.shopOpen) {
      return;
    }

    const renderKey = [
      this.connection.money,
      ...this.connection.inventory.map((slot) =>
        `${slot.slotIndex}:${slot.itemDefinitionId}:${slot.itemInstanceId}:${slot.quantity}`
      )
    ].join("|");

    if (renderKey === this.merchantRenderKey) {
      return;
    }

    const previousScrollTop = stock.scrollTop;
    this.merchantRenderKey = renderKey;
    stock.innerHTML = WULAND_MERCHANT_STOCK.map((stockItem) => {
      const definition = ITEM_DEFINITIONS[stockItem.itemDefinitionId];
      const canFit = canFitInventoryItem(this.connection.inventory, stockItem.itemDefinitionId);
      const canAfford = this.connection.money >= stockItem.price;
      const disabledReason = !canFit
        ? "Inventory full"
        : !canAfford
          ? "Need more coins"
          : "";
      return `
        <article class="merchant-item${disabledReason ? " blocked" : ""}">
          <span class="merchant-icon">${itemIconMarkup(definition)}</span>
          <div>
            <h3>${definition.displayName}</h3>
            <span>${definition.itemType} | ${stockItem.priceLabel}</span>
            <p>${definition.description}</p>
          </div>
          <button
            type="button"
            class="primary small"
            data-buy-item="${definition.itemDefinitionId}"
            ${disabledReason ? "disabled" : ""}
            title="${disabledReason || `Buy ${definition.displayName}`}"
          >${disabledReason || "Buy"}</button>
        </article>
      `;
    }).join("");
    stock.scrollTop = previousScrollTop;
  }

  private updateHotbarChargeBars(): void {
    const slots = this.root?.querySelector("[data-hotbar-slots]");

    if (!slots) {
      return;
    }

    this.connection.inventory.forEach((slot) => {
      const chargeBar = slots.querySelector<HTMLElement>(
        `[data-hotbar-slot="${slot.slotIndex}"] .hotbar-charge i`
      );

      if (!chargeBar) {
        return;
      }

      const percent = slot.itemDefinitionId === FLASHLIGHT_ITEM_ID
        ? Math.max(0, Math.min(1, (slot.chargeRemainingMs ?? 0) / FLASHLIGHT_MAX_CHARGE_MS))
        : 0;
      chargeBar.style.width = `${Math.round(percent * 100)}%`;
    });
  }

  private renderChatMessages(): void {
    const list = this.root?.querySelector("[data-chat-messages]");

    if (!list) {
      return;
    }

    list.innerHTML = this.chatMessages.map((message) => {
      const mapName = message.mapId === this.connection.currentMapId
        ? ""
        : `<span class="chat-map">[${escapeHtml(getMapDisplayName(message.mapId))}]</span>`;
      return `
        <p>
          ${mapName}
          <strong>${escapeHtml(message.playerName)}</strong>
          <span>${escapeHtml(message.text)}</span>
        </p>
      `;
    }).join("");
    list.scrollTop = list.scrollHeight;
  }

  private handleShopBuyIntent(event: Event): void {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-buy-item]");
    const itemDefinitionId = target?.dataset.buyItem as ItemDefinitionId | undefined;

    if (target) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!itemDefinitionId || !(itemDefinitionId in ITEM_DEFINITIONS)) {
      return;
    }

    if (target?.disabled) {
      return;
    }

    const now = Date.now();
    if (
      this.lastBuyIntent?.itemDefinitionId === itemDefinitionId &&
      now - this.lastBuyIntent.sentAt < 350
    ) {
      return;
    }

    this.lastBuyIntent = { itemDefinitionId, sentAt: now };
    this.shopFeedback = `Buying ${ITEM_DEFINITIONS[itemDefinitionId].displayName}...`;
    this.render();
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
    this.game.events.off("wuland:chatHistory", this.handleChatHistory, this);
    this.game.events.off("wuland:chatMessage", this.handleChatMessage, this);
    this.game.events.off("wuland:chatCleared", this.handleChatCleared, this);
    this.game.events.off("wuland:shopFeedback", this.handleShopFeedback, this);
    this.game.events.off("wuland:focusChat", this.focusChatInput, this);
    window.removeEventListener("pointermove", this.handleHotbarPointerMove);
    window.removeEventListener("pointerup", this.handleHotbarPointerUp);
    window.removeEventListener("keydown", this.handleWindowKeydown, true);
    this.root?.remove();
    this.root = undefined;
  }
}

const mergeChatMessages = (
  current: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();

  [...current, ...incoming].forEach((message) => {
    byId.set(message.messageId, message);
  });

  return [...byId.values()]
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))
    .slice(-CHAT_HISTORY_LIMIT);
};

const canFitInventoryItem = (
  inventory: InventorySlotState[],
  itemDefinitionId: ItemDefinitionId
): boolean => {
  const definition = ITEM_DEFINITIONS[itemDefinitionId];

  if (definition.stackable) {
    const stackSlot = inventory.find((slot) =>
      slot.itemDefinitionId === itemDefinitionId &&
      slot.quantity > 0 &&
      slot.quantity < definition.maxStack
    );

    if (stackSlot) {
      return true;
    }
  }

  return inventory.some((slot) => !slot.itemDefinitionId || slot.quantity <= 0);
};

const formatMoney = (value: number): string =>
  Math.max(0, Math.floor(value)).toLocaleString("en-US");

const flashlightChargeMarkup = (slot: InventorySlotState): string => {
  if (slot.itemDefinitionId !== FLASHLIGHT_ITEM_ID) {
    return "";
  }

  const percent = Math.max(0, Math.min(1, (slot.chargeRemainingMs ?? 0) / FLASHLIGHT_MAX_CHARGE_MS));

  return `
    <span class="hotbar-charge" aria-label="Flashlight charge">
      <i style="width: ${Math.round(percent * 100)}%"></i>
    </span>
  `;
};

const prefersTouchLayout = (): boolean =>
  window.matchMedia("(pointer: coarse)").matches ||
  window.innerWidth <= 860;

const prefersPortraitTouchLayout = (): boolean =>
  prefersTouchLayout() &&
  window.matchMedia("(orientation: portrait)").matches;

const touchPortalPrompt = (prompt: string): string =>
  prompt.replace(/^Press F to /, "Interact: ");

const itemIconMarkup = (
  definition: ItemDefinition | null
): string => {
  if (!definition) {
    return `<strong class="item-icon-fallback"></strong>`;
  }

  if (!definition.iconAsset) {
    return `<strong class="item-icon-fallback">${escapeHtml(definition.iconText)}</strong>`;
  }

  return `
    <img
      class="item-icon-image"
      src="${escapeAttribute(definition.iconAsset)}"
      alt=""
      loading="eager"
      decoding="async"
      draggable="false"
    />
  `;
};

const tooltipActionForItem = (itemDefinitionId: ItemDefinitionId): string => {
  const definition = ITEM_DEFINITIONS[itemDefinitionId];

  if (itemDefinitionId === "flashlight") {
    return "Select it in The Cave to light the way.";
  }

  if (itemDefinitionId === LIGHT_STICK_ITEM_ID) {
    return "Drag out of the hotbar to drop and light the cave.";
  }

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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
