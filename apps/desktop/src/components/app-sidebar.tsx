import * as stylex from "@stylexjs/stylex";
import { Link, useRouterState } from "@tanstack/react-router";
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
  SidebarMenuButton,
  SidebarMenuItem,
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile, setIsPeeking } = useSidebar();
  return (
    <Sidebar variant="inset" side="left" data-window-no-drag>
      <SidebarHeader>
        <Link to="/" {...stylex.props(styles.wordmark)}>
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
                    isActive={item.to === "/" ? pathname === "/" : pathname.startsWith(item.to)}
                    nativeButton={false}
                    render={<Link to={item.to} activeOptions={{ exact: item.to === "/" }} />}
                    onClick={() => {
                      setOpenMobile(false);
                      setIsPeeking(false);
                    }}
                  >
                    {item.label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <p {...stylex.props(styles.footer)}>Your cards. Your workspace.</p>
      </SidebarFooter>
    </Sidebar>
  );
}
const styles = stylex.create({
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
  footer: { margin: 0, padding: "8px", fontSize: fontSizes.xs, color: "#787b72" },
});
