"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { BrandStatTrendPoint } from "@enterprise/contracts";

/**
 * 商城趋势图：订单数与顾客数走左轴，销售额走右轴。
 *
 * 两条量级差很大的线放同一个 y 轴会把订单压成直线，所以拆双轴；
 * 日期直接用车端 `YYYY-MM-DD` 原文，不再二次格式化，避免时区把首尾日错位。
 */
export function BrandTrendChart({
  points,
  height = 300,
}: {
  points: BrandStatTrendPoint[];
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = echarts.init(hostRef.current);
    chartRef.current = chart;
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(
      {
        tooltip: { trigger: "axis" },
        legend: { data: ["订单数", "销售额", "新顾客"] },
        grid: { left: 48, right: 56, top: 40, bottom: 32 },
        xAxis: { type: "category", data: points.map((item) => item.date) },
        yAxis: [
          { type: "value", name: "笔 / 人", minInterval: 1 },
          { type: "value", name: "金额", axisLabel: { formatter: "¥{value}" } },
        ],
        series: [
          {
            name: "订单数",
            type: "line",
            smooth: true,
            data: points.map((item) => item.orderCount),
          },
          {
            name: "销售额",
            type: "line",
            smooth: true,
            yAxisIndex: 1,
            data: points.map((item) => item.orderAmount),
          },
          {
            name: "新顾客",
            type: "bar",
            data: points.map((item) => item.customerCount),
            barMaxWidth: 18,
            itemStyle: { opacity: 0.35 },
          },
        ],
      },
      true,
    );
    chartRef.current?.resize();
  }, [points]);

  return <div ref={hostRef} style={{ width: "100%", height }} />;
}
