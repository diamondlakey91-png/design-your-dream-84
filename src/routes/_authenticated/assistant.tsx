import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Permit Assistant — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: AssistantLayout,
});

function AssistantLayout() {
  return <Outlet />;
}
