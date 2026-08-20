import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import type { Key, ReactNode } from "react";

import { catalogImageUrl } from "../catalog/catalog-image";

type PrintingImageProps = {
  alt?: string;
  children?: ReactNode;
  compact?: boolean;
  concealed?: boolean;
  failed?: boolean;
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
  image,
  imageActive = true,
  imageKey,
  overlay,
  placeholder,
  variant = "default",
  onImageError,
  onImageLoad,
}: PrintingImageProps) {
  const imageVisible = image && imageActive && !failed;

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
          src={catalogImageUrl(image)}
          onError={onImageError}
          onLoad={onImageLoad}
        />
      ) : (
        (placeholder ??
        (!image || failed ? (
          <span {...stylex.props(styles.fallback)}>{failed ? "Art offline" : "No art"}</span>
        ) : null))
      )}
      {overlay}
    </div>
  );
}

const styles = stylex.create({
  frame: {
    width: "100%",
    aspectRatio: "5 / 7",
    position: "relative",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    border: "1px solid #34362f",
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
    borderColor: "#55584f",
    backgroundColor: "#141512",
    backgroundImage:
      "linear-gradient(135deg, transparent 0 49.7%, rgba(244, 241, 232, 0.055) 49.8% 50.2%, transparent 50.3%), linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px)",
    backgroundSize: "auto, 24px 24px, 24px 24px",
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
