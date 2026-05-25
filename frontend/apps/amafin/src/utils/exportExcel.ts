import ExcelJS from 'exceljs';
import type { ColumnDef } from '@amafin/ui';

const isMoneyField = (k: string) => /montant|amount|solde|interet|limit|cout|prix/i.test(k);
const isDateField = (k: string) => /date|echeance|ech|created|enregistrement/i.test(k);
const isPercentField = (k: string) => /taux|percent|vol/i.test(k);

/**
 * Export data to a beautifully formatted Excel (.xlsx) file.
 *
 * Features:
 *  - Branded title row with Amafin gradient
 *  - Metadata row (date, row count)
 *  - Styled header: indigo background, white bold text, frozen row
 *  - Auto-width columns
 *  - Zebra striping
 *  - Currency/date/percent formatting
 *  - Totals row for money columns
 *  - Borders + filters
 */
export async function exportToExcel({
  filename, sheetName, title, columns, data,
}: {
  filename: string;
  sheetName: string;
  title: string;
  columns: ColumnDef[];
  data: Record<string, unknown>[];
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Amafin';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 4 }],   // freeze first 4 rows (title + meta + header)
    properties: { tabColor: { argb: 'FF6366F1' } },
  });

  // ── Row 1: Branded Title ──
  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `◆ AMAFIN — ${title}`;
  titleCell.font = { name: 'Inter', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'gradient',
    gradient: 'angle',
    degree: 0,
    stops: [
      { position: 0, color: { argb: 'FF6366F1' } },
      { position: 1, color: { argb: 'FF8B5CF6' } },
    ],
  };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  sheet.getRow(1).height = 40;

  // ── Row 2: Metadata ──
  sheet.mergeCells(2, 1, 2, columns.length);
  const metaCell = sheet.getCell(2, 1);
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  metaCell.value = `Exporté le ${today}  •  ${data.length} enregistrement${data.length > 1 ? 's' : ''}`;
  metaCell.font = { name: 'Inter', size: 10, italic: true, color: { argb: 'FF71717A' } };
  metaCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
  sheet.getRow(2).height = 22;

  // ── Row 3: Empty spacer ──
  sheet.getRow(3).height = 5;

  // ── Row 4: Column Headers ──
  const headerRow = sheet.getRow(4);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1E22' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF27272A' } },
      bottom: { style: 'thin', color: { argb: 'FF27272A' } },
    };
  });
  headerRow.height = 28;

  // ── Data rows ──
  data.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(5 + rowIdx);
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const val = row[col.key];

      // Set value + format based on field type
      if (val == null || val === '') {
        cell.value = '';
      } else if (isMoneyField(col.key) || col.format === 'currency') {
        const num = typeof val === 'string' ? parseFloat(val) : val as number;
        cell.value = isNaN(num) ? val as string : num;
        cell.numFmt = '#,##0.00 "DHS"';
        cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      } else if (isPercentField(col.key)) {
        const num = typeof val === 'string' ? parseFloat(val) : val as number;
        cell.value = isNaN(num) ? val as string : num / 100;
        cell.numFmt = '0.00%';
        cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      } else if (col.type === 'date' || isDateField(col.key)) {
        const str = String(val);
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
          cell.value = new Date(str);
          cell.numFmt = 'dd/mm/yyyy';
        } else {
          cell.value = str;
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (col.type === 'select' && col.choices?.length) {
        const match = col.choices.find(ch => String(ch.value) === String(val));
        cell.value = match?.label ?? String(val);
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      } else {
        cell.value = String(val);
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }

      cell.font = { name: 'Inter', size: 10, color: { argb: 'FF18181B' } };

      // Zebra striping
      if (rowIdx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
      }

      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE4E4E7' } },
      };
    });
    excelRow.height = 22;
  });

  // ── Totals row for money columns ──
  if (data.length > 0) {
    const totalRow = sheet.getRow(5 + data.length);
    const firstCell = totalRow.getCell(1);
    firstCell.value = 'TOTAL';
    firstCell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    firstCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
    firstCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    firstCell.border = { top: { style: 'medium', color: { argb: 'FF4F46E5' } } };

    columns.forEach((col, i) => {
      if (i === 0) return;
      const cell = totalRow.getCell(i + 1);
      if (isMoneyField(col.key)) {
        const sum = data.reduce((s, row) => {
          const v = row[col.key];
          const num = typeof v === 'string' ? parseFloat(v) : v as number;
          return s + (isNaN(num) ? 0 : num);
        }, 0);
        cell.value = sum;
        cell.numFmt = '#,##0.00 "DHS"';
        cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        cell.font = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
      cell.border = { top: { style: 'medium', color: { argb: 'FF4F46E5' } } };
    });
    totalRow.height = 28;
  }

  // ── Auto-width columns ──
  columns.forEach((col, i) => {
    const header = col.label;
    const maxLen = Math.max(
      header.length,
      ...data.slice(0, 100).map(row => String(row[col.key] ?? '').length),
    );
    sheet.getColumn(i + 1).width = Math.min(Math.max(maxLen + 4, 12), 40);
  });

  // ── Enable filter on header row ──
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length },
  };

  // ── Download ──
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `${filename}_${dateStr}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
