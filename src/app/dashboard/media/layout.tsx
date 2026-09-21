import RoleGate from "../role-gate";

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["admin"]}>{children}</RoleGate>;
}
