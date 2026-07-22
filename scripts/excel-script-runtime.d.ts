declare namespace ExcelScript {
  type CalculationType = "fullRebuild";
  interface Application {
    calculate(type: CalculationType): void;
  }
  interface Range {
    setValue(value: string | number | boolean): void;
    setFormula(formula: string): void;
    setNumberFormat(format: string[][]): void;
    getValue(): string | number | boolean;
    getText(): string;
    getFormula(): string;
  }
  interface Worksheet {
    getName(): string;
    getRange(address: string): Range;
    delete(): void;
  }
  interface WorksheetCollection {
    add(name: string): Worksheet;
    getItems(): Worksheet[];
  }
  interface Workbook {
    getApplication(): Application;
    getWorksheets(): WorksheetCollection;
  }
}
