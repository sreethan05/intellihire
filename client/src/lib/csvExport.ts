export function exportToCSV<T extends object>(
  data: T[],
  keys: string[],
  filename: string,
  displayHeaders?: string[]
) {
  if (!data || !data.length) return;

  const csvRows: string[] = [];

  // Headers row
  csvRows.push((displayHeaders || keys).join(","));

  // Values rows
  for (const row of data) {
    const values = keys.map((key) => {
      // Support nested paths (e.g. user.name)
      let val: unknown = row as Record<string, unknown>;
      const parts = key.split(".");
      for (const part of parts) {
        val = (val as Record<string, unknown> | null | undefined)?.[part];
      }

      const escaped = ("" + (val === null || val === undefined ? "" : val))
        .replace(/"/g, '""')
        .replace(/\n/g, " ");
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }
  
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
