import RoleGate from "../role-gate";

export default function AccessRequestsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["admin"]}>{children}</RoleGate>;
}
