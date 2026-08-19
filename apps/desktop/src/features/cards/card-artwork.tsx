import type {
  CatalogCardFace,
  CatalogImageDescriptor,
  CatalogSelectedPrinting,
} from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { useMemo, useState } from "react";

import { catalogImageUrl } from "../catalog/catalog-image";
import { colors } from "../../styles/tokens.stylex.js";

type CardArtworkProps = {
  faces: readonly CatalogCardFace[];
  printing: CatalogSelectedPrinting;
};

export function CardArtwork({ faces, printing }: CardArtworkProps) {
  const images = useMemo(() => preferredFaceImages(printing.images), [printing.images]);
  const [activeFaceIndex, setActiveFaceIndex] = useState(images[0]?.faceIndex ?? 0);
  const [readyImage, setReadyImage] = useState<CatalogImageDescriptor>();
  const [failedKey, setFailedKey] = useState<string>();
  const reduceMotion = useReducedMotionConfig() ?? false;
  const requestedImage = images.find((image) => image.faceIndex === activeFaceIndex) ?? images[0];
  const requestKey = requestedImage ? imageKey(requestedImage) : "empty";
  const activeFace = requestedImage ? faces[requestedImage.faceIndex] : faces[0];
  const loading =
    requestedImage &&
    (!readyImage || imageKey(readyImage) !== requestKey) &&
    failedKey !== requestKey;
  const artworkUnavailable = failedKey === requestKey;

  function failArtwork(key: string) {
    if (key === requestKey) {
      setReadyImage(undefined);
      setFailedKey(key);
    }
  }

  return (
    <figure {...stylex.props(styles.figure)}>
      <div {...stylex.props(styles.frame)}>
        <AnimatePresence initial={false}>
          {readyImage ? (
            <motion.img
              {...stylex.props(styles.image)}
              key={imageKey(readyImage)}
              alt={`${faces[readyImage.faceIndex]?.name ?? faces[0]?.name ?? "Card"} artwork from ${printing.setName} (${printing.setCode.toUpperCase()})`}
              animate={{ opacity: 1 }}
              decoding="async"
              exit={{ opacity: reduceMotion ? 1 : 0 }}
              initial={{ opacity: reduceMotion ? 1 : 0 }}
              src={catalogImageUrl(readyImage)}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
              onError={() => failArtwork(imageKey(readyImage))}
            />
          ) : null}
        </AnimatePresence>

        {loading ? (
          <img
            {...stylex.props(styles.preload)}
            key={`preload:${requestKey}`}
            alt=""
            aria-hidden="true"
            src={catalogImageUrl(requestedImage)}
            onError={() => failArtwork(requestKey)}
            onLoad={() => {
              setFailedKey(undefined);
              setReadyImage(requestedImage);
            }}
          />
        ) : null}

        {!readyImage ? (
          <div
            {...stylex.props(styles.placeholder, artworkUnavailable && styles.placeholderFailed)}
            role="img"
            aria-label={
              artworkUnavailable
                ? `Artwork unavailable for ${activeFace?.name ?? "this card"}`
                : printing.images.length
                  ? `Loading artwork for ${activeFace?.name ?? "this card"}`
                  : `No artwork available for ${activeFace?.name ?? "this card"}`
            }
          >
            <span {...stylex.props(styles.placeholderMark)} aria-hidden="true">
              {artworkUnavailable ? "×" : printing.images.length ? "…" : "∅"}
            </span>
            <strong {...stylex.props(styles.placeholderTitle)}>
              {artworkUnavailable
                ? "Artwork unavailable offline"
                : requestedImage
                  ? "Reading cached artwork"
                  : "No artwork available"}
            </strong>
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div {...stylex.props(styles.faceControls)} role="group" aria-label="Artwork face">
          {images.map((image, index) => {
            const face = faces[image.faceIndex];
            const selected = image.faceIndex === requestedImage?.faceIndex;

            return (
              <button
                {...stylex.props(styles.faceButton, selected && styles.faceButtonSelected)}
                key={imageKey(image)}
                aria-pressed={selected}
                type="button"
                onClick={() => setActiveFaceIndex(image.faceIndex)}
              >
                <span {...stylex.props(styles.faceNumber)}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span {...stylex.props(styles.faceName)}>{face?.name ?? `Face ${index + 1}`}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </figure>
  );
}

function preferredFaceImages(images: readonly CatalogImageDescriptor[]) {
  const preferred = new Map<number, CatalogImageDescriptor>();

  for (const image of images) {
    const current = preferred.get(image.faceIndex);
    if (!current || (current.size === "small" && image.size === "normal")) {
      preferred.set(image.faceIndex, image);
    }
  }

  return [...preferred.values()].sort((left, right) => left.faceIndex - right.faceIndex);
}

function imageKey(image: CatalogImageDescriptor) {
  return `${image.printingId}:${image.faceIndex}:${image.size}`;
}

const styles = stylex.create({
  figure: {
    width: "100%",
    margin: 0,
  },
  frame: {
    width: "100%",
    aspectRatio: "5 / 7",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    border: "1px solid #55584f",
    borderRadius: "3.5% / 2.5%",
    backgroundColor: "#141512",
    backgroundImage:
      "linear-gradient(135deg, transparent 0 49.7%, rgba(244, 241, 232, 0.055) 49.8% 50.2%, transparent 50.3%), linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px)",
    backgroundSize: "auto, 24px 24px, 24px 24px",
    boxShadow: "10px 12px 0 rgba(0, 0, 0, 0.38)",
  },
  image: {
    width: "100%",
    height: "100%",
    position: "absolute",
    inset: 0,
    display: "block",
    objectFit: "cover",
  },
  preload: {
    width: "1px",
    height: "1px",
    position: "absolute",
    opacity: 0,
    pointerEvents: "none",
  },
  placeholder: {
    width: "min(72%, 230px)",
    position: "relative",
    zIndex: 1,
    display: "grid",
    justifyItems: "center",
    color: "#a6a89d",
    textAlign: "center",
  },
  placeholderFailed: {
    color: "#b8baaf",
  },
  placeholderMark: {
    width: "56px",
    height: "74px",
    marginBottom: "22px",
    display: "grid",
    placeItems: "center",
    border: "1px solid #55584f",
    borderRadius: "3px",
    color: colors.accent,
    fontSize: "16px",
    boxShadow: "6px 6px 0 #242620",
  },
  placeholderTitle: {
    color: "#f4f1e8",
    fontSize: "12px",
    fontWeight: 400,
    lineHeight: 1.3,
  },
  faceControls: {
    marginTop: "12px",
    display: "grid",
    gap: "6px",
  },
  faceButton: {
    width: "100%",
    minHeight: "42px",
    padding: "0 12px",
    display: "grid",
    gridTemplateColumns: "29px minmax(0, 1fr)",
    alignItems: "center",
    border: "1px solid #34362f",
    borderRadius: "2px",
    color: "#a6a89d",
    backgroundColor: "transparent",
    textAlign: "left",
    cursor: "pointer",
    transition: "color 150ms ease, border-color 150ms ease, background-color 150ms ease",
    ":hover": {
      color: "#f4f1e8",
      borderColor: "#696c63",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  faceButtonSelected: {
    borderColor: colors.accent,
    color: "#1b1d19",
    backgroundColor: colors.accent,
    ":hover": {
      borderColor: colors.accent,
      color: "#1b1d19",
      backgroundColor: colors.accent,
    },
  },
  faceNumber: {
    fontSize: "7px",
    letterSpacing: "0.08em",
    opacity: 0.7,
  },
  faceName: {
    overflow: "hidden",
    fontSize: "9px",
    letterSpacing: "0.04em",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
});
