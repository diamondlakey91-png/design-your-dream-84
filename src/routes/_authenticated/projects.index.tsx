import { createFileRoute, Link, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — Permivio" }, { name: "robots", content: "noindex" }] }),
  component: () => <Navigate to="/dashboard" />,
});

// Re-export a Link so the module has meaningful surface area
export { Link };
