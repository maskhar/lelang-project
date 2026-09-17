import RoleGate from "../role-gate";

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate roles={["buyer"]}>{children}</RoleGate>;
}
