// State machine: the single owner of the game's current state. Every state change is broadcast
// to subscribers, and each subsystem (UI, audio, the main loop) reacts to that one event — which
// keeps the 3D world, the interface and the audio from ever going out of sync.

// The six game states.
export const STATE = {
    MAIN_MENU: 'MAIN_MENU',
    CHARACTER_SELECTION: 'CHARACTER_SELECTION',
    WAVE_PLAYING: 'WAVE_PLAYING',
    POWERUP_DRAFT: 'POWERUP_DRAFT',
    PAUSE_MENU: 'PAUSE_MENU',
    GAME_OVER: 'GAME_OVER',
};

// The current state — the single source of truth.
let state = STATE.MAIN_MENU;

// Subscribers receive (nextState, previousState) on every real change.
const listeners = [];

// Registers a state listener. Returns an unsubscribe function (currently unused, but keeps the
// API honest for future UI teardown).
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

// Moves to `next`. A no-op when the state is unchanged, so subsystems never re-run their
// enter-state work (audio restarts, UI flashes) on redundant calls.
export function setState(next) {
    if (next === state) return;
    const previous = state;
    state = next;
    for (const callback of listeners) callback(next, previous);
}
