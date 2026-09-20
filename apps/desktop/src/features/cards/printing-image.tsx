import type { Finish } from "@mooligan/domain/catalog";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { useState, type Key, type ReactNode } from "react";

import { catalogImageUrl } from "../catalog/catalog-image";
import { FoilOverlay } from "./foil-overlay";

type PrintingImageProps = {
  alt?: string;
  children?: ReactNode;
  compact?: boolean;
  concealed?: boolean;
  failed?: boolean;
  finish?: Finish;
  image?: CatalogImageDescriptor | null;
  imageActive?: boolean;
  imageKey?: Key;
  overlay?: ReactNode;
  placeholder?: ReactNode;
  variant?: "default" | "detail";
  onImageError?: () => void;
  onImageLoad?: () => void;
};

export function PrintingImage({
  alt = "",
  children,
  compact = false,
  concealed = false,
  failed = false,
  finish,
  image,
  imageActive = true,
  imageKey,
  overlay,
  placeholder,
  variant = "default",
  onImageError,
  onImageLoad,
}: PrintingImageProps) {
  const [loadedSource, setLoadedSource] = useState<string>();
  const source = image ? catalogImageUrl(image) : undefined;
  const imageVisible = image && imageActive && !failed;
  const artworkReady = children !== undefined || (imageVisible && loadedSource === source);

  return (
    <div
      {...stylex.props(
        styles.frame,
        compact && styles.compact,
        concealed && styles.concealed,
        variant === "detail" && styles.detail,
      )}
      data-catalog-image-id={image ? image.printingId : undefined}
    >
      {children !== undefined ? (
        children
      ) : imageVisible ? (
        <img
          {...stylex.props(styles.image)}
          key={imageKey}
          alt={alt}
          decoding="async"
          loading="eager"
          src={source}
          onError={() => {
            setLoadedSource(undefined);
            onImageError?.();
          }}
          onLoad={() => {
            setLoadedSource(source);
            onImageLoad?.();
          }}
        />
      ) : (
        (placeholder ??
        (!image || failed ? (
          <span {...stylex.props(styles.fallback)}>{failed ? "Art offline" : "No art"}</span>
        ) : null))
      )}
      {artworkReady && imageActive && !failed && !concealed ? (
        <FoilOverlay finish={finish} />
      ) : null}
      {overlay}
    </div>
  );
}

const styles = stylex.create({
  frame: {
    width: "100%",
    aspectRatio: "5 / 7",
    position: "relative",
    isolation: "isolate",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#34362f",
    borderRadius: "3.5% / 2.5%",
    backgroundColor: "#171815",
  },
  compact: {
    width: {
      default: "46px",
      "@media (max-width: 820px)": "40px",
    },
  },
  concealed: {
    backgroundColor: "#171914",
    backgroundImage:
      "linear-gradient(135deg, rgba(199, 238, 0, 0.055) 0, rgba(199, 238, 0, 0.055) 1px, transparent 1px, transparent 12px)",
    backgroundSize: "13px 13px",
  },
  detail: {
    borderWidth: 0,
    backgroundColor: "#171817",
    boxShadow: "0 12px 32px #0004",
  },
  image: {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: "cover",
  },
  fallback: {
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.09em",
    textTransform: "uppercase",
  },
});
