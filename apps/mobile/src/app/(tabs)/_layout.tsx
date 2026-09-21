import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useMooliganTheme } from "@/theme/theme-provider";

export default function TabLayout() {
  const { palette } = useMooliganTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.text,
        headerShadowVisible: false,
        tabBarActiveTintColor: palette.accentText,
        tabBarInactiveTintColor: palette.textSecondary,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 26 }}>⌕</Text>,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: "Collection",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▦</Text>,
        }}
      />
      <Tabs.Screen
        name="decks"
        options={{
          title: "Decks",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>▱</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23 }}>⚙︎</Text>,
        }}
      />
    </Tabs>
  );
}
