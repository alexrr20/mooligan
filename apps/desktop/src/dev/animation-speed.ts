export const animationSpeeds = [1, 0.5, 0.2] as const;

export type AnimationSpeed = (typeof animationSpeeds)[number];

type PlaybackAnimation = Pick<Animation, "playbackRate" | "updatePlaybackRate">;

export interface AnimationSpeedController {
  getSpeed: () => AnimationSpeed;
  refresh: () => void;
  register: (animation: PlaybackAnimation) => void;
  setSpeed: (speed: AnimationSpeed) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  var __mooliganAnimationSpeedController: AnimationSpeedController | undefined;
}

export function createAnimationSpeedController(
  getAnimations: () => readonly PlaybackAnimation[],
): AnimationSpeedController {
  const basePlaybackRates = new WeakMap<PlaybackAnimation, number>();
  const listeners = new Set<() => void>();
  let speed: AnimationSpeed = 1;

  function register(animation: PlaybackAnimation) {
    let basePlaybackRate = basePlaybackRates.get(animation);

    if (basePlaybackRate === undefined) {
      basePlaybackRate = animation.playbackRate;
      basePlaybackRates.set(animation, basePlaybackRate);
    }

    animation.updatePlaybackRate(basePlaybackRate * speed);
  }

  function refresh() {
    for (const animation of getAnimations()) register(animation);
  }

  return {
    getSpeed: () => speed,
    refresh,
    register,
    setSpeed(nextSpeed) {
      if (nextSpeed === speed) return;

      speed = nextSpeed;
      refresh();
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function installAnimationSpeedController(): AnimationSpeedController {
  globalThis.__mooliganAnimationSpeedController ??= createBrowserAnimationSpeedController();
  return globalThis.__mooliganAnimationSpeedController;
}

function createBrowserAnimationSpeedController() {
  const controller = createAnimationSpeedController(() => document.getAnimations());
  // oxlint-disable-next-line typescript/unbound-method -- The wrapper restores the element receiver.
  const nativeAnimate = Element.prototype.animate;

  Element.prototype.animate = function (
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: KeyframeAnimationOptions | number,
  ) {
    const animation = nativeAnimate.call(this, keyframes, options);
    controller.register(animation);
    return animation;
  };

  const refreshAfterCssAnimationStarts = () => queueMicrotask(controller.refresh);
  document.addEventListener("animationstart", refreshAfterCssAnimationStarts, true);
  document.addEventListener("transitionrun", refreshAfterCssAnimationStarts, true);
  monitorAnimationsWhileSlowed(controller);
  controller.refresh();

  return controller;
}

function monitorAnimationsWhileSlowed(controller: AnimationSpeedController) {
  let scheduledFrame: number | undefined;

  const scan = () => {
    scheduledFrame = undefined;
    if (controller.getSpeed() === 1) return;

    controller.refresh();
    scheduledFrame = requestAnimationFrame(scan);
  };

  controller.subscribe(() => {
    if (controller.getSpeed() !== 1 && scheduledFrame === undefined) {
      scheduledFrame = requestAnimationFrame(scan);
    }
  });
}
