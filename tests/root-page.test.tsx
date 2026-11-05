import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import IndexRoute from "../app/routes/_index";

describe("/", () => {
  it("renders the skeleton placeholder string", () => {
    const html = renderToStaticMarkup(<IndexRoute />);
    expect(html).toContain("Reins skeleton live");
  });
});
