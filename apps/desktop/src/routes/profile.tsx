import { createFileRoute, Navigate } from "@tanstack/react-router";

import { SolidCardLoadingIndicator } from "../components/solid-card-loading-indicator";
import { useAuth } from "../features/auth/use-auth";
import { canAccessProfile } from "../features/profile/profile-access";
import { ProfilePage } from "../features/profile/profile-page";
import { useWorkspaceRuntime } from "../features/workspace/workspace-runtime-context";

export const Route = createFileRoute("/profile")({ component: ProfileRoute });

function ProfileRoute() {
  const auth = useAuth();
  const { runtime } = useWorkspaceRuntime();
  if (auth.loading) return <SolidCardLoadingIndicator label="Loading profile" />;
  if (!canAccessProfile(auth.snapshot, runtime) || !auth.snapshot.user) {
    return <Navigate to="/" replace />;
  }
  return <ProfilePage key={runtime.workspaceId} user={auth.snapshot.user} />;
}
