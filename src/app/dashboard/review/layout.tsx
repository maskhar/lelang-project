import RoleGate from "../role-gate";

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["editor", "admin"]}>{children}</RoleGate>;
}
