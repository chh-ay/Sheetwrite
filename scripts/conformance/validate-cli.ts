import { loadCorpus } from "./corpus.js";
import { sha256 } from "./normalize.js";

const corpus = await loadCorpus(process.argv[2]);
console.log(
  `Compatibility test set valid: version=${corpus.protocol} tests=${corpus.cases.length} file hash=${sha256(corpus)}`,
);
