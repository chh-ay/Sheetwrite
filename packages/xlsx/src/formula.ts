const EXTERNAL_DATA_FUNCTION =
  /(^|[^A-Z0-9_.])(DDE|RTD|WEBSERVICE|FILTERXML|CUBEMEMBER|CUBEVALUE|CUBESET|CUBESETCOUNT|CUBERANKEDMEMBER)\s*\(/i;
const EXTERNAL_BOOK_TOKEN = /\[(?:\d+|[^\]]+\.(?:xlsx?|xlsm|xlsb|xlam|ods|csv))\]/i;

/** Detect formula constructs that would keep an external workbook/data source live. */
export function formulaContainsExternalReference(formula: string): boolean {
  let executable = "";
  for (let index = 0; index < formula.length; ) {
    if (formula[index] !== '"') {
      executable += formula[index]!;
      index += 1;
      continue;
    }
    executable += " ";
    index += 1;
    while (index < formula.length) {
      if (formula[index] === '"' && formula[index + 1] === '"') {
        index += 2;
      } else if (formula[index] === '"') {
        index += 1;
        break;
      } else {
        index += 1;
      }
    }
  }
  return EXTERNAL_BOOK_TOKEN.test(executable) || EXTERNAL_DATA_FUNCTION.test(executable);
}
