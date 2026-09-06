import { Progress } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { colors } from "../styles/tokens.stylex.js";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { uiColors } from "./ui/theme.stylex";

type SetupState =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "outdated" }
  | { kind: "downloading"; progress: CatalogProgress; updating: boolean }
  | { kind: "error"; message: string; updating: boolean }
  | { kind: "ready" };

export function CatalogSetup() {
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<SetupState>({ kind: "checking" });
  const visible = !dismissed && state.kind !== "checking" && state.kind !== "ready";

  useEffect(() => {
    const catalog = window.catalog;

    let active = true;
    const stopProgress = catalog.onProgress((progress) => {
      if (active) {
        setState((current) => ({
          kind: "downloading",
          progress,
          updating:
            current.kind === "outdated" ||
            ((current.kind === "downloading" || current.kind === "error") && current.updating),
        }));
      }
    });

    void catalog
      .status()
      .then((status) => {
        if (active) {
          setState({
            kind: !status.installed ? "missing" : status.updateAvailable ? "outdated" : "ready",
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({
            kind: "error",
            message: "Mooligan could not check the local card library.",
            updating: false,
          });
        }
      });

    return () => {
      active = false;
      stopProgress();
    };
  }, []);

  if (!visible) {
    return null;
  }

  const downloading = state.kind === "downloading";
  const updating =
    state.kind === "outdated" ||
    ((state.kind === "downloading" || state.kind === "error") && state.updating);
  const progress = downloading ? state.progress : undefined;
  const indexing = Boolean(progress?.totalBytes && progress.completedBytes >= progress.totalBytes);
  const progressPercent =
    progress && progress.totalBytes > 0 && !indexing
      ? Math.min(99, Math.floor((progress.completedBytes / progress.totalBytes) * 100))
      : null;
  const progressLabel = indexing
    ? "Finishing up…"
    : progress?.totalBytes
      ? "Downloading…"
      : "Connecting…";

  async function download() {
    const catalog = window.catalog;

    setState({
      kind: "downloading",
      progress: { completedBytes: 0, completedCards: 0, totalBytes: 0 },
      updating,
    });

    try {
      await catalog.download();
      window.dispatchEvent(new Event("catalogready"));
      setState({ kind: "ready" });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "The card library could not be downloaded.",
        updating,
      });
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !downloading) {
          setDismissed(true);
        }
      }}
    >
      <DialogContent showCloseButton={false} style={styles.content}>
        <DialogHeader>
          <DialogTitle style={styles.title}>
            {downloading
              ? updating
                ? "Updating card catalog"
                : "Downloading card catalog"
              : updating
                ? "Update card catalog"
                : "Download card catalog"}
          </DialogTitle>
          <DialogDescription style={styles.description}>
            {updating
              ? downloading
                ? "Your current catalog stays available until the update is complete."
                : "Get the latest cards and corrections for offline browsing."
              : "Download the catalog to search cards and browse offline."}
          </DialogDescription>
        </DialogHeader>

        {state.kind === "error" ? (
          <p {...stylex.props(styles.error)} role="alert">
            {cleanError(state.message)}
          </p>
        ) : null}

        {downloading ? (
          <Progress.Root
            {...stylex.props(styles.progress)}
            value={progressPercent}
            aria-valuetext={
              progressPercent === null ? progressLabel : `${progressPercent}% downloaded`
            }
          >
            <div {...stylex.props(styles.progressMeta)}>
              <Progress.Label aria-live="polite">{progressLabel}</Progress.Label>
              <Progress.Value {...stylex.props(styles.progressValue)}>
                {(_, value) => (value === null ? null : `${value}%`)}
              </Progress.Value>
            </div>
            <Progress.Track {...stylex.props(styles.progressTrack)}>
              <Progress.Indicator {...stylex.props(styles.progressFill)} />
            </Progress.Track>
            {progress?.totalBytes ? (
              <p {...stylex.props(styles.progressDetail)}>
                {indexing
                  ? `${progress.completedCards.toLocaleString()} cards processed`
                  : `${formatBytes(progress.completedBytes)} of ${formatBytes(progress.totalBytes)}`}
              </p>
            ) : null}
          </Progress.Root>
        ) : (
          <div {...stylex.props(styles.actions)}>
            <DialogClose render={<Button size="lg" variant="ghost" style={styles.action} />}>
              Not now
            </DialogClose>
            <Button onClick={() => void download()} size="lg" style={styles.action}>
              {state.kind === "error"
                ? "Try again"
                : updating
                  ? "Update catalog"
                  : "Download catalog"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cleanError(message: string) {
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const styles = stylex.create({
  content: {
    maxWidth: "min(28rem, calc(100vw - 2rem))",
    maxHeight: "calc(100dvh - 2rem)",
    overflowY: "auto",
    padding: {
      default: "1.5rem",
      "@media (max-width: 400px)": "1.25rem",
    },
    gap: "1.5rem",
  },
  title: {
    fontSize: "1.375rem",
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: "-0.02em",
  },
  description: {
    lineHeight: 1.5,
  },
  error: {
    margin: 0,
    padding: "0.75rem",
    borderRadius: "0.5rem",
    color: uiColors.destructive,
    backgroundColor: uiColors.destructive20,
    fontSize: "0.8125rem",
    lineHeight: 1.5,
    overflowWrap: "anywhere",
  },
  progress: {
    display: "grid",
    gap: "0.625rem",
    minWidth: 0,
  },
  progressMeta: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "1rem",
    fontSize: "0.8125rem",
    lineHeight: 1.5,
  },
  progressValue: {
    color: colors.accent,
    fontVariantNumeric: "tabular-nums",
  },
  progressTrack: {
    height: "0.375rem",
    overflow: "hidden",
    borderRadius: "999px",
    backgroundColor: uiColors.muted,
  },
  progressFill: {
    height: "100%",
    borderRadius: "inherit",
    backgroundColor: colors.accent,
    "[data-indeterminate]": {
      width: "100%",
      opacity: 0.35,
    },
  },
  progressDetail: {
    margin: 0,
    color: uiColors.mutedForeground,
    fontSize: "0.75rem",
    lineHeight: 1.5,
    fontVariantNumeric: "tabular-nums",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.5rem",
  },
  action: {
    paddingInline: "0.875rem",
  },
});
