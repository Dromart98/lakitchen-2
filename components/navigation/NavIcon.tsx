export function NavIcon({ name }: { name: string }) {
  return <span className={`nav-icon nav-icon--${name}`} aria-hidden="true" />;
}
