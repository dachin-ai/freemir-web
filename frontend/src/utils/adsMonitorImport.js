import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import * as XLSX from 'xlsx';

dayjs.extend(customParseFormat);

const DETAIL_COL_ALIASES = ['detail', 'keterangan', 'metric', 'part', 'segment', '明细'];

const ROW_ALIASES = {
    pcCost: ['product card cost', 'product_card_cost', 'pc cost', 'product card ads'],
    pcGmv: ['product card gmv', 'product_card_gmv', 'pc gmv'],
    inCost: ['inhouse cost', 'inhouse_cost', 'internal cost', 'inhouse vd ads'],
    inGmv: ['inhouse gmv', 'inhouse_gmv', 'internal gmv', 'inhouse vd gmv'],
    exCost: ['external cost', 'external_cost', 'external vd ads'],
    exGmv: ['external gmv', 'external_gmv', 'external vd gmv', 'external affiliate vd'],
};

const VERTICAL_COLUMN_ALIASES = {
    date: ['date', 'tanggal', 'data_date', 'data date'],
    pcCost: ROW_ALIASES.pcCost,
    pcGmv: ROW_ALIASES.pcGmv,
    inCost: ROW_ALIASES.inCost,
    inGmv: ROW_ALIASES.inGmv,
    exCost: ROW_ALIASES.exCost,
    exGmv: ROW_ALIASES.exGmv,
};

const METRIC_TO_BUCKET = {
    pcCost: ['product_card', 'cost'],
    pcGmv: ['product_card', 'gmv'],
    inCost: ['inhouse', 'cost'],
    inGmv: ['inhouse', 'gmv'],
    exCost: ['external', 'cost'],
    exGmv: ['external', 'gmv'],
};

const TEMPLATE_ROW_LABELS = [
    'Product Card GMV',
    'Inhouse GMV',
    'External GMV',
    'Product Card Cost',
    'Inhouse Cost',
    'External Cost',
];

// Day-first only — never MM/DD (01/05/2026 = 1 May, not 5 Jan).
const DATE_FORMATS_DAY_FIRST = [
    'YYYY-MM-DD',
    'YYYY/MM/DD',
    'YYYY-M-D',
    'DD/MM/YYYY',
    'D/M/YYYY',
    'DD-MM-YYYY',
    'D-M-YYYY',
    'DD.MM.YYYY',
    'D.M.YYYY',
];

function normHeader(value) {
    return String(value || '').trim().toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
}

function isReasonableDate(parsed) {
    if (!parsed?.isValid?.()) return false;
    const year = parsed.year();
    return year >= 1990 && year <= 2100;
}

function formatParsedDate(parsed) {
    return isReasonableDate(parsed) ? parsed.format('YYYY-MM-DD') : null;
}

// Excel/WPS date serial range (~1990-01-01 .. 2050-12-31)
const EXCEL_SERIAL_MIN = 32874;
const EXCEL_SERIAL_MAX = 55153;

function isLikelyExcelSerial(value) {
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) return false;
    const whole = Math.round(n);
    return whole >= EXCEL_SERIAL_MIN && whole <= EXCEL_SERIAL_MAX && Math.abs(n - whole) < 1e-6;
}

function fromExcelSerial(value) {
    if (!isLikelyExcelSerial(value)) return null;
    const serial = Math.round(typeof value === 'number' ? value : Number(String(value).trim()));
    const dc = XLSX.SSF?.parse_date_code?.(serial);
    if (!dc?.y) return null;
    return formatParsedDate(dayjs(new Date(dc.y, dc.m - 1, dc.d, dc.H || 0, dc.M || 0, dc.S || 0)));
}

function normalizeDateInput(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim().replace(/\u00a0/g, ' ');
    if (!raw) return null;
    return raw.split(/\s+/)[0];
}

function parseDateFromString(raw) {
    for (const fmt of DATE_FORMATS_DAY_FIRST) {
        const parsed = formatParsedDate(dayjs(raw, fmt, true));
        if (parsed) return parsed;
    }

    const yearFirst = fromYearFirstDelimited(raw);
    if (yearFirst) return yearFirst;

    const dayFirst = fromDayFirstDelimited(raw);
    if (dayFirst) return dayFirst;

    return null;
}

function parseDateCell(value) {
    const normalized = normalizeDateInput(value);
    if (normalized === null) return null;

    if (typeof normalized === 'number') {
        return fromExcelSerial(normalized);
    }

    if (normalized instanceof Date) {
        return formatParsedDate(dayjs(normalized));
    }

    const excelFromText = fromExcelSerial(normalized);
    if (excelFromText) return excelFromText;

    return parseDateFromString(normalized);
}

