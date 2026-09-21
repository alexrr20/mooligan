import { useGridLayout } from "./results-layout";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Finish } from "@mooligan/domain/catalog";
import { lowestRetailPrice } from "@mooligan/catalog/lowest-prices";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMooliganTheme } from "@/theme/theme-provider";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";

export function CardImage({
  image,
  large = false,
  art = false,
}: {
  image?: CatalogImageDescriptor | null;
  large?: boolean;
  art?: boolean;
}) {
  const { palette } = useMooliganTheme();
  const { data: uri } = useCatalogQuery(
    ["image", image?.printingId, image?.faceIndex, image?.size],
    ({ catalog, visibility }) => (image ? catalog.image(image, visibility) : null),
  );
  return (
    <View
      style={[
        styles.image,
        large && styles.large,
        art && styles.art,
        { backgroundColor: palette.pressed },
      ]}
    >
      {uri ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri }}
          recyclingKey={uri}
          cachePolicy="disk"
          contentFit={art ? "cover" : "contain"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text style={[styles.placeholder, { color: palette.textSecondary }]}>
          {image ? "Image unavailable offline" : "M"}
        </Text>
      )}
    </View>
  );
}
export function PrintingPrice({ printingId, finish }: { printingId: string; finish?: Finish }) {
  const { providers, currency, rates } = useWorkspace();
  const { palette } = useMooliganTheme();
  const { data } = useCatalogQuery(
    ["price", printingId],
    ({ catalog, visibility, reference, prices }) =>
      prices && catalog.isVisible(printingId, visibility) ? reference.prices(printingId) : null,
  );
  if (!data || !providers.length) return null;
  const { lowest, missingRates } = lowestRetailPrice(
    data.prices,
    providers,
    currency,
    rates,
    finish,
  );
  if (!lowest)
    return (
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        {missingRates ? "Exchange rate unavailable" : "Price unavailable"}
      </Text>
    );
  const stale = Date.now() - Date.parse(lowest.price.priceDate) > 7 * 86_400_000;
  return (
    <Text style={[styles.subtitle, { color: palette.accentText }]}>
      {finish ? "" : "From "}
      {lowest.rateDate ? "≈ " : ""}
      {new Intl.NumberFormat(undefined, { style: "currency", currency }).format(lowest.amount)} ·{" "}
      {lowest.price.market}
      {stale ? " · stale" : ""}
    </Text>
  );
}
export function CardRow({
  printingId,
  name,
  detail,
  image,
  gridImage,
  onPress,
  quantity,
  finish,
}: {
  printingId: string;
  name: string;
  detail?: string;
  image?: CatalogImageDescriptor | null;
  gridImage?: CatalogImageDescriptor | null;
  onPress?: () => void;
  quantity?: number;
  finish?: Finish;
}) {
  const grid = useGridLayout();
  const { palette } = useMooliganTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${onPress ? "Select" : "Open"} ${quantity ? `${quantity} ${quantity === 1 ? "copy" : "copies"} of ` : ""}${name}`}
      onPress={
        onPress ?? (() => router.push({ pathname: "/cards/[printingId]", params: { printingId } }))
      }
      style={({ pressed }) => [
        styles.row,
        grid && { flexDirection: "column", alignItems: "stretch", borderBottomWidth: 0 },
        { borderColor: palette.border, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <CardImage image={grid ? (gridImage ?? image) : image} large={grid} />
      <View style={[styles.copy, grid && { flex: 0 }]}>
        <Text style={[styles.name, { color: palette.text }]}>{name}</Text>
        {detail && (
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{detail}</Text>
        )}
        <PrintingPrice printingId={printingId} finish={finish} />
      </View>
      {quantity !== undefined && (
        <Text style={[styles.quantity, { color: palette.accentText }]}>{quantity}</Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 108,
  },
  image: {
    width: 58,
    aspectRatio: 5 / 7,
    borderRadius: 5,
    overflow: "hidden",
    justifyContent: "center",
  },
  large: { width: "100%", maxWidth: 350, alignSelf: "center", borderRadius: 14 },
  art: { maxWidth: 720, aspectRatio: 2.5 },
  placeholder: { textAlign: "center", fontSize: 10, padding: 4 },
  copy: { flex: 1, gap: 5 },
  name: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  subtitle: { fontSize: 12, lineHeight: 18 },
  quantity: { fontSize: 23, fontWeight: "700" },
});
