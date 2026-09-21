import AsyncStorage from "@react-native-async-storage/async-storage";
import { Children, createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { Choice } from "./ui";

type ResultView = "list" | "grid";
const GridContext = createContext(false);
export function useGridLayout() {
  return useContext(GridContext);
}
export function ResultsLayout({
  children,
  preference,
}: {
  children: ReactNode;
  preference: "search" | "collection" | "decks" | "deck-cards";
}) {
  const [view, setView] = useState<ResultView>("list");
  const { width } = useWindowDimensions();
  const key = `mooligan.device.${preference}.view`;
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key)
      .then((saved) => {
        if (active) setView(saved === "grid" ? "grid" : "list");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key]);
  function change(next: ResultView) {
    setView(next);
    void AsyncStorage.setItem(key, next).catch(() => undefined);
  }
  const grid = view === "grid";
  return (
    <>
      <Choice
        label="View"
        value={view}
        options={[
          { label: "List", value: "list" },
          { label: "Grid", value: "grid" },
        ]}
        onChange={change}
      />
      <GridContext.Provider value={grid}>
        <View
          style={
            grid
              ? { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }
              : { gap: 12 }
          }
        >
          {Children.map(
            children,
            (child) =>
              child && (
                <View style={grid ? { width: width >= 650 ? "31%" : "48%" } : undefined}>
                  {child}
                </View>
              ),
          )}
        </View>
      </GridContext.Provider>
    </>
  );
}
