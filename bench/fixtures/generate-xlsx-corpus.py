"""Generate the committed XLSX benchmark corpus with LibreOffice UNO.

Run a local LibreOffice listener first:
  libreoffice --headless --accept=socket,host=127.0.0.1,port=2002;urp;StarOffice.ServiceManager
Then run this file with the system Python that provides `uno`.
"""

import pathlib
import sys
import re
import zipfile

import uno
from com.sun.star.awt.FontWeight import BOLD
from com.sun.star.beans import PropertyValue
from com.sun.star.table.CellHoriJustify import CENTER, RIGHT


OUTPUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).with_name("xlsx-codec-corpus.xlsx")).resolve()
SHARED_VALUES = (
    "pending",
    "approved",
    "rejected",
    "in review",
    "needs follow-up",
    "archived",
    "unassigned",
    "complete",
)


def property_value(name, value):
    result = PropertyValue()
    result.Name = name
    result.Value = value
    return result


def fill_data(sheet, rows, make_row, chunk_rows=500):
    for start in range(0, rows, chunk_rows):
        stop = min(rows, start + chunk_rows)
        values = tuple(make_row(row) for row in range(start, stop))
        sheet.getCellRangeByPosition(0, start, len(values[0]) - 1, stop - 1).DataArray = values


def apply_styles(sheet, rows):
    style_ranges = [
        sheet.getCellRangeByPosition(0, 0, 1, rows - 1),
        sheet.getCellRangeByPosition(2, 0, 3, rows - 1),
        sheet.getCellRangeByPosition(4, 0, 5, rows - 1),
        sheet.getCellRangeByPosition(6, 0, 7, rows - 1),
    ]
    style_ranges[0].CharWeight = BOLD
    style_ranges[0].CharColor = 0x112233
    style_ranges[0].CellBackColor = 0xDDEEFF
    style_ranges[0].HoriJustify = CENTER
    style_ranges[1].CharPosture = uno.Enum("com.sun.star.awt.FontSlant", "ITALIC")
    style_ranges[1].CharColor = 0x773311
    style_ranges[1].CellBackColor = 0xFFF2CC
    style_ranges[1].IsTextWrapped = True
    style_ranges[2].CharColor = 0x1F4E78
    style_ranges[2].HoriJustify = RIGHT
    style_ranges[3].CharWeight = BOLD
    style_ranges[3].CharColor = 0xFFFFFF
    style_ranges[3].CellBackColor = 0x548235


def canonicalize_package(path):
    temporary = path.with_suffix(".canonical.xlsx")
    with zipfile.ZipFile(path, "r") as source:
        parts = [(name, source.read(name)) for name in sorted(source.namelist())]
    with zipfile.ZipFile(
        temporary,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
        strict_timestamps=False,
    ) as output:
        for name, content in parts:
            if name == "docProps/core.xml":
                for element in (b"created", b"modified"):
                    content = re.sub(
                        rb"(<dcterms:" + element + rb"\b[^>]*>).*?(</dcterms:" + element + rb">)",
                        rb"\g<1>2000-01-01T00:00:00Z\g<2>",
                        content,
                    )
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            output.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    temporary.replace(path)


def main():
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local
    )
    context = resolver.resolve(
        "uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext"
    )
    desktop = context.ServiceManager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", context
    )
    document = desktop.loadComponentFromURL("private:factory/scalc", "_blank", 0, ())
    sheets = document.Sheets
    scalar = sheets.getByIndex(0)
    scalar.Name = "Scalar"
    sheets.insertNewByName("Rich", 1)
    sheets.insertNewByName("Shared style", 2)
    sheets.insertNewByName("Sparse", 3)
    rich = sheets.getByName("Rich")
    shared_style = sheets.getByName("Shared style")
    sparse = sheets.getByName("Sparse")

    fill_data(
        scalar,
        10_000,
        lambda row: (
            float(row),
            row * 1.25 - 400,
            "TRUE" if row % 2 == 0 else "FALSE",
            f"row-{row:06d}",
            SHARED_VALUES[row % len(SHARED_VALUES)],
            "" if row % 11 == 0 else float(row + 45_000),
            f"group-{row % 97}",
            (row % 10_000) / 100,
        ),
    )
    scalar.getCellRangeByPosition(0, 0, 7, 0).CharWeight = BOLD
    scalar.getCellRangeByPosition(0, 0, 7, 0).CellBackColor = 0xD9EAF7
    scalar.getCellRangeByPosition(0, 0, 7, 0).IsTextWrapped = True

    fill_data(
        rich,
        5_000,
        lambda row: tuple(
            float(row * (col + 1)) if col % 2 == 0 else f"rich-{row % 251}-{col}"
            for col in range(8)
        ),
    )
    apply_styles(rich, 5_000)
    for row in range(0, 5_000, 250):
        address = uno.createUnoStruct("com.sun.star.table.CellAddress")
        address.Sheet = 1
        address.Column = 1
        address.Row = row
        rich.Annotations.insertNew(address, f"Deterministic note {row}")
    for row in range(10, 5_000, 500):
        rich.getCellRangeByPosition(2, row, 3, row).merge(True)

    fill_data(
        shared_style,
        10_000,
        lambda row: tuple(
            SHARED_VALUES[(row + col) % len(SHARED_VALUES)] for col in range(8)
        ),
    )
    apply_styles(shared_style, 10_000)

    for index in range(2_000):
        row = (index * 999_983) // 1_999
        col = (index * 29) % 4
        cell = sparse.getCellByPosition(col, row)
        if index % 3 == 0:
            cell.String = f"sparse-{index}"
        else:
            cell.Value = float(index)

    for sheet, column_count in (
        (scalar, 8),
        (rich, 8),
        (shared_style, 8),
        (sparse, 4),
    ):
        for col in range(column_count):
            sheet.Columns.getByIndex(col).Width = 2_500 + (col % 4) * 350

    document.CurrentController.setActiveSheet(scalar)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document.storeToURL(
        uno.systemPathToFileUrl(str(OUTPUT)),
        (
            property_value("FilterName", "Calc MS Excel 2007 XML"),
            property_value("Overwrite", True),
        ),
    )
    document.close(True)
    canonicalize_package(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
