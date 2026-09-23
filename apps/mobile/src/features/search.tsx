import { router } from "expo-router";
import { useMobileAccount } from "@/account/account-provider";
import { Button, Copy, Row, Screen } from "@/components/ui";
import { useWorkspace } from "@/workspace/provider";
import { CatalogSetup } from "./catalog/catalog-setup";
import { CatalogSearch } from "./search/catalog-search";

export default function SearchScreen() {
  const { snapshot } = useWorkspace();
  const { auth, runtime } = useMobileAccount();
  const hasProfile =
    auth.status === "signed-in" &&
    runtime.workspaces.some((w) => w.active && w.accountAssociation === "account");
  return (
    <Screen>
      <Copy title="Find your next card.">Search your offline Magic catalog.</Copy>
      <Row>
        <Button quiet label="Upcoming releases" onPress={() => router.push("/sets")} />
        {hasProfile && <Button quiet label="Profile" onPress={() => router.push("/profile")} />}
      </Row>
      {!snapshot && <CatalogSetup />}
      {snapshot && <CatalogSearch />}
    </Screen>
  );
}