function fromDayFirstDelimited(raw) {
    const match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (match[3].length === 2) {
        year += year < 50 ? 2000 : 1900;
    }

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return formatParsedDate(dayjs(iso, 'YYYY-MM-DD', true));
}

function fromYearFirstDelimited(raw) {
    const match = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return formatParsedDate(dayjs(iso, 'YYYY-MM-DD', true));
}

function mapRowLabel(label) {
    const h = normHeader(label);
    if (!h) return null;
    return Object.entries(ROW_ALIASES).find(([, aliases]) => aliases.includes(h))?.[0] || null;
}

function emptyRecord() {
    return {
        product_card: { cost: 0, gmv: 0 },
        inhouse: { cost: 0, gmv: 0 },
        external: { cost: 0, gmv: 0 },
    };
}

function recordsFromByDate(byDate) {
    return Object.entries(byDate)
        .map(([data_date, segments]) => ({ data_date, ...segments }))
        .sort((a, b) => a.data_date.localeCompare(b.data_date));
}

function isTransposedFormat(matrix) {
    const row0 = matrix[0] || [];
    const first = normHeader(row0[0]);
    if (DETAIL_COL_ALIASES.includes(first)) return true;
    const hasDateHeader = row0.slice(1).some((cell) => parseDateCell(cell));
    const row1Metric = mapRowLabel(matrix[1]?.[0]);
    return hasDateHeader && !!row1Metric;
}

function parseTransposed(matrix) {
    let headerRowIdx = matrix.findIndex((row) => {
        const first = normHeader(row?.[0]);
        if (DETAIL_COL_ALIASES.includes(first)) return true;
        return row?.slice(1).some((cell) => parseDateCell(cell));
    });
    if (headerRowIdx < 0) {
        throw new Error('Missing Detail row with date columns');
    }

    const headerRow = matrix[headerRowIdx];
    const dateCols = [];
    for (let c = 1; c < headerRow.length; c += 1) {
        const dataDate = parseDateCell(headerRow[c]);
        if (dataDate) dateCols.push({ col: c, date: dataDate });
    }
    if (!dateCols.length) {
        throw new Error('No valid date columns found');
    }

    const byDate = {};
    dateCols.forEach(({ date }) => {
        byDate[date] = emptyRecord();
    });

    for (let r = headerRowIdx + 1; r < matrix.length; r += 1) {
        const row = matrix[r];
        if (!row || row.every((cell) => cell === '' || cell === null)) continue;

        const metricKey = mapRowLabel(row[0]);
        if (!metricKey) continue;

        const [bucket, field] = METRIC_TO_BUCKET[metricKey];
        dateCols.forEach(({ col, date }) => {
            byDate[date][bucket][field] = parseNumber(row[col]);
        });
    }

    return recordsFromByDate(byDate);
}

function mapVerticalHeaders(headerRow) {
    const mapping = {};
    headerRow.forEach((cell, idx) => {
        const h = normHeader(cell);
        if (!h) return;
        Object.entries(VERTICAL_COLUMN_ALIASES).forEach(([key, aliases]) => {
            if (aliases.includes(h)) mapping[key] = idx;
        });
    });
    const required = ['date', 'pcCost', 'pcGmv', 'inCost', 'inGmv', 'exCost', 'exGmv'];
    const missing = required.filter((k) => mapping[k] === undefined);
    if (missing.length) {
        throw new Error(`Missing columns: ${missing.join(', ')}`);
    }
    return mapping;
}

function parseVertical(matrix) {
    let headerRowIdx = matrix.findIndex((row) => (
        row.some((cell) => VERTICAL_COLUMN_ALIASES.date.includes(normHeader(cell)))
    ));
    if (headerRowIdx < 0) headerRowIdx = 0;

    const colMap = mapVerticalHeaders(matrix[headerRowIdx]);
    const records = [];
    const errors = [];

    for (let i = headerRowIdx + 1; i < matrix.length; i += 1) {
        const row = matrix[i];
        if (!row || row.every((cell) => cell === '' || cell === null)) continue;

        const dataDate = parseDateCell(row[colMap.date]);
        if (!dataDate) {
            errors.push(`Row ${i + 1}: invalid date`);
            continue;
        }

        records.push({
            data_date: dataDate,
            product_card: {
                cost: parseNumber(row[colMap.pcCost]),
                gmv: parseNumber(row[colMap.pcGmv]),
            },
            inhouse: {
                cost: parseNumber(row[colMap.inCost]),
                gmv: parseNumber(row[colMap.inGmv]),
            },
            external: {
                cost: parseNumber(row[colMap.exCost]),
                gmv: parseNumber(row[colMap.exGmv]),
            },
        });
    }

    if (!records.length) {
        throw new Error(errors[0] || 'No valid rows found');
    }

    return { records, errors };
}

