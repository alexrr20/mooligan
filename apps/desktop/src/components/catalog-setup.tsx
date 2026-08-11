import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

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
  const progressRatio =
    progress && progress.totalBytes > 0 ? progress.completedBytes / progress.totalBytes : 0;

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
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !downloading) {
          setDismissed(true);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
        <Dialog.Viewport {...stylex.props(styles.viewport)}>
          <Dialog.Popup {...stylex.props(styles.dialog)}>
            <motion.div
              {...stylex.props(styles.panel)}
              initial={{ opacity: 0, scale: 0.985, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <div {...stylex.props(styles.topline)}>
                <span>{updating ? "Catalog refresh / Card index" : "First run / Card index"}</span>
                <span>
                  {downloading
                    ? "Receiving & indexing"
                    : updating
                      ? "Update available"
                      : "Local setup"}
                </span>
              </div>

              <div {...stylex.props(styles.layout)}>
                <div {...stylex.props(styles.mark)} aria-hidden="true">
                  <span {...stylex.props(styles.markNumber)}>∞</span>
                  <span {...stylex.props(styles.markLabel)}>Cards</span>
                </div>

                <div {...stylex.props(styles.copy)}>
                  <p {...stylex.props(styles.eyebrow)}>
                    {updating ? "A fresh catalog is ready" : "One quiet download"}
                  </p>
                  <Dialog.Title {...stylex.props(styles.title)}>
                    {updating ? (
                      <>
                        Bring the whole index
                        <br />
                        up to date.
                      </>
                    ) : (
                      <>
                        Keep the whole index
                        <br />
                        close at hand.
                      </>
                    )}
                  </Dialog.Title>
                  <Dialog.Description {...stylex.props(styles.description)}>
                    {updating
                      ? "A newer card library is ready with the latest cards, sets, and corrections. Your current library stays available until the update is complete."
                      : "Download the card library to this device for instant search and offline browsing. Prices will still be fetched when you ask for them."}
                  </Dialog.Description>

                  {state.kind === "error" ? (
                    <p {...stylex.props(styles.error)} role="alert">
                      {cleanError(state.message)}
                    </p>
                  ) : null}

                  {downloading ? (
                    <div {...stylex.props(styles.progressBlock)} aria-live="polite">
                      <div {...stylex.props(styles.progressMeta)}>
                        <span>{updating ? "Refreshing local index" : "Building local index"}</span>
                        <span>
                          {progress?.totalBytes
                            ? `${formatBytes(progress.completedBytes)} / ${formatBytes(progress.totalBytes)} · ${progress.completedCards.toLocaleString()} cards`
                            : "Connecting…"}
                        </span>
                      </div>
                      <div
                        {...stylex.props(styles.progressTrack)}
                        role="progressbar"
                        aria-label={updating ? "Updating card library" : "Downloading card library"}
                        aria-valuemax={progress?.totalBytes || undefined}
                        aria-valuenow={progress?.totalBytes ? progress.completedBytes : undefined}
                      >
                        <motion.div
                          {...stylex.props(styles.progressFill)}
                          animate={{ scaleX: progressRatio }}
                          transition={{ duration: 0.24, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div {...stylex.props(styles.actions)}>
                    <button
                      {...stylex.props(styles.primaryButton)}
                      type="button"
                      disabled={downloading}
                      onClick={() => void download()}
                    >
                      {downloading
                        ? "Downloading…"
                        : state.kind === "error"
                          ? updating
                            ? "Try update again"
                            : "Try again"
                          : updating
                            ? "Update library"
                            : "Download library"}
                      <span aria-hidden="true">↓</span>
                    </button>
                    <Dialog.Close {...stylex.props(styles.secondaryButton)} disabled={downloading}>
                      Not now
                    </Dialog.Close>
                  </div>
                </div>
              </div>

              <p {...stylex.props(styles.footnote)}>
                {updating
                  ? "The current library remains in place until its replacement is verified."
                  : "Stored in Mooligan’s private application data. No folder selection needed."}
              </p>
            </motion.div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function cleanError(message: string) {
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

function formatBytes(value: number) {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const styles = stylex.create({
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    backgroundColor: "rgba(13, 14, 12, 0.76)",
    backdropFilter: "blur(5px)",
  },
  viewport: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    padding: "28px",
    display: "grid",
    placeItems: "center",
    overflowY: "auto",
  },
  dialog: {
    width: "min(760px, calc(100vw - 56px))",
    maxWidth: "none",
    padding: 0,
    overflow: "visible",
    border: "1px solid #34362f",
    borderRadius: "3px",
    color: "#f4f1e8",
    backgroundColor: "#0a0a0a",
    boxShadow: "22px 24px 0 rgba(0, 0, 0, 0.4)",
    outline: "none",
  },
  panel: {
    padding: "0 30px 24px",
    backgroundImage:
      "radial-gradient(circle at 84% 12%, rgba(255, 255, 255, 0.05), transparent 30%)",
  },
  topline: {
    minHeight: "45px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    borderBottom: "1px solid #34362f",
    color: "#8f9287",
    fontSize: "8px",
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  },
  layout: {
    paddingBlock: "34px 32px",
    display: "grid",
    gridTemplateColumns: "138px minmax(0, 1fr)",
    gap: "42px",
    alignItems: "start",
  },
  mark: {
    width: "118px",
    height: "164px",
    padding: "14px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    border: "1px solid #1b1d19",
    borderRadius: "5px",
    backgroundColor: "#caff42",
    color: "#1b1d19",
    boxShadow: "11px 11px 0 #242620, 12px 12px 0 #55584f",
    transform: "rotate(-2.5deg)",
  },
  markNumber: {
    fontSize: "42px",
    lineHeight: 0.8,
  },
  markLabel: {
    fontSize: "8px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  copy: {
    minWidth: 0,
  },
  eyebrow: {
    margin: "0 0 15px",
    color: "#a6a89d",
    fontSize: "8px",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(34px, 5vw, 49px)",
    fontWeight: 400,
    letterSpacing: "-0.045em",
    lineHeight: 0.94,
  },
  description: {
    maxWidth: "475px",
    margin: "21px 0 0",
    color: "#a6a89d",
    fontSize: "12px",
    lineHeight: 1.65,
  },
  error: {
    margin: "18px 0 0",
    padding: "10px 12px",
    borderLeft: "3px solid #d98c83",
    color: "#f1c7c3",
    backgroundColor: "#2d1e1e",
    fontSize: "11px",
    lineHeight: 1.5,
  },
  progressBlock: {
    marginTop: "22px",
  },
  progressMeta: {
    marginBottom: "9px",
    display: "flex",
    justifyContent: "space-between",
    gap: "20px",
    color: "#a6a89d",
    fontSize: "8px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  progressTrack: {
    height: "7px",
    overflow: "hidden",
    border: "1px solid #55584f",
    backgroundColor: "#22241f",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    backgroundColor: "#caff42",
    transform: "scaleX(0)",
    transformOrigin: "left center",
  },
  actions: {
    marginTop: "25px",
    display: "flex",
    alignItems: "center",
    gap: "11px",
  },
  primaryButton: {
    minWidth: "190px",
    minHeight: "44px",
    paddingInline: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    border: "1px solid #caff42",
    borderRadius: "2px",
    color: "#1b1d19",
    backgroundColor: "#caff42",
    fontSize: "11px",
    cursor: "pointer",
    transition: "transform 160ms ease, background-color 160ms ease",
    ":hover": {
      transform: "translateY(-2px)",
      backgroundColor: "#dcff82",
    },
    ":focus-visible": {
      outline: "2px solid #caff42",
      outlineOffset: "3px",
    },
    ":disabled": {
      transform: "none",
      color: "#aeb0a6",
      backgroundColor: "#3c3e38",
      cursor: "wait",
    },
  },
  secondaryButton: {
    minHeight: "44px",
    paddingInline: "16px",
    border: 0,
    color: "#a6a89d",
    backgroundColor: "transparent",
    fontSize: "10px",
    cursor: "pointer",
    ":hover": {
      color: "#f4f1e8",
    },
    ":focus-visible": {
      outline: "2px solid #caff42",
      outlineOffset: "2px",
    },
    ":disabled": {
      color: "#a4a59e",
      cursor: "wait",
    },
  },
  footnote: {
    margin: 0,
    paddingTop: "15px",
    borderTop: "1px solid #34362f",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
});
