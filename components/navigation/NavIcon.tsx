import type { NavigationIconName } from "./navigation-items";

export function NavIcon({ name }: { name: NavigationIconName }) {
  const commonProps = {
    className: "nav-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  if (name === "home") {
    return (
      <svg {...commonProps}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    );
  }

  if (name === "inventory") {
    return (
      <svg {...commonProps}>
        <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z" />
        <path d="M4 7.5v9L12 21l8-4.5v-9" />
        <path d="M12 12v9" />
      </svg>
    );
  }

  if (name === "macros") {
    return (
      <svg {...commonProps}>
        <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />
        <path d="M15 3.6A9 9 0 0 1 20.4 9H15V3.6Z" />
        <path d="M8 15h5" />
      </svg>
    );
  }

  if (name === "plan") {
    return (
      <svg {...commonProps}>
        <circle cx="9" cy="12" r="4" />
        <path d="M17 4v16" />
        <path d="M20 4v16" />
        <path d="M4 20h16" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}
