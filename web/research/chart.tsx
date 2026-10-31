import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { type EChartsCoreOption, init, use } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  DataZoomComponent,
  SVGRenderer,
]);
export function ResearchChart({ label, option }: { label: string; option: EChartsCoreOption }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = init(ref.current!, undefined, { renderer: "svg" });
    c.setOption({ ...option, animation: false, aria: { enabled: true, decal: { show: true } } });
    const observer = new ResizeObserver(() => {
      if (!c.isDisposed() && ref.current?.clientWidth && ref.current.clientHeight) c.resize();
    });
    observer.observe(ref.current!);
    return () => {
      observer.disconnect();
      c.dispose();
    };
  }, [option]);
  return (
    <figure className="research-chart" aria-label={label}>
      <figcaption>{label} · equivalent rows below</figcaption>
      <div role="img" aria-label={label} ref={ref} />
    </figure>
  );
}
