import * as stylex from "@stylexjs/stylex";
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { CreateDeckDialog } from "../features/decks/create-deck-dialog";
import { DeckSidebarName } from "../features/decks/deck-sidebar-name";
import { useDecks } from "../features/decks/use-decks";
import { CatalogSetup, useCatalogSetup } from "./catalog-setup";
import { SidebarActions } from "./sidebar-actions";
import {
  HomeIcon,
  CollectionIcon,
  DecksIcon,
  SetsIcon,
  ListsIcon,
  SearchIcon,
} from "./navigation-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar";
import { colors, fontSizes } from "../styles/tokens.stylex.js";

const navigation = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/collection", label: "Collection", icon: CollectionIcon },
  { to: "/decks", label: "Decks", icon: DecksIcon },
  { to: "/sets", label: "Sets", icon: SetsIcon },
  { to: "/lists", label: "Lists", icon: ListsIcon },
  { to: "/search", label: "Search", icon: SearchIcon },
] as const;

export function AppSidebar() {
  const catalog = useCatalogSetup();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const selectedDeck = useRouterState({ select: (state) => state.location.search.deck });
  const decks = useDecks();
  const [creatingDeck, setCreatingDeck] = useState(false);
  const { setOpenMobile, setIsPeeking } = useSidebar();
  function closeSidebar() {
    setOpenMobile(false);
    setIsPeeking(false);
  }
  return (
    <>
      <Sidebar variant="inset" side="left" data-window-no-drag>
        <SidebarHeader style={{ paddingTop: "58px" }}>
          <Link to="/" {...stylex.props(styles.wordmark)} onClick={closeSidebar}>
            Mooligan
            <span {...stylex.props(styles.dot)} aria-hidden="true" />
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Primary">
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      size="sm"
                      icon={item.icon}
                      isActive={
                        item.to === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.to) && (item.to !== "/decks" || !selectedDeck)
                      }
                      nativeButton={false}
                      render={
                        <Link
                          to={item.to}
                          search={{}}
                          activeOptions={{ exact: item.to === "/" || item.to === "/decks" }}
                        />
                      }
                      onClick={closeSidebar}
                    >
                      {item.label}
                    </SidebarMenuButton>
                    {item.to === "/decks" && (
                      <SidebarMenuAction
                        style={styles.createDeck}
                        aria-label="Create deck"
                        title="Create deck"
                        onClick={() => {
                          closeSidebar();
                          setCreatingDeck(true);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 5v14M5 12h14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </SidebarMenuAction>
                    )}
                    {item.to === "/decks" && decks.length > 0 && (
                      <SidebarMenuSub aria-label="Decks">
                        {[...decks]
                          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
                          .map((deck) => (
                            <SidebarMenuSubItem key={deck.id}>
                              <SidebarMenuSubButton
                                isActive={pathname === "/decks" && selectedDeck === deck.id}
                                render={<Link to="/decks" search={{ deck: deck.id }} />}
                                title={deck.name}
                                onClick={closeSidebar}
                              >
                                <DeckSidebarName deck={deck} />
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter style={{ padding: "14px 16px" }}>
          <SidebarActions catalog={catalog} onNavigate={closeSidebar} />
        </SidebarFooter>
      </Sidebar>
      <CatalogSetup catalog={catalog} />
      {creatingDeck && <CreateDeckDialog onClose={() => setCreatingDeck(false)} />}
    </>
  );
}
const styles = stylex.create({
  createDeck: { top: "2px" },
  wordmark: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    height: "32px",
    padding: "0 8px",
    fontSize: fontSizes.lg,
    fontWeight: 500,
    letterSpacing: "-0.03em",
    color: "#f4f1e8",
    textDecoration: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "2px" },
  },
  dot: { width: "6px", height: "6px", borderRadius: "50%", backgroundColor: colors.accent },
});
