export const STATE = {
  MAIN_MENU: "MAIN_MENU",
  CHARACTER_SELECTION: "CHARACTER_SELECTION",
  WAVE_PLAYING: "WAVE_PLAYING",
  POWERUP_DRAFT: "POWERUP_DRAFT",
  PAUSE_MENU: "PAUSE_MENU",
  GAME_OVER: "GAME_OVER",
};

let state = STATE.MAIN_MENU;

const listeners = [];

export function onStateChange(callback) {
  listeners.push(callback);
  return () => {
    const index = listeners.indexOf(callback);
    if (index !== -1) listeners.splice(index, 1);
  };
}

export function getState() {
  return state;
}

export function setState(next) {
  if (next === state) return;
  const previous = state;
  state = next;
  for (const callback of listeners) callback(next, previous);
}
