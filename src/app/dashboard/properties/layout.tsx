import RoleGate from "../role-gate";

export default function PropertiesLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["editor", "admin", "owner"]}>{children}</RoleGate>;
}
