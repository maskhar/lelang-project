import RoleGate from "../role-gate";

export default function AssignmentsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["admin", "agent"]}>{children}</RoleGate>;
}
