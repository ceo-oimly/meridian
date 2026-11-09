/** Quote a CSV cell when needed (commas, quotes, line breaks). */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Free text (descriptions, names) is user-controlled. A cell that starts with = + - @ can run as a
 * formula when opened in Excel/Sheets ("CSV injection"), so prefix those with an apostrophe.
 * Do NOT use this on numeric columns: negative amounts start with "-".
 */
export function csvSafeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
