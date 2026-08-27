import { Select } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import { useSyncExternalStore } from "react";

import { colors } from "../styles/tokens.stylex.js";
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
      <Select.Root<AnimationSpeed>
        items={speedOptions}
        value={speed}
        onValueChange={(nextSpeed) => {
          if (nextSpeed !== null) controller.setSpeed(nextSpeed);
        }}
      >
        <Select.Trigger
          {...stylex.props(styles.trigger, speed !== 1 && styles.triggerSlowed)}
          aria-label="Animation playback speed"
          title="Animation playback speed"
        >
          <span {...stylex.props(styles.status)} aria-hidden="true" />
          <Select.Value />
          <Select.Icon {...stylex.props(styles.icon)} aria-hidden="true">
            ▴
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            {...stylex.props(styles.positioner)}
            align="start"
            alignItemWithTrigger={false}
            side="top"
            sideOffset={6}
          >
            <Select.Popup {...stylex.props(styles.popup)}>
              <Select.List {...stylex.props(styles.list)}>
                {speedOptions.map((option) => (
                  <Select.Item
                    {...stylex.props(styles.item)}
                    key={option.value}
                    value={option.value}
                  >
                    <span {...stylex.props(styles.indicatorSlot)}>
                      <Select.ItemIndicator {...stylex.props(styles.indicator)}>
                        ●
                      </Select.ItemIndicator>
                    </span>
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
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
  trigger: {
    width: "66px",
    height: "30px",
    padding: "0 8px",
    display: "grid",
    gridTemplateColumns: "5px 1fr 8px",
    alignItems: "center",
    gap: "6px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#474a42",
    borderRadius: "7px",
    color: "#aeb1a6",
    backgroundColor: "rgba(20, 21, 18, 0.92)",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
    backdropFilter: "blur(14px)",
    fontSize: "9px",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.04em",
    cursor: "pointer",
    outline: "none",
    ":hover": {
      color: "#f4f1e8",
      borderColor: "#62665b",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "2px",
    },
  },
  triggerSlowed: {
    color: "#f4f1e8",
    borderColor: "#657167",
  },
  status: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
    boxShadow: "0 0 0 2px rgba(17, 197, 101, 0.12)",
  },
  icon: {
    color: "#74786e",
    fontSize: "7px",
    lineHeight: 1,
  },
  positioner: {
    zIndex: 31,
  },
  popup: {
    minWidth: "66px",
    padding: "4px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#474a42",
    borderRadius: "7px",
    color: "#b8baaf",
    backgroundColor: "#151613",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.48)",
    outline: "none",
  },
  list: {
    display: "grid",
    gap: "1px",
    outline: "none",
  },
  item: {
    minHeight: "26px",
    padding: "0 7px",
    display: "grid",
    gridTemplateColumns: "8px 1fr",
    alignItems: "center",
    gap: "6px",
    borderRadius: "4px",
    fontSize: "9px",
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.04em",
    cursor: "pointer",
    outline: "none",
    "[data-highlighted]": {
      color: "#f4f1e8",
      backgroundColor: "#292c26",
    },
    "[data-selected]": {
      color: "#f4f1e8",
    },
  },
  indicatorSlot: {
    width: "8px",
    display: "grid",
    placeItems: "center",
  },
  indicator: {
    color: colors.accent,
    fontSize: "6px",
  },
});
