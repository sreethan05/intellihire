import { type LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  color?: string;
  bgColor?: string;
  trend?: string;
}

export default function StatsCard({ title, value, icon: Icon, description, color = "#3b82f6", bgColor = "#dbeafe", trend }: StatsCardProps) {
  return (
    <div style={{
      background: "white", borderRadius: 8, padding: "20px 22px",
      border: "1px solid #e2e8f0", position: "relative", overflow: "hidden",
      boxShadow: "0 1px 2px rgba(15,23,42,0.04)"
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</p>
          <p style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", lineHeight: 1 }}>{value}</p>
        </div>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: bgColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={20} color={color} />
        </div>
      </div>
      {(description || trend) && (
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
          {trend && <span style={{ color: "#16a34a", fontWeight: 600 }}>{trend} </span>}
          {description}
        </p>
      )}
    </div>
  );
}
