import * as stylex from "@stylexjs/stylex";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
import { settingStyles } from "../../styles/settings";
import { useMotionPreference, type MotionPreference } from "./use-motion-preference";

export function MotionSetting() {
  const { motion, setMotion } = useMotionPreference();
  return (
    <section {...stylex.props(styles.setting)} aria-labelledby="motion-heading">
      <div {...stylex.props(settingStyles.settingIntro)}>
        <h2 {...stylex.props(typography.pageTitle, settingStyles.settingTitle)} id="motion-heading">
          Motion
        </h2>
        <p {...stylex.props(typography.body, settingStyles.settingCopy)}>
          Follow your operating system, keep transitions restrained, or show every interface
          movement. This preference is saved on this device.
        </p>
      </div>

      <fieldset {...stylex.props(styles.options)}>
        <legend {...stylex.props(typography.bodySmall, styles.visuallyHidden)}>
          Motion behavior
        </legend>
        {motionOptions.map((option) => {
          const selected = motion === option.value;

          return (
            <label
              {...stylex.props(styles.option, selected && styles.optionSelected)}
              key={option.value}
            >
              <input
                {...stylex.props(styles.radio)}
                checked={selected}
                name="motion"
                onChange={() => setMotion(option.value)}
                type="radio"
                value={option.value}
              />
              <span {...stylex.props(styles.optionBody)}>
                <strong {...stylex.props(typography.heading, styles.optionTitle)}>
                  {option.label}
                </strong>
                <span {...stylex.props(typography.bodySmall, styles.optionCopy)}>
                  {option.description}
                </span>
              </span>
              <span {...stylex.props(typography.body, styles.optionMark)} aria-hidden="true">
                {selected ? "●" : "○"}
              </span>
            </label>
          );
        })}
      </fieldset>
    </section>
  );
}

const motionOptions: readonly {
  description: string;
  label: string;
  value: MotionPreference;
}[] = [
  {
    description: "Use the reduced-motion setting from this computer.",
    label: "System",
    value: "system",
  },
  {
    description: "Remove decorative movement and keep state changes direct.",
    label: "Reduced",
    value: "reduced",
  },
  {
    description: "Show the complete set of transitions and interactions.",
    label: "Full",
    value: "full",
  },
];

const styles = stylex.create({
  setting: {
    maxWidth: "980px",
  },
  options: {
    minWidth: 0,
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 820px)": "1fr",
    },
    gap: "8px",
    borderWidth: 0,
  },
  option: {
    minHeight: "138px",
    padding: "18px",
    position: "relative",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "12px",
    color: "#a6a89d",
    backgroundColor: "rgba(255, 255, 255, 0.018)",
    borderRadius: "10px",
    cursor: "pointer",
    transition: "color 160ms ease, background-color 160ms ease",
    ":hover": {
      color: "#f4f1e8",
      backgroundColor: "rgba(255, 255, 255, 0.045)",
    },
    ":focus-within": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "-2px",
    },
  },
  optionSelected: {
    color: "#f4f1e8",
    backgroundColor: "#171914",
  },
  radio: {
    width: "1px",
    height: "1px",
    position: "absolute",
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none",
  },
  optionBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  optionTitle: {
    color: "inherit",
  },
  optionCopy: {
    maxWidth: "210px",
    color: "#85887e",
  },
  optionMark: {
    color: colors.accent,
  },
  visuallyHidden: {
    width: "1px",
    height: "1px",
    position: "absolute",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
});
