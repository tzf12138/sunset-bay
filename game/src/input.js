// Keyboard and mouse input. Held keys give movement; one-shot presses (enter a car,
// punch, reload, pause, confirm, mute, retry) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_ENTER = 1;
export const ACTION_MELEE = 2;
export const ACTION_RELOAD = 4;
export const ACTION_PAUSE = 8;
export const ACTION_CONFIRM = 16;
export const ACTION_MUTE = 32;
export const ACTION_RETRY = 64;
export const ACTION_UP = 128;
export const ACTION_DOWN = 256;

const MOVE = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
};

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if ([...MOVE.up, ...MOVE.down, ...MOVE.left, ...MOVE.right].includes(event.code)) event.preventDefault();
      return;
    }
    held.add(event.code);
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_MELEE;
    else if (event.code === 'KeyR') actions |= ACTION_RELOAD | ACTION_RETRY;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'ArrowUp' || event.code === 'KeyW') actions |= ACTION_UP;
    else if (event.code === 'ArrowDown' || event.code === 'KeyS') actions |= ACTION_DOWN;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.down = true;
    mouse.clicked = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  const has = (set) => {
    for (const code of set) if (held.has(code)) return true;
    return false;
  };

  return {
    mouse,
    /** Held movement keys, as booleans. */
    move() {
      return {
        up: has(MOVE.up),
        down: has(MOVE.down),
        left: has(MOVE.left),
        right: has(MOVE.right),
        run: held.has('ShiftLeft') || held.has('ShiftRight'),
        handbrake: held.has('Space'),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const c = mouse.clicked;
      mouse.clicked = false;
      return c;
    },
  };
}
