// Bu kısımda Json'a derlenmiş gramer bilgisini
// engine yükleyerek bunun üzerinden parserlama işlemi
// yaparak sistemi test ediyor.
// Bu kısım çalışmıyorsa ya engine bozuk yada json dosyası

const fs = require("fs");

function readFile(path) {
  return fs.readFileSync(path).toString();
}

const Engine = require("./engine"),
  grammar = JSON.parse(readFile("./test/test1.output.json"));

const engine = new Engine(grammar, "file");

engine.loadFuncs({
  string(list) {
    return { type: "string", value: list[1] };
  },
  range(list) {
    return { type: "range", start: list[0].value, end: list[2].value };
  },
  ident(list) {
    return { type: "ident", value: [list[0], ...list[1]].join("") };
  },
  group(list) {
    return list[1];
  },
  option(list) {
    return { type: "option", value: list.map((l) => l[1]) };
  },
  macro(list) {
    console.log(list);
    return { type: "macro", name: list[1], arg: list[2] || null };
  },
  seq(list) {
    return list[1]
      ? { type: "seq", item: list[0], next: list[1][1] || null }
      : list[0];
  },
  pp(list) {
    return list[1].value;
  },
  rule(list) {
    return {
      name: list[0].value,
      value: list[2],
      postprocessor: list[3] || null,
    };
  },
  number(list) {
    return { type: "number", value: list.join("") };
  }
});

let ast = engine.execute(readFile("./test/test.gr"))[2];
fs.writeFileSync("./output.json", JSON.stringify(ast));
