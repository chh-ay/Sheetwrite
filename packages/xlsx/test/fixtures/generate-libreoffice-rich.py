import json
import pathlib
import uno
from com.sun.star.beans import PropertyValue
from com.sun.star.sheet.ValidationType import DECIMAL
from com.sun.star.sheet.ConditionOperator import BETWEEN
from com.sun.star.table.CellHoriJustify import CENTER
from com.sun.star.awt.FontWeight import BOLD

RICH_OUTPUT = pathlib.Path(__file__).with_name("libreoffice-rich.xlsx").resolve()
METADATA_OUTPUT = pathlib.Path(__file__).with_name("libreoffice-metadata.xlsx").resolve()


def property_value(name, value):
    prop = PropertyValue()
    prop.Name = name
    prop.Value = value
    return prop


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
inputs = sheets.getByIndex(0)
inputs.Name = "Inputs"
sheets.insertNewByName("Calc", 1)
sheets.insertNewByName("Hidden", 2)
calc = sheets.getByName("Calc")
hidden = sheets.getByName("Hidden")

inputs.getCellRangeByName("A1:E1").DataArray = (("Input", "Double", "Styled", "Merged", "Spare"),)
for row, value in enumerate((1.0, 2.0, 3.0), start=2):
    inputs.getCellRangeByName(f"A{row}").Value = value
    inputs.getCellRangeByName(f"B{row}").Formula = f"=A{row}*2"
inputs.getCellRangeByName("C2").String = "Styled value"
styled = inputs.getCellRangeByName("C2")
styled.CharWeight = BOLD
styled.CharColor = 0x112233
styled.CellBackColor = 0xDDEEFF
styled.HoriJustify = CENTER
styled.IsTextWrapped = True
number_formats = document.NumberFormats
locale = document.CharLocale
format_key = number_formats.queryKey("$#,##0.00", locale, True)
if format_key == -1:
    format_key = number_formats.addNew("$#,##0.00", locale)
inputs.getCellRangeByName("B2:B4").NumberFormat = format_key
line = uno.createUnoStruct("com.sun.star.table.BorderLine2")
line.Color = 0x334455
line.LineWidth = 35
line.LineStyle = 1
borders = styled.TableBorder2
borders.TopLine = line
borders.IsTopLineValid = True
borders.BottomLine = line
borders.IsBottomLineValid = True
borders.LeftLine = line
borders.IsLeftLineValid = True
borders.RightLine = line
borders.IsRightLineValid = True
styled.TableBorder2 = borders

inputs.getCellRangeByName("D2:E2").merge(True)
inputs.getCellRangeByName("D2").String = "Merged cells"
validation_range = inputs.getCellRangeByName("A2:A4")
validation = validation_range.Validation
validation.Type = DECIMAL
validation.Operator = BETWEEN
validation.Formula1 = "0"
validation.Formula2 = "10"
validation.IgnoreBlankCells = True
validation.ShowErrorMessage = True
validation.ErrorMessage = "Enter 0 through 10"
validation_range.Validation = validation
note_address = uno.createUnoStruct("com.sun.star.table.CellAddress")
note_address.Sheet = 0
note_address.Column = 2
note_address.Row = 1
inputs.Annotations.insertNew(note_address, "LibreOffice-authored note")
inputs.Rows.getByIndex(2).Height = 900
inputs.Columns.getByIndex(4).IsVisible = False

calc.getCellRangeByName("A1").Formula = "=SUM(Inputs.A2:Inputs.A4)"
calc.getCellRangeByName("A2").Formula = "=Inputs.B2+Inputs.B3"
hidden.getCellRangeByName("A1").String = "hidden sheet value"
hidden.IsVisible = False

origin = uno.createUnoStruct("com.sun.star.table.CellAddress")
origin.Sheet = 0
origin.Column = 0
origin.Row = 1
document.NamedRanges.addNewByName(
    "InputAmounts", "$Inputs.$A$2:$A$4", origin, 0
)

controller = document.CurrentController
controller.setActiveSheet(inputs)
controller.freezeAtPosition(1, 1)
controller.setActiveSheet(calc)
export_properties = (
    property_value("FilterName", "Calc MS Excel 2007 XML"),
    property_value("Overwrite", True),
)
document.storeToURL(uno.systemPathToFileUrl(str(RICH_OUTPUT)), export_properties)

sheets.insertNewByName("__sheetwrite_meta__", 3)
metadata = sheets.getByName("__sheetwrite_meta__")

meta_snapshot = {
    "schemaVersion": 1,
    "documentId": "libreoffice-rich-oracle",
    "version": 42,
    "workbook": {"activeSheet": "calc"},
    "sheets": [
        {
            "id": "inputs",
            "name": "Inputs",
            "order": 0,
            "rowCount": 4,
            "columns": [
                {"key": "input", "header": "Input", "width": 80, "type": "number"},
                {"key": "double", "header": "Double", "width": 90, "type": "currency", "numberFormat": "$#,##0.00"},
                {"key": "styled", "header": "Styled", "width": 100, "type": "text"},
                {"key": "merged", "header": "Merged", "width": 100, "type": "text"},
                {"key": "spare", "header": "Spare", "width": 70, "type": "text", "visible": False},
            ],
            "cells": [],
        },
        {
            "id": "calc",
            "name": "Calc",
            "order": 1,
            "rowCount": 2,
            "columns": [{"key": "result", "header": "Result", "width": 100, "type": "number"}],
            "cells": [],
        },
        {
            "id": "hidden",
            "name": "Hidden",
            "order": 2,
            "rowCount": 1,
            "columns": [{"key": "value", "header": "Value", "width": 100, "type": "text"}],
            "cells": [],
        },
    ],
}
metadata.getCellRangeByName("A1").String = "sheetwrite-workbook-metadata-v1"
encoded = json.dumps(meta_snapshot, separators=(",", ":"))
for row, offset in enumerate(range(0, len(encoded), 30000), start=2):
    metadata.getCellByPosition(0, row - 1).String = encoded[offset : offset + 30000]
metadata.IsVisible = False


document.storeToURL(
    uno.systemPathToFileUrl(str(METADATA_OUTPUT)), export_properties
)
document.close(True)
