import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { PageFrame } from "../components/page-frame";
import { AccountSetting } from "../features/auth/account-setting";
import { MotionSetting } from "../features/preferences/motion-setting";
import { SpoilerSettings } from "../features/spoilers/spoiler-settings";
import { WorkspaceSetting } from "../features/workspace/workspace-setting";
import { BackupSetting } from "../features/workspace/backup-setting";
import { PriceSettings } from "../features/prices/price-updates";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <PageFrame>
      <div {...stylex.props(styles.content)}>
        <AccountSetting />
        <WorkspaceSetting />
        <MotionSetting />
        <SpoilerSettings />
        <PriceSettings />
        <BackupSetting />
      </div>
    </PageFrame>
  );
}

const styles = stylex.create({
  content: {
    width: "100%",
    maxWidth: "980px",
    marginInline: "auto",
  },
});
