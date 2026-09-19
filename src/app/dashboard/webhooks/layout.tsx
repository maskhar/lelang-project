import RoleGate from "../role-gate";

export default function WebhooksLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["admin"]}>{children}</RoleGate>;
}