function cellDisplayValue(cell) {
    if (!cell) return '';

    if (cell.t === 'n' && isLikelyExcelSerial(cell.v)) {
        return cell.v;
    }

    if (cell.t === 'd' && cell.v instanceof Date) {
        return cell.v;
    }

    if (cell.t === 's') {
        const text = String(cell.v ?? cell.w ?? '').trim();
        if (isLikelyExcelSerial(text)) return Number(text);
        return text;
    }

    if (cell.w != null && String(cell.w).trim() !== '') {
        const text = String(cell.w).trim();
        if (isLikelyExcelSerial(text)) return Number(text);
        return text;
    }

    if (typeof XLSX.utils.format_cell === 'function') {
        const formatted = XLSX.utils.format_cell(cell);
        if (formatted && String(formatted).trim() !== '') {
            const text = String(formatted).trim();
            if (isLikelyExcelSerial(text)) return Number(text);
            return text;
        }
    }

    if (typeof cell.v === 'number' && isLikelyExcelSerial(cell.v)) {
        return cell.v;
    }

    return cell.v ?? '';
}

function sheetToMatrix(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet?.['!ref']) return [];

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const matrix = [];

    for (let r = range.s.r; r <= range.e.r; r += 1) {
        const row = [];
        for (let c = range.s.c; c <= range.e.c; c += 1) {
            const addr = XLSX.utils.encode_cell({ r, c });
            row.push(cellDisplayValue(sheet[addr]));
        }
        matrix.push(row);
    }

    return matrix;
}

function setTextCell(ws, ref, value) {
    ws[ref] = { t: 's', v: String(value), w: String(value) };
}

function dayjsFromDdMmYyyy(dateStr) {
    return dayjs(dateStr, 'DD/MM/YYYY', true);
}

function excelSerialFromDate(dateStr) {
    const parsed = dayjsFromDdMmYyyy(dateStr);
    if (!parsed.isValid()) return null;
    const epoch = dayjs('1899-12-30');
    return parsed.startOf('day').diff(epoch, 'day');
}

function setDateCell(ws, ref, dateStr) {
    const serial = excelSerialFromDate(dateStr);
    if (serial == null) {
        setTextCell(ws, ref, dateStr);
        return;
    }
    ws[ref] = { t: 'n', v: serial, z: 'dd/mm/yyyy' };
}

export function downloadImportTemplate(t) {
    const detailLabel = t ? t('adsMonitor.import.templateDetail') : 'Detail';
    const rowLabels = t
        ? [
            t('adsMonitor.import.templatePcGmv'),
            t('adsMonitor.import.templateInGmv'),
            t('adsMonitor.import.templateExGmv'),
            t('adsMonitor.import.templatePcCost'),
            t('adsMonitor.import.templateInCost'),
            t('adsMonitor.import.templateExCost'),
        ]
        : TEMPLATE_ROW_LABELS;
    const dates = ['01/05/2026', '02/05/2026', '03/05/2026'];
    const zeroes = dates.map(() => 0);

    const ws = XLSX.utils.aoa_to_sheet([
        [detailLabel, ...dates],
        ...rowLabels.map((label) => [label, ...zeroes]),
    ]);

    setTextCell(ws, 'A1', detailLabel);
    dates.forEach((date, idx) => {
        setDateCell(ws, XLSX.utils.encode_cell({ r: 0, c: idx + 1 }), date);
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import');
    XLSX.writeFile(wb, 'ads-monitor-import-template.xlsx');
}

export function parseImportFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });
                const matrix = sheetToMatrix(workbook);
                if (!matrix.length) {
                    reject(new Error('Empty file'));
                    return;
                }

                let records;
                let errors = [];

                if (isTransposedFormat(matrix)) {
                    records = parseTransposed(matrix);
                } else {
                    const result = parseVertical(matrix);
                    records = result.records;
                    errors = result.errors;
                }

                if (!records.length) {
                    reject(new Error(errors[0] || 'No valid data found'));
                    return;
                }

                resolve({ records, errors, rowCount: records.length });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}
