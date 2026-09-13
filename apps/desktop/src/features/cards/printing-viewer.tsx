import { PrintingPrice } from "../prices/printing-price";
import type {
  CatalogCardFace,
  CatalogImageDescriptor,
  CatalogSelectedPrinting,
} from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { useMemo, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { catalogImageUrl } from "../catalog/catalog-image";
import { colors } from "../../styles/tokens.stylex.js";
import { PrintingImage } from "./printing-image";

type PrintingViewerProps = {
  faces: readonly CatalogCardFace[];
  printing: CatalogSelectedPrinting;
};

export function PrintingViewer({ faces, printing }: PrintingViewerProps) {
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
      <PrintingImage variant="detail">
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
      </PrintingImage>
      {!printing.isDigital ? (
        <figcaption>
          <PrintingPrice printingId={printing.id} />
        </figcaption>
      ) : null}

      {images.length > 1 ? (
        <ToggleGroup
          style={styles.faceControls}
          orientation="vertical"
          aria-label="Artwork face"
          value={requestedImage ? [imageKey(requestedImage)] : []}
          onValueChange={(values) => {
            const next = images.find((image) => imageKey(image) === values[0]);
            if (next) setActiveFaceIndex(next.faceIndex);
          }}
        >
          {images.map((image, index) => {
            const face = faces[image.faceIndex];

            return (
              <ToggleGroupItem
                style={styles.faceButton}
                value={imageKey(image)}
                key={imageKey(image)}
                type="button"
              >
                <span {...stylex.props(styles.faceNumber)}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span {...stylex.props(styles.faceName)}>{face?.name ?? `Face ${index + 1}`}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      ) : null}
    </figure>
  );
}

function preferredFaceImages(images: readonly CatalogImageDescriptor[]) {
  const preferred = new Map<number, CatalogImageDescriptor>();

  for (const image of images) {
    if (image.size === "art_crop") continue;
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
    width: "52px",
    height: "70px",
    marginBottom: "20px",
    display: "grid",
    placeItems: "center",
    borderRadius: "6px",
    color: colors.accent,
    backgroundColor: "#213326",
    fontSize: "22px",
    boxShadow: "6px 5px 0 #1b231d",
  },
  placeholderTitle: { color: "#c6c8bd", fontSize: "14px", fontWeight: 400, lineHeight: 1.5 },
  faceControls: {
    width: "100%",
    marginTop: "12px",
    padding: "4px",
    gap: "4px",
    borderRadius: "9px",
    backgroundColor: "#171817",
  },
  faceButton: {
    width: "100%",
    height: "auto",
    minHeight: "40px",
    padding: "8px 12px",
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr)",
    alignItems: "center",
    gap: "8px",
    borderWidth: 0,
    borderRadius: "6px",
    color: "#989b92",
    backgroundColor: "transparent",
    textAlign: "left",
    "[data-pressed]": { color: "#f4f1e8", backgroundColor: "#30322e" },
  },
  faceNumber: { fontSize: "11px", color: "#989b92", fontVariantNumeric: "tabular-nums" },
  faceName: { fontSize: "13px", lineHeight: 1.4, whiteSpace: "normal", overflowWrap: "anywhere" },
});
