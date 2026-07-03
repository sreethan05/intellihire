export const formatDate = (date?: string | null): string => {
  return date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
};

export interface MonthLabel {
  key: string;
  label: string;
}

export const monthsBack = (count: number): MonthLabel[] => {
  const now = new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short" }),
    };
  });
};
