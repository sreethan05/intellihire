/**
 * Helper to export an array of JSON objects to a downloadable CSV file.
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows || !rows.length) {
    return;
  }

  const keys = Object.keys(rows[0]);
  const csvContent = [
    // Header row
    keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(","),
    // Data rows
    ...rows.map((row) =>
      keys
        .map((key) => {
          const raw = row[key];
          const val =
            raw === null || raw === undefined
              ? ""
              : typeof raw === "object"
                ? JSON.stringify(raw)
                : String(raw);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
