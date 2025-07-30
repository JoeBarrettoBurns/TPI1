// src/utils/csvExport.js

function convertToCSV(data, headers) {
    const headerRow = headers.map(h => h.label).join(',');
    const bodyRows = data.map(row => {
        return headers.map(header => {
            let value = row[header.key] ?? '';
            if (typeof value === 'string') {
                // Escape quotes by doubling them and enclose in quotes if it contains a comma, quote, or newline
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value.replace(/"/g, '""')}"`;
                }
            }
            return value;
        }).join(',');
    });
    return [headerRow, ...bodyRows].join('\n');
}

export function exportToCSV(data, headers, filename) {
    if (!data || data.length === 0) {
        alert("No data to export.");
        return;
    }
    const csvString = convertToCSV(data, headers);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}