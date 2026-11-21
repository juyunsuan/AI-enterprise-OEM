"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import "echarts-wordcloud";

export type EChartHandle = {
  getDataURL: () => string;
};

/**
 * 通用 echarts 渲染壳：option 变化即重绘，自适应容器宽度并在卸载时销毁。
 * 通过 onReady 暴露实例，供报告页按图名回收 PNG（dataURL）拼进 PPT。
 */
export default function EChart({
  option,
  height = 320,
  onReady,
}: {
  option: Record<string, unknown>;
  height?: number;
  onReady?: (handle: EChartHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = echarts.init(hostRef.current);
    chartRef.current = chart;
    onReady?.({ getDataURL: () => chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#fff" }) });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      onReady?.(null);
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
    chartRef.current?.resize();
  }, [option]);

  return <div ref={hostRef} style={{ width: "100%", height }} />;
}
