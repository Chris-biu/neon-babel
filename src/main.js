// ═══════════════════════════════════════════════════════
// 不夜塔 · Neon Babel — 主入口（WASD 可操控探索版）
// ═══════════════════════════════════════════════════════
import './style.css';
import { createApp, scene, layout } from './scene/app.js';
import { buildSky, buildCity, tickSky, redraw as redrawSky } from './scene/sky.js';
import { buildRain, tickRain } from './scene/rain.js';
import { buildInterior } from './scene/interior.js';
import { spawnPlayer, tickPlayer } from './game/player.js';
import { RESIDENTS } from './data/residents.js';
import { GATEKEEPER, VENDORS } from './data/world.js';
import { startEngine, tickEngine } from './sim/engine.js';
import { initHud, toast } from './ui/hud.js';
import { initGate } from './ui/gate.js';
import { initDialog } from './ui/dialog.js';
import { initPanels } from './ui/panels.js';
import { initRoom } from './ui/room.js';
import { initMail } from './ui/mail.js';
import { initArcade } from './games/arcade.js';
import { armAudioOnce } from './core/audio.js';
import { isNewPlayer } from './core/state.js';
import { bus } from './core/bus.js';

let worldStarted = false;

async function main() {
  console.log('[nb] boot start');
  const app = await createApp();
  console.log('[nb] pixi ready');
  window.__nb = { app, scene, bus };

  // 场景
  scene.layers.sky.addChild(buildSky());
  scene.layers.far.addChild(buildCity());
  const interiorApi = buildInterior(scene.layers.world, {
    residents: RESIDENTS,
    vendors: VENDORS,
    gatekeeper: GATEKEEPER,
  });
  scene.totalH = interiorApi.totalH;
  scene.worldW = interiorApi.IW;
  layout();
  buildRain(scene.layers.fx);
  window.__nb.towerApi = interiorApi;

  // 主循环
  app.ticker.add(t => {
    tickSky(t.deltaMS);
    tickRain(t.deltaMS);
    interiorApi.tick(t.deltaMS);
    if (worldStarted) {
      tickEngine(t.deltaMS);
      tickPlayer(t.deltaMS);
    }
  });
  setInterval(redrawSky, 60000);
  window.addEventListener('resize', redrawSky);

  // UI
  initPanels();
  initRoom();
  initMail();
  initDialog(interiorApi);
  initArcade();
  initGate(() => startWorld(interiorApi));
  armAudioOnce();
}

function startWorld(interiorApi) {
  if (worldStarted) return;
  worldStarted = true;
  initHud(interiorApi);
  startEngine(interiorApi);
  spawnPlayer(scene.layers.world, interiorApi, 'lobby');
  setTimeout(() => {
    toast('🎮 A/D 或 ←/→ 走路 · 走进电梯按 W/S 上下楼 · 靠近发光处按 E 互动');
    if (!isNewPlayer()) toast('🌧 欢迎回塔。今晚也没人睡得着。');
  }, 1500);
}

main().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="color:#dfe4f5;font-family:sans-serif;padding:40px;text-align:center">
    <h2>不夜塔暂时停电了</h2><p style="color:#8b93b8">${String(err?.message || err)}</p></div>`;
});
