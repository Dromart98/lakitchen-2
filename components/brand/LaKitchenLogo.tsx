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

export function LaKitchenLogo({
  variant = "horizontal",
  theme = "light",
  className,
  title = "LaKitchen",
}: LaKitchenLogoProps) {
  const labelledBy = `${variant}-${theme}-lakitchen-logo-title`;
  const classes = ["lakitchen-logo", `lakitchen-logo--${variant}`, THEME_CLASS[theme], className]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={classes}
      viewBox={variant === "horizontal" ? "0 0 260 64" : "0 0 64 64"}
      role="img"
      aria-labelledby={labelledBy}
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id={labelledBy}>{title}</title>
      <g className="lakitchen-logo__mark">
        <path
          className="lakitchen-logo__primary"
          d="M18 12a4 4 0 0 1 8 0v6h2.4v-6a1.6 1.6 0 1 1 3.2 0v6H34v-6a4 4 0 0 1 8 0v15.1l7.9-8.3a4.4 4.4 0 0 1 6.3 6.1L42.1 39.3l14.4 15.2a4.4 4.4 0 1 1-6.4 6.1L36.1 45.8 26 56.1V58a4 4 0 0 1-8 0V12Zm8 22.1 8-8.1v-1.9H26v10Z"
        />
        <path
          className="lakitchen-logo__primary"
          d="M40.1 13.5c5.7-5.1 12.2-4.8 16.7-2.5.2 5-2.9 10.7-10.4 12.1-2.2.4-4.2 0-5.8-1.1 3.1-1.3 6-3.1 8.5-5.6-3.1 1.4-6 2-9 2.1-.9-1.6-.9-3.4 0-5Z"
        />
        {theme !== "monochrome" ? <circle className="lakitchen-logo__accent" cx="47" cy="45" r="3.2" /> : null}
      </g>
      {variant === "horizontal" ? (
        <text className="lakitchen-logo__wordmark" x="78" y="42">
          LaKitchen
        </text>
      ) : null}
    </svg>
  );
}
