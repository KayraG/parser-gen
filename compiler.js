// Dilin kendi gramerini json dosyası haline getirmek için
// elle yaptığım compiler.
// rule.js'i import ediyor, yani Engine kullanmıyor
// Bu compilerın çalışıyor olması lazım.

const {
  add: { rule: r, str: s, range, option: opt, seq, macro },
  create: { rule: newr },
  match,
} = require("./rule");

const asttypes = { ident: 0, str: 1, range: 2, seq: 3, option: 4, macro: 5 };

newr("alpha", range("a", "z"));
newr("decimal", range("0", "9"));
newr(
  "ident",
  seq(r("alpha"), macro("zero_or_more", opt(r("alpha"), r("decimal"), s("_")))),
  (list) => ({ type: asttypes.ident, value: [list[0], ...list[1]].join("") })
);
newr("str", seq(s('"'), macro("any_until", s('"'))), (list) => ({
  type: asttypes.str,
  value: list[1].join(""),
}));
newr("range", seq(r("str"), s("-"), r("str")), (list) => ({
  type: asttypes.range,
  value: [list[0].value, list[2].value],
}));
newr("grouped", seq(s("("), r("match"), s(")")), (list) => list[1]);
newr(
  "option",
  macro("one_or_more", seq(s("|"), macro("ws"), r("match"), macro("ws"))),
  (list) => ({
    type: asttypes.option,
    value: list.map((x) => x[1]),
  })
);
newr(
  "macro",
  seq(s("*"), r("ident"), macro("optional", seq(s("("), r("match"), s(")")))),
  (list) => ({
    type: asttypes.macro,
    value: list[2] ? [list[1].value, list[2][1]] : list[1].value,
  })
);
newr(
  "match",
  seq(
    opt(
      r("ident"),
      r("str"),
      r("range"),
      r("grouped"),
      r("option"),
      r("macro")
    ),
    macro("ws"),
    macro("optional", seq(s(","), macro("ws"), r("match")))
  ),
  (list) => {
    let sec = list[1];
    if (!sec) return list[0];
    sec = sec[1];
    if (sec.type == asttypes.seq) {
      sec = sec.value;
    } else sec = [sec];
    return {
      type: asttypes.seq,
      value: [list[0], ...sec],
    };
  }
);
newr("pp", seq(s("{"), r("ident"), s("}")), (list) => list[1].value);
newr(
  "stmt",
  seq(
    r("ident"),
    s(":"),
    macro("ws"),
    r("match"),
    macro("optional", seq(macro("ws"), r("pp")))
  ),
  (list) => ({
    name: list[0].value,
    value: list[2],
    postprocessor: list[3] ? list[3][0] : null,
  })
);
newr("file", macro("zero_or_more", seq(macro("ws"), r("stmt"))), (list) =>
  list.reduce((acc, stmt) => acc.concat(stmt[0]), [])
);

let test = r("file");

let file = process.argv[2];
if (file) {
  const fs = require("fs");
  fs.readFile(file, (err, data) => {
    if (!err) {
      let result = match(test, data.toString());
      fs.writeFileSync("./test/self.output.json", JSON.stringify(result[2]));
    }
  });
}
