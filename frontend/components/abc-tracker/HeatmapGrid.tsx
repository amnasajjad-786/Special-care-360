"use client";

import React from "react";
import { HeatmapCell } from "@/types";

interface Props {
  data: HeatmapCell[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SEVERITIES = [1, 2, 3, 4, 5];

const SEV_COLORS = [
  "",
  "#7bc4c4",
  "#b8d8a8",
  "#d69e2e",
  "#ed8936",
  "#e53e3e",
];

const SEV_LABELS = [
  "",
  "Very Low",
  "Low",
  "Moderate",
  "High",
  "Severe",
];

export default function HeatmapGrid({ data }: Props) {
  const getCell = (day: string, sev: number) =>
    data.find((c) => c.day === day && c.severity === sev) || {
      day,
      severity: sev,
      count: 0,
    };

  const maxCount = Math.max(...data.map((c) => c.count), 1);

  return (
    <div className="glass-card" style={{ padding: "20px" }}>
      <h3
        style={{
          margin: "0 0 16px",
          fontWeight: 700,
          color: "var(--primary-dark)",
          fontSize: "0.95rem",
        }}
      >
        📊 Incident Heatmap
      </h3>

      {/* Grid */}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px repeat(7, 1fr)",
            gap: "4px",
            minWidth: "360px",
          }}
        >
          {/* Header row */}
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--text-secondary)",
            }}
          />

          {DAYS.map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--text-secondary)",
                padding: "4px 0",
              }}
            >
              {d}
            </div>
          ))}

          {/* Severity rows */}
          {SEVERITIES.map((sev) => (
            <React.Fragment key={sev}>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: SEV_COLORS[sev],
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {SEV_LABELS[sev]}
              </div>

              {DAYS.map((day) => {
                const cell = getCell(day, sev);

                const opacity =
                  cell.count === 0
                    ? 0.05
                    : 0.15 + (cell.count / maxCount) * 0.85;

                return (
                  <div
                    key={`${day}-${sev}`}
                    title={`${day} Sev ${sev}: ${cell.count} incidents`}
                    style={{
                      height: "36px",
                      borderRadius: "6px",
                      background:
                        cell.count === 0
                          ? "rgba(0,0,0,0.04)"
                          : SEV_COLORS[sev],
                      opacity: cell.count === 0 ? 1 : opacity,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color:
                        cell.count > 0
                          ? "white"
                          : "var(--text-secondary)",
                      cursor: "default",
                      transition: "transform 0.15s",
                      border: "1px solid rgba(255,255,255,0.3)",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.transform = "scale(1.08)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.transform = "scale(1)")
                    }
                  >
                    {cell.count > 0 ? cell.count : ""}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          marginTop: "14px",
          flexWrap: "wrap",
        }}
      >
        {SEVERITIES.map((sev) => (
          <div
            key={sev}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "3px",
                background: SEV_COLORS[sev],
              }}
            />
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
              }}
            >
              Sev {sev}
            </span>
          </div>
        ))}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "3px",
              background: "rgba(0,0,0,0.06)",
            }}
          />
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--text-secondary)",
            }}
          >
            None
          </span>
        </div>
      </div>
    </div>
  );
}
