/**
 * Custom ECharts tree-shaken bundle — R4.9.5i Step 0a compression sweep.
 *
 * Only the components actually used by src/main.jsx are registered here.
 * Switching from `import("echarts")` (full 1.2 MB bundle) to this module
 * saves ~40-60 KB raw / ~15-20 KB gzip by eliminating unused chart types
 * and components (heatmap, scatter, radar, map, tree, sankey, treemap,
 * gauge, boxplot, candlestick, effectScatter, lines, themeRiver, sunburst,
 * funnel, pictorialBar, custom, dataZoom, visualMap, brush, toolbox,
 * timeline, calendar, geo, polar, markLine, markPoint, markArea, etc.).
 *
 * Chart types used in src/main.jsx:
 *   - LineChart  (buildCorpusChart, buildMcChart, buildScenarioChart)
 *   - BarChart   (buildBarChart)
 *   - PieChart   (buildPieChart)
 *
 * Components used:
 *   - GridComponent   (xAxis, yAxis, grid in baseChart())
 *   - TooltipComponent (tooltip in baseChart())
 *   - LegendComponent  (legend in buildBarChart, buildPieChart, buildScenarioChart)
 *
 * Renderer: CanvasRenderer only (all charts use renderer: "canvas").
 *
 * The exported surface mirrors the `echarts` namespace so loadECharts() in
 * main.jsx can call `echarts.init(...)` without changes.
 *
 * No-change contract: the `init` function and `setOption` API are part of
 * echarts/core — full functional parity with the full echarts import for
 * the three chart types registered here.
 */
/* v8 ignore start -- browser-only ECharts glue module; cannot exercise canvas
 * registration in jsdom (HTMLCanvasElement.getContext is not implemented).
 * Functional coverage is provided by Puppeteer e2e smoke tests
 * (tests/e2e/dashboard-regression.mjs chart-rendering assertions). */
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

export default echarts;
/* v8 ignore stop */
