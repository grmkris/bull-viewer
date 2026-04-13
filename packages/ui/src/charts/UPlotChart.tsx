"use client";

import { useEffect, useRef } from "react";
import uPlot from "uplot";
import type { Options, AlignedData } from "uplot";

import "uplot/dist/uPlot.min.css";
import { readChartTheme } from "./themeColors.ts";

export interface UPlotChartProps {
  data: AlignedData;
  series: Options["series"];
  height?: number;
  syncKey?: string;
  /** Optional overrides for axes / scales */
  options?: Partial<Omit<Options, "data" | "width" | "height" | "series">>;
}

export function UPlotChart({
  data,
  series,
  height = 220,
  syncKey,
  options,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  // Initial create + width-resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const theme = readChartTheme();

    const opts: Options = {
      width: el.clientWidth || 600,
      height,
      series,
      cursor: syncKey
        ? {
            sync: {
              key: syncKey,
              setSeries: true,
            },
          }
        : undefined,
      axes: [
        {
          stroke: theme.mutedForeground,
          grid: { stroke: theme.gridline, width: 1 },
          ticks: { stroke: theme.gridline, width: 1 },
          font: '10px "Geist Variable", system-ui, sans-serif',
          values: (_self, ticks) =>
            ticks.map((t) => {
              const d = new Date(t * 1000);
              const hh = d.getHours().toString().padStart(2, "0");
              const mm = d.getMinutes().toString().padStart(2, "0");
              return `${hh}:${mm}`;
            }),
        },
        {
          stroke: theme.mutedForeground,
          grid: { stroke: theme.gridline, width: 1 },
          ticks: { stroke: theme.gridline, width: 1 },
          font: '10px "Geist Variable", system-ui, sans-serif',
          size: 36,
        },
      ],
      ...options,
    };

    const plot = new uPlot(opts, data, el);
    plotRef.current = plot;

    const resizeObserver = new ResizeObserver(() => {
      if (plotRef.current && el.clientWidth > 0) {
        plotRef.current.setSize({
          width: el.clientWidth,
          height,
        });
      }
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
    // We intentionally only re-create on series identity change, NOT data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, syncKey, height]);

  // Update data without recreating
  useEffect(() => {
    plotRef.current?.setData(data);
  }, [data]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
