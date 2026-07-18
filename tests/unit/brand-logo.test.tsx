import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LaKitchenLogo } from "@/components/brand/LaKitchenLogo";

describe("LaKitchenLogo", () => {
  it("renders the horizontal wordmark with a single accessible name", () => {
    const html = renderToStaticMarkup(
      <LaKitchenLogo variant="horizontal" title="Marca LaKitchen" />,
    );

    expect(html).toContain(">LaKitchen</span>");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Marca LaKitchen"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<text");
  });

  it("renders the mark without a wordmark and keeps custom classes", () => {
    const html = renderToStaticMarkup(
      <LaKitchenLogo variant="mark" className="compact-brand" />,
    );

    expect(html).not.toContain(">LaKitchen</span>");
    expect(html).toContain('aria-label="LaKitchen"');
    expect(html).toContain("compact-brand");
  });

  it("keeps the monochrome theme class", () => {
    const html = renderToStaticMarkup(<LaKitchenLogo theme="monochrome" />);

    expect(html).toContain("lakitchen-logo--monochrome");
  });
});
