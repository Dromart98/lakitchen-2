import React from "react";

type LaKitchenLogoVariant = "horizontal" | "mark";
type LaKitchenLogoTheme = "light" | "dark" | "monochrome";

type LaKitchenLogoProps = {
  variant?: LaKitchenLogoVariant;
  theme?: LaKitchenLogoTheme;
  className?: string;
  title?: string;
};

const THEME_CLASS: Record<LaKitchenLogoTheme, string> = {
  light: "lakitchen-logo--light",
  dark: "lakitchen-logo--dark",
  monochrome: "lakitchen-logo--monochrome",
};

function LogoMark() {
  return (
    <svg
      className="lakitchen-logo__symbol"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        className="lakitchen-logo__primary"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path strokeWidth="6" d="M22 14v40M22 32h5M27 32l23-20M27 32l23 21" />
        <path strokeWidth="3.5" d="M16 10v9M22 10v9M28 10v9" />
        <path
          className="lakitchen-logo__leaf"
          fill="currentColor"
          stroke="none"
          d="M37.5 21.8c4.8-5.7 10-5.7 13.6-4.1-.2 4.5-3.2 8.4-8.1 8.7-2.5.2-4.5-.8-5.5-2.1l7.1-4.1-7.1 1.6Z"
        />
      </g>
      <circle className="lakitchen-logo__accent" cx="37" cy="41" r="2.6" />
    </svg>
  );
}

export function LaKitchenLogo({
  variant = "horizontal",
  theme = "light",
  className,
  title = "LaKitchen",
}: LaKitchenLogoProps) {
  const classes = ["lakitchen-logo", `lakitchen-logo--${variant}`, THEME_CLASS[theme], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="img" aria-label={title}>
      <LogoMark />
      {variant === "horizontal" ? (
        <span className="lakitchen-logo__wordmark" aria-hidden="true">
          LaKitchen
        </span>
      ) : null}
    </span>
  );
}
