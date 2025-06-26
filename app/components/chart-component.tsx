"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface ChartData {
  name: string
  value: number
  percentage: number
}

interface ChartComponentProps {
  data: ChartData[]
}

const COLORS = ["#2563EB", "#3B82F6", "#60A5FA", "#93C5FD", "#DBEAFE"]

export function ChartComponent({ data }: ChartComponentProps) {
  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="name" stroke="#64748B" fontSize={12} angle={-45} textAnchor="end" height={80} />
          <YAxis stroke="#64748B" fontSize={12} />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
            formatter={(value: number, name: string) => [
              `${value} cases (${data.find((d) => d.value === value)?.percentage}%)`,
              "Count",
            ]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} animationDuration={1000} animationBegin={0}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
