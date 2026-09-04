import * as stylex from "@stylexjs/stylex";
import { useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  animationSpeeds,
  type AnimationSpeed,
  type AnimationSpeedController,
} from "./animation-speed";

const speedOptions = animationSpeeds.map((speed) => ({
  label: `${speed}x`,
  value: speed,
}));

export function AnimationSpeedSelect({ controller }: { controller: AnimationSpeedController }) {
  const speed = useSyncExternalStore(
    controller.subscribe,
    controller.getSpeed,
    controller.getSpeed,
  );

  return (
    <div {...stylex.props(styles.root)} data-window-no-drag>
      <Select<AnimationSpeed>
        items={speedOptions}
        value={speed}
        onValueChange={(nextSpeed) => {
          if (nextSpeed !== null) controller.setSpeed(nextSpeed);
        }}
      >
        <SelectTrigger aria-label="Animation playback speed" title="Animation playback speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false} side="top">
          {speedOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const styles = stylex.create({
  root: {
    position: "fixed",
    zIndex: 30,
    left: "18px",
    bottom: "22px",
  },
});
