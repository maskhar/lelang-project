import RoleGate from "../role-gate";

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["editor", "admin", "owner", "buyer"]}>{children}</RoleGate>;
}
