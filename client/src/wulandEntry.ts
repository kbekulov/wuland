import type Phaser from "phaser";
import "./styles/main.css";

const startWuland = async (): Promise<void> => {
  const [
    phaserModule,
    { BootScene },
    { CharacterSelectScene },
    { UIScene },
    { WulandScene }
  ] = await Promise.all([
    import("phaser"),
    import("./game/scenes/BootScene.ts"),
    import("./game/scenes/CharacterSelectScene.ts"),
    import("./game/scenes/UIScene.ts"),
    import("./game/scenes/WulandScene.ts")
  ]);

  const PhaserRuntime = phaserModule.default;
  const config: Phaser.Types.Core.GameConfig = {
    type: PhaserRuntime.AUTO,
    parent: "game-root",
    width: 960,
    height: 640,
    backgroundColor: "#182b2d",
    pixelArt: true,
    roundPixels: true,
    physics: {
      default: "arcade",
      arcade: {
        debug: false,
        gravity: { x: 0, y: 0 }
      }
    },
    scale: {
      mode: PhaserRuntime.Scale.FIT,
      autoCenter: PhaserRuntime.Scale.CENTER_BOTH
    },
    dom: {
      createContainer: true
    },
    scene: [BootScene, CharacterSelectScene, WulandScene, UIScene]
  };

  new PhaserRuntime.Game(config);
};

startWuland().catch((error: unknown) => {
  console.error("Failed to start WULAND", error);

  const uiRoot = document.getElementById("ui-root");

  if (uiRoot) {
    uiRoot.innerHTML = `
      <div class="startup-error">
        <strong>WULAND could not start.</strong>
        <span>${error instanceof Error ? error.message : "Unknown startup error"}</span>
      </div>
    `;
  }
});
